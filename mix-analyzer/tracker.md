# Mix Analyzer — Task Tracker

Last updated: 2026-04-14  
Branch: `ui`  
Phases 1–6.9 complete. Phase 7 in progress. UI theming overhaul on `ui` branch.

---

## Status Key
- `✅ Done` — shipped
- `🔄 In Progress` — active work
- `⬜ Queued` — next up
- `💡 Want` — low priority / future

---

## Immediate: UI Responsiveness & Decoupling (0–2 weeks)

| # | Task | File(s) | Effort | Status |
|---|------|---------|--------|--------|
| S1 | Static Vectorscope: SVG → Canvas migration | `App.jsx` `Vectorscope` component | 1 day | ⬜ |
| S2 | Wrap `analyze()` in a Web Worker | `src/analysis/analyze.js` → new `src/workers/analyzeWorker.js` | 2–3 days | ✅ |
| S3 | LUFS short-term: track max across full track (not just rolling 3s window) | `src/dsp/lufs.js` | 0.5 day | ⬜ |
| S4 | Extract canvas draw functions from PlaybackWaveform.jsx into `src/canvas/` | `PlaybackWaveform.jsx` (1494 lines) | 2–3 days | ✅ |
| S5 | SpectrumDisplay: SVG → Canvas for static spectrum curve | `src/components/SpectrumDisplay.jsx` | 1–2 days | ✅ |

### Notes

**S1** — `Vectorscope` in App.jsx still renders 5000 `<circle>` SVG elements. Identical draw logic exists in PlaybackWaveform's live vectorscope. Extract and reuse `drawVectorscope()`.

**S2** — Most critical for UX on 10min+ files. `analyze()` runs synchronously and blocks the UI for 2–10 seconds. Pattern: post channel data (transferable), return full analysis object. BPM Worker pattern already proves the approach works (`bpmWorker.js`).

**S3** — One-line fix in `computeLUFS()`: track `maxShortTerm` across all blocks instead of returning only the last window's value.

**S4** — `PlaybackWaveform.jsx` at 1494 lines is the single biggest coupling risk. `drawLiveSpec`, `drawWaveform`, `drawVectorscope`, `drawLufsMeter`, `drawPhaseMeter` are pure (canvas + data in, nothing out). They can move to `src/canvas/drawers.js` with no React deps. The component keeps state, rAF loop, and event handlers only.

**S5** — SpectrumDisplay uses SVG `<polyline>` for 300-point spectrum + genre tolerance band. Low performance impact today but inconsistent with canvas-first architecture.

---

## Phase 7 — Python Backend + Neural (2–6 weeks)

| # | Task | Component | Status |
|---|------|-----------|--------|
| P7.1 | FastAPI local server scaffold | Python `backend/` | ✅ |
| P7.2 | `src/api/client.js` — feedback tier chain abstraction | `src/api/` | ✅ |
| P7.3 | `.env` with `VITE_API_URL`, env-based API toggle | Build config | ✅ |
| P7.4 | Tier 3: Claude API call — structured analysis JSON → natural language advice | `backend/main.py` | ✅ |
| P7.5 | yt-dlp integration — SoundCloud/YouTube download endpoint | Python backend | ⬜ |
| P7.6 | CLAP embeddings → genre detection | Python backend | ⬜ |
| P7.7 | Demucs stem separation endpoint | Python backend | ⬜ |
| P7.8 | Tier 1 feedback engine: expand from 15 → 50+ rules | `src/analysis/feedback.js` | ⬜ |

### Notes

**P7.2/P7.3** — `generateFeedback(data, options)` in `feedback.js` already has `_prefs` reserved in `analyze()`. Wire tier selection: Tier 3 → Tier 2 → Tier 1 fallback. Options include `{tier, apiKey, ollamaModel}`.

**P7.4** — Claude API (`claude-opus-4-6`, overridable via `MIX_ANALYZER_MODEL`). `POST /feedback` receives full analysis JSON, sanitizes to scalars + summary bands, prompts Claude with an EDM/FL Studio system prompt, and returns an array of `{type, category, message, tip}` matching Tier 1. Adaptive thinking + cache_control on the system prompt. Response schema validated with Pydantic before returning; schema/API failures bubble up as 502 so the front-end falls through to Tier 1.

**P7.8** — Current `feedback.js` has ~15 rules. Target 50–100 covering: transient preservation, mid-side correlation per genre, sub clarity vs kick, high-frequency air, crest factor context, dynamic range by genre.

---

## Phase 8 — FLP + Desktop (6–10 weeks)

| # | Task | Status |
|---|------|--------|
| P8.1 | PyFLP parser for FL Studio 20 project files | ⬜ |
| P8.2 | Parametric EQ 2 binary parameter parser | ⬜ |
| P8.3 | Electron IPC bridge for backend calls | ⬜ |
| P8.4 | Tauri evaluation (vs Electron for distribution size) | 💡 |

---

## Architecture Evolution (Ongoing)

Migration from current flat structure toward:
```
src/
  core/           ← DSP + analysis (no UI, no platform deps)  [rename from dsp/ + analysis/]
  ui/             ← React components                           [rename from components/]
  canvas/         ← Pure canvas draw functions                 [extract from PlaybackWaveform.jsx]
  workers/        ← Web Workers                                [new: analyzeWorker.js, bpmWorker already exists]
  platform/       ← Web vs Electron divergence                 [new: needed for Phase 7 API routing]
```

Migration is incremental — no big-bang rewrites. Each task above moves one piece.

---

## Want / Backlog

| # | Task | Notes |
|---|------|-------|
| W1 | Multi-BPM windowed detection | 20s windows → segment BPM labels on waveform. Tracker #84. |
| W2 | Interactive parametric EQ on SpectrumDisplay | Draggable nodes → BiquadFilter in signal chain. Tracker #85. |
| W3 | Offline analysis Worker (LUFS, FFT, TruePeak) | Extends S2; enables progress bar for long files. |
| W4 | True Peak ITU FIR replacement | Replace Catmull-Rom with broadcast-grade FIR oversampling. |
| W5 | Waveform: transient marker overlay | Peak-detected transients shown as tick marks (useful for EDM drops/builds). |

---

## Recently Completed (UI Branch — Theming Overhaul, 2026-04-14)

- ✅ **UI zoom reduction**: `UI_ZOOM_BASE` 3.4× → 2.55× in [App.jsx](mix-analyzer/src/App.jsx) — denser default layout
- ✅ **Preferences modal scaling**: moved inside header zoom wrapper + added own `zoom: 0.75` so settings panel renders at ~1.91× instead of full 2.55×; backdrop uses `withAlpha(THEME.bg, 0.72)` so it darkens correctly in light themes too
- ✅ **Full canvas theming**: all draw functions in [src/canvas/drawers.js](mix-analyzer/src/canvas/drawers.js) (`drawLiveSpec`, `drawWaveCanvas`, `drawOverlay`, `drawVectorscope`, `drawLufsMeter`, `drawPhaseMeter`, `drawDBMeter`) now read from `THEME.*` instead of hardcoded hex/rgba literals. Alpha-blended colors use `hexToRgb()` once per draw + template strings for rgba channels. Spectrograph colormap kept hardcoded (perceptually uniform, readable on all bgs)
- ✅ [SpectrumDisplay.jsx](mix-analyzer/src/components/SpectrumDisplay.jsx) theming: spectrum bg/grid/curve/fill/freq labels/M-S legend all themed
- ✅ Button theming in [App.jsx](mix-analyzer/src/App.jsx) + [PlaybackWaveform.jsx](mix-analyzer/src/components/PlaybackWaveform.jsx): view tabs, stem tabs, +Add, +REF, mask/clear, play/stop, MONO, band mutes, zoom indicator, M/S, SPECTRAL, line/spectrograph — all use `THEME.accent/error/warn/good` + `withAlpha`
- ✅ **Theme renames**: `aurora` → `nebula`, `console` → `graphite`, `obsidian` → `onyx`, `midnight` → `abyss`, `synthwave` → `retrograde`, `paper` → `daylight` — removed MiniMeters-derivative names. Updated [theme.js](mix-analyzer/src/theme.js), [constants.js](mix-analyzer/src/constants.js) (`DEFAULT_PREFS.themePreset: "nebula"`), [Preferences.jsx](mix-analyzer/src/components/Preferences.jsx) fallback
- ✅ **Palette document**: [Desktop/mix-analyzer-themes.html](../../Desktop/mix-analyzer-themes.html) — standalone HTML renders all theme cards (6 shipping + 6 companion siblings + 2 new light themes), each with theme-accurate bg/border/text, Chrome (11 keys) and Signal (15 keys) swatch groups, luminance-adaptive swatch text
- ✅ **Companion palettes generated** (not yet wired into app): Plasma, Slate, Ink, Tide, Vaporwave, Parchment (siblings of the 6 shipping themes) + Porcelain (pure white, steel-blue) + Linen (off-white, muted violet) — awaiting user confirmation before integration into `theme.js`

## Recently Completed (Phase 6.9)

- ✅ DSP audit fixes:
  - LUFS integrated loudness now combined in the power domain per BS.1770-4 §5.1 (`10·log10(mean 10^(L/10))` over gated blocks) instead of linearly averaging dB values; abs+rel gates applied sequentially on the same set
  - BPM autocorrelation now runs over the full onset sequence (was capped to `lagMax*2` ≈ 2.4s regardless of track length — locked to noise when first seconds were a pickup)
  - Waveform peak/clip detection at base resolution now scans both L and R channels (was mid-only → single-channel clips that phase-cancel in M were missed at zoom 1–3×)
  - Spectral waveform color now uses `|M|² + |S|²` when stereo so pure-side content still colors correctly (was mid-only → grey)
- ✅ Spectral waveform additive blending: LOW/MID/HIGH drawn as independent per-band strokes under `globalCompositeOperation='lighter'` — overlaps sum (R+G+B → white, R+G → yellow, etc.) so heavy-overlap frames brighten instead of one band washing the color; save/restore scopes the composite so clip strip + beat grid unaffected
- ✅ M/S live spectrum fix: time-domain Mid=(L+R)/2 and Side=(L-R)/2 before FFT — was incorrectly using magnitude spectra, discarding phase
- ✅ UI zoom cycle button: 1×/1.5×/2×/2.5× cycle on header button, persisted in localStorage, applied via CSS `zoom` on root div

## Recently Completed (Phase 6.8)

- ✅ dB peak meter: `drawDBMeter` — L/R true peak bars left of waveform, 3s hold, clip flash, `resetDBMeterState()` on stop
- ✅ Body CSS reset in `index.html` — eliminates white browser border around web app
- ✅ `computeHighResFrames` per-channel peaks: both channels scanned for mx/mn at zoom ≥ 4× — clip strip now accurate at all zoom levels
- ✅ LUFS CLIP LED removed; LUFS target line kept

## Recently Completed (Phase 6.7)

- ✅ UI contrast: THEME dim/sub/text raised (`#6666a0` / `#9090c0` / `#f0f0ff`) — labels legible at normal display brightness
- ✅ Waveform clip strip: 3px red bar at top of waveform per clipping frame (`mx ≥ 0.999 || mn ≤ -0.999`); correct at all zoom levels
- ✅ LUFS meter target line: green dashed line at `prefs.lufsTarget`, visible in live + scrub modes
- ✅ LUFS CLIP LED: red badge with 3s hold + fade when any sample hits 0 dBFS; `drawLufsMeter` accepts `prefs` as 4th arg

## Recently Completed (Phase 6.6)

- ✅ Static Vectorscope (Stereo view): SVG → Canvas, DPR-aware
- ✅ Phase meter scrub: software biquad LP/BP/HP → per-band Pearson during drag-scrub
- ✅ BPM octave correction: doubles detected BPM when < 100 BPM
- ✅ Adaptive waveform resolution: 2400 pre-computed frames; zoom ≥ 4× uses `computeHighResFrames`
- ✅ Vectorscope canvas: centered, wide-mode (top half), multiband RGB coloring
- ✅ Resizable meter panels (drag handles, 55–400px range)
- ✅ Scroll-wheel zoom 1×–32×, cursor-anchored, adaptive beat subdivisions
- ✅ Spacebar play/pause global hotkey
- ✅ Scrub live meters: vectorscope + LUFS update from buffer slice during drag
