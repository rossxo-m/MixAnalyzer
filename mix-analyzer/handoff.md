# Mix Analyzer — Phase 7 Handoff

Last updated: 2026-04-13  
Branch: `feature/phase7-prep` (merged into `main`)  
Dev server: `npm run dev` → http://localhost:5173/MixAnalyzer/ (or :5174/:5178 if port busy)  
Build: clean, 0 ESLint errors.

---

## What Phase 7 Is

Python backend + AI-powered feedback. The front-end infrastructure is already stubbed out. The main work is building the FastAPI backend and wiring the Tier 3 Claude API feedback path.

Phase 7 tasks from tracker:

| # | Task | Status |
|---|------|--------|
| P7.1 | FastAPI local server scaffold | ✅ Done |
| P7.2 | `src/api/client.js` — tier chain abstraction | ✅ Done |
| P7.3 | `.env` with `VITE_API_URL`, env-based toggle | ✅ Done |
| P7.4 | Tier 3: Claude API → structured JSON → natural language advice | ✅ Done |
| P7.5 | yt-dlp integration — SoundCloud/YouTube download endpoint | ⬜ |
| P7.6 | CLAP embeddings → genre detection | ⬜ |
| P7.7 | Demucs stem separation endpoint | ⬜ |
| P7.8 | Tier 1 feedback engine: expand 15 → 50+ rules | ⬜ |

---

## What's Already Built (don't rebuild)

### Front-end stubs (fully wired)

**`src/api/client.js`** — unified `generateFeedback(analysisData, prefs, options)`:
- `options.tier = 3` → POSTs to `VITE_API_URL/feedback` with the full analysis JSON
- Falls back to Tier 1 on any error
- `options.apiKey` → sent as `Authorization: Bearer` header
- `options.apiUrl` → overrides env URL per-call

**`src/workers/analyzeWorker.js`** — full DSP pipeline off main thread:
- Receives `{ channelData, sampleRate, duration, prefs }` via postMessage
- Returns complete analysis object (same shape as synchronous `analyze()`)
- Uses `type: 'module'` — Vite bundles it correctly
- Called via `analyzeAsync()` in `src/analysis/analyze.js`

**`.env.example`**:
```
VITE_API_URL=http://localhost:8000
```

### Analysis object shape (what the backend receives / Tier 1 consumes)
```js
{
  lufs: { integrated, shortTerm, momentary, truePeak, dr },
  stereo: { low, mid, high },          // Pearson correlation per band
  spectrum: { curve, bands7, bands3 }, // dB values
  bpm: Number,
  key: String,
  genre: String,                        // from prefs
  duration: Number,
  prefs: { lufsTarget, tpCeiling, genre, ... }
}
```

---

## Architecture Overview

```
src/
  App.jsx                    # Layout, file load, view switching, UI zoom (1×–2.5×)
  analysis/
    analyze.js               # analyzeAsync() → Worker; analyze() → synchronous fallback
    feedback.js              # Tier 1: ~15 rules today, target 50+
    genres.js                # GENRE_CURVES, interpolation, GENRE_TARGETS
  api/
    client.js                # Tier chain: 3 → 1 fallback
  canvas/
    drawers.js               # All canvas draw functions (no React deps)
  components/
    PlaybackWaveform.jsx     # Playback, RAF loop, scrub, zoom, resize — 748 lines
    SpectrumDisplay.jsx      # Static FFT spectrum + genre curve + ref overlay (Canvas)
    StereoDisplay3Band.jsx   # 3-band stereo bars
    Preferences.jsx          # Settings panel
    MetricCard.jsx / BandBar.jsx / FeedbackItem.jsx
  dsp/
    fft.js / lufs.js / truepeak.js / spectrum.js / stereo.js / bpm.js / key.js
    sharedFFT.js             # 2400-frame waveform + high-res zoom frames
    bpmWorker.js             # BPM autocorrelation Worker
  workers/
    analyzeWorker.js         # Full DSP Worker
  constants.js / theme.js
```

---

## Recent Fixes (this session — already committed)

- **M/S live spectrum**: was computing M/S from magnitude spectra (wrong — discards phase). Fixed to use `getFloatTimeDomainData`, compute `Mid=(L+R)/2` and `Side=(L-R)/2` in time domain, Hann window, FFT each independently, then magnitude. Mid and Side now show distinct correct curves.
- **M/S during scrub**: `computeScrubData` now returns `dataS` (Side FFT). `drawLiveSpec` `hasMS` guard updated to fire when `scrubData.dataS` exists. Both Mid+Side curves render during drag-scrub in M/S mode.
- **Panel info preserved on resize**: ResizeObserver and panelW useEffect now pass `scrubDataRef.current` to all meter draw calls — meters no longer blank when resizing while paused mid-scrub.
- **UI zoom cycle**: 1×/1.5×/2×/2.5× button in header, persisted in localStorage, CSS `zoom` on root div.

---

## Known Limitations (not blocking Phase 7)

- **LUFS short-term**: rolling 3s window, not true max across track
- **True Peak**: Catmull-Rom 4× approximation, not ITU FIR
- **Tier 2** (Ollama): not yet implemented — fallback goes 3 → 1 directly

---

## Phase 7 Starting Point: P7.1 + P7.4

The highest-value tasks to do first:

### P7.1 — FastAPI scaffold

Create `backend/` at the repo root:
```
backend/
  main.py          # FastAPI app, CORS, /feedback endpoint, /health
  requirements.txt # fastapi, uvicorn, anthropic, python-dotenv
  .env             # ANTHROPIC_API_KEY
```

`/feedback` endpoint:
- Receives: `{ analysis: { lufs, stereo, spectrum, bpm, key, genre, ... } }`
- Returns: `{ items: [{ type, title, body, severity }] }`
- Calls Claude API (claude-sonnet-4-6) with structured prompt

### P7.4 — Claude API prompt

Input to Claude: the full analysis JSON.  
Output expected: array of feedback items matching Tier 1 shape:
```js
[{ type: "warning"|"tip"|"info", title: String, body: String, severity: 1|2|3 }]
```

System prompt should instruct Claude to act as an EDM mixing engineer (FL Studio context), reference specific dB values from the analysis, and return valid JSON only.

---

## Key Rules (from CLAUDE.md — must follow)

1. Read before editing — never edit from memory
2. No full rewrites of files over 50 lines — surgical edits only
3. DSP math is non-negotiable — preserve biquad coefficients, FFT indexing exactly
4. Canvas: always multiply by `devicePixelRatio` — never set `canvas.width` without DPR
5. No new npm dependencies without explicit approval
6. Module purity: `src/dsp/` functions must stay stateless, no React/DOM imports
