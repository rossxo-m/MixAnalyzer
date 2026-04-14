"""
Mix Analyzer backend — Phase 7.

FastAPI local server that powers the Tier 3 feedback path for the React
front-end (`src/api/client.js`). The client POSTs a full analysis object
to `/feedback`; this server calls the Claude API with a mixing-engineer
system prompt and returns a feedback array that matches the Tier 1
shape exactly (`{ type, category, message, tip }`). The front-end
treats a non-2xx response as a tier failure and falls back to Tier 1.

Run:
    pip install -r requirements.txt
    cp .env.example .env && edit .env          # set ANTHROPIC_API_KEY
    uvicorn main:app --reload --port 8000
"""

from __future__ import annotations

import json
import logging
import os
from typing import Any, Literal, Optional

from anthropic import Anthropic, APIError
from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, ValidationError

load_dotenv()

logger = logging.getLogger("mix-analyzer")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")

MODEL = os.environ.get("MIX_ANALYZER_MODEL", "claude-sonnet-4-6")
DEFAULT_ORIGINS = [
    "http://localhost:5173", "http://127.0.0.1:5173",
    "http://localhost:5174", "http://127.0.0.1:5174",
    "http://localhost:5175", "http://127.0.0.1:5175",
    "http://localhost:5178", "http://127.0.0.1:5178",
    "http://localhost:4173", "http://127.0.0.1:4173",
]
extra = os.environ.get("EXTRA_CORS_ORIGINS", "")
ALLOWED_ORIGINS = DEFAULT_ORIGINS + [o.strip() for o in extra.split(",") if o.strip()]

app = FastAPI(title="Mix Analyzer Backend", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


# ---------- Schemas ---------------------------------------------------------

# Permissive — the client sends whatever analyze() produces; we just forward
# it to the model verbatim. Validating every nested field here would couple
# the backend to every DSP change in `src/analysis/analyze.js`.
class AnalysisPayload(BaseModel):
    analysis: dict[str, Any]


class FeedbackItem(BaseModel):
    """Must match Tier 1 shape in `src/analysis/feedback.js` exactly."""
    type: Literal["good", "info", "warning", "error"]
    category: str = Field(min_length=1, max_length=40)
    message: str = Field(min_length=1, max_length=400)
    tip: Optional[str] = Field(default=None, max_length=400)


class _ModelResponse(BaseModel):
    """Wrapper schema the model writes to — unwrapped before returning."""
    items: list[FeedbackItem] = Field(min_length=1, max_length=12)


# ---------- Prompt ----------------------------------------------------------

SYSTEM_PROMPT = """You are a senior EDM mixing and mastering engineer giving feedback on a single track. The producer uses FL Studio. Your answers are concrete, reference real measured numbers, and suggest FL Studio plugin moves (Fruity Limiter, Fruity Parametric EQ 2, Fruity Stereo Enhancer, Fruity Multiband Compressor, Soundgoodizer, Gross Beat, etc.) where appropriate.

You will receive a JSON analysis describing the mixdown:
- lufs: integrated loudness (LUFS)
- truePeak: dBTP
- lra / dynamicRange / crestFactor
- stereoBands3: [{ name, width, correlation }] for Low/Mid/High
- correlation: overall L/R correlation
- bandDistribution: 7-band energy proportions
- spectrum (curve), bpm, key
- genre target (prefs.genre) and target curve

Your job is to return a JSON object: { "items": [ ... ] } where each item is
{
  "type":    one of "good" | "info" | "warning" | "error",
  "category": short label (examples: "Loudness", "True Peak", "Dynamics", "Transients", "Sub Mono", "Mid Stereo", "High Stereo", "Phase", "Spectrum", "Clipping", "Groove"),
  "message":  one sentence diagnosing the finding; MUST reference the exact measured value (e.g. "INT -8.7 LUFS — 1.3 dB above EDM target"),
  "tip":      one sentence with a concrete fix. OPTIONAL for "good" items. Prefer FL Studio plugin names where relevant.
}

Severity rubric:
- error:   clipping, inter-sample clipping above ceiling, destructive phase cancellation (correlation < 0), sub energy in the sides (low-band width > ~10%).
- warning: loudness > 3 dB over/under genre target, over-compression (DR < 4 or LRA < 3), bass band wider than ~10%, mid band wider than ~45%, spectrum band more than 6% off target.
- info:    milder deviations, stylistic observations, stereo high-band narrower than ~5%.
- good:    metric is within healthy range for the declared genre.

Rules:
- Return between 4 and 10 items. Ordering matters — put the most impactful findings first.
- NEVER invent numbers that aren't in the analysis. Quote values to 1 decimal place.
- Use the declared genre (prefs.genre) for loudness and spectral targets, not a generic ideal.
- If a metric is missing or null, skip that category entirely.
- Do not echo the raw JSON back. Do not explain your reasoning. Do not wrap the JSON in prose.
- Output ONLY the JSON object. No code fences. No preamble.
"""


# Frontend sends the full analyze() output — including spectralWaveform (2400
# frames), spectrumPoints (~200), vectorscope (5000 points). Those arrays are
# for UI rendering, not for the model; stripping them keeps the prompt small
# and avoids spending tokens on data the model can't act on.
_SCALAR_KEYS = {
    "rmsDb", "samplePeak", "truePeak",
    "lufs", "lufsShortTerm", "lra", "crestFactor",
    "stereoWidth", "correlation",
    "dynamicRange", "clippingMs", "duration",
    "bpm", "key", "genre",
    "numChannels", "sampleRate",
}
_SUMMARY_KEYS = {"bandDistribution", "stereoBands3", "stereoBands7", "prefs"}


def sanitize_analysis(analysis: dict[str, Any]) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for k, v in analysis.items():
        if k in _SCALAR_KEYS or k in _SUMMARY_KEYS:
            out[k] = v
    return out


def build_user_prompt(analysis: dict[str, Any]) -> str:
    return (
        "Mixdown analysis:\n```json\n"
        + json.dumps(sanitize_analysis(analysis), indent=2, default=str)
        + "\n```\n\nReturn the feedback object now."
    )


# ---------- Claude call -----------------------------------------------------

def resolve_api_key(authorization: Optional[str]) -> Optional[str]:
    """Bearer header overrides env — matches the `options.apiKey` path in client.js."""
    if authorization and authorization.lower().startswith("bearer "):
        key = authorization.split(" ", 1)[1].strip()
        if key:
            return key
    return os.environ.get("ANTHROPIC_API_KEY")


def extract_json(text: str) -> dict[str, Any]:
    """Parse Claude's response. Tolerates an accidental ```json fence."""
    s = text.strip()
    if s.startswith("```"):
        # Strip first and last fence.
        first_nl = s.find("\n")
        if first_nl != -1:
            s = s[first_nl + 1 :]
        if s.endswith("```"):
            s = s[:-3]
        s = s.strip()
    return json.loads(s)


def call_claude(analysis: dict[str, Any], api_key: str) -> list[FeedbackItem]:
    client = Anthropic(api_key=api_key)

    response = client.messages.create(
        model=MODEL,
        max_tokens=2048,
        thinking={"type": "adaptive"},
        system=[
            {
                "type": "text",
                "text": SYSTEM_PROMPT,
                "cache_control": {"type": "ephemeral"},
            }
        ],
        messages=[{"role": "user", "content": build_user_prompt(analysis)}],
    )

    # Concatenate every text block — thinking blocks are ignored.
    text = "".join(b.text for b in response.content if getattr(b, "type", None) == "text")
    if not text:
        raise HTTPException(status_code=502, detail="Claude returned no text content")

    try:
        payload = extract_json(text)
    except json.JSONDecodeError as exc:
        logger.warning("Claude returned non-JSON output: %s", text[:400])
        raise HTTPException(status_code=502, detail=f"Model output was not valid JSON: {exc}") from exc

    try:
        parsed = _ModelResponse.model_validate(payload)
    except ValidationError as exc:
        logger.warning("Claude response failed schema validation: %s", exc)
        raise HTTPException(status_code=502, detail=f"Model output failed schema check: {exc}") from exc

    return parsed.items


# ---------- Routes ----------------------------------------------------------

@app.get("/health")
def health() -> dict[str, Any]:
    return {
        "status": "ok",
        "service": "mix-analyzer-backend",
        "model": MODEL,
        "has_api_key": bool(os.environ.get("ANTHROPIC_API_KEY")),
    }


@app.post("/feedback", response_model=list[FeedbackItem])
def feedback(payload: AnalysisPayload, authorization: Optional[str] = Header(default=None)) -> list[FeedbackItem]:
    api_key = resolve_api_key(authorization)
    if not api_key:
        raise HTTPException(status_code=500, detail="ANTHROPIC_API_KEY not configured")

    try:
        return call_claude(payload.analysis, api_key)
    except HTTPException:
        raise
    except APIError as exc:
        logger.exception("Anthropic API error")
        raise HTTPException(status_code=502, detail=f"Claude API error: {exc}") from exc
    except Exception as exc:
        logger.exception("Unexpected error in /feedback")
        raise HTTPException(status_code=500, detail=str(exc)) from exc
