# Mix Analyzer — Session Handoff

## Branch
`feature/phase7-prep` — 0 ESLint errors, clean production build.
Dev server: `npm run dev` → http://localhost:5173/MixAnalyzer/ (or :5174 if port busy)

## What Was Done This Session

### Playback / UX
- **Spacebar**: global `keydown` listener via `toggleRef` (stable ref pattern, guards against input/textarea/select)
- **Continuous zoom**: scroll wheel on waveform, 1×–32×, cursor-anchored. Replaced discrete 1/2/4/8× buttons with live `1.0×` readout + RESET. Beat grid adapts: bar→beat→8th→16th lines appear as you zoom in.
- **Scroll wheel fix**: React's synthetic `onWheel` is passive — attached imperatively with `{ passive: false }` via `useEffect` so `preventDefault()` actually stops page scroll.

### Resizable Panels
- Drag handles (`cursor: col-resize`) between SPEC / PHASE / VECTOR / LUFS panels
- `panelW` state `{phase, vs, lufs}` — closure-based resize (no extra refs), delta negated because all fixed panels are right-of-handle (SPEC is flex-grow:1 on left)
- Min 55px, max 400px per panel

### Canvas Resize-on-Resize
- **Problem**: when paused, RAF loop is stopped, so canvases squish/stretch on resize with no redraw
- **Fix 1**: `ResizeObserver` on `waveCanvasRef` with `requestAnimationFrame` defer — covers browser window resize for waveform + live spec
- **Fix 2**: `useEffect([panelW])` with `requestAnimationFrame` — covers panel drag resize for phase/vector/LUFS/live-spec

### Vectorscope
- Always centered in its panel regardless of aspect ratio
- **Wide mode** (W > H × 1.1): anchor point at bottom-center → only M>0 half visible (matches pro hardware scopes)
- `radius` and `cy` computed from canvas dimensions each frame

### Scrub Live Meters
- `computeScrubData` now returns `lSlice`, `rSlice` (512 samples), `momentaryDb`
- `drawVectorscope(canvas, filterBank, scrubVsData)`: new `scrubVsData` path draws wideband monochrome from buffer slice
- `drawLufsMeter(canvas, analyser, scrubDb)`: new `scrubDb` path draws single bar labeled "SCRUB", skips history
- Both throttled at 16ms in the drag-scrub `onMove` handler
- Phase meter still shows empty during scrub (would need band-pass filtering — not worth the cost)

### MetricCard
- Value font: `clamp(12px, 1.3vw, 20px)` — scales with viewport width
- Label/sub: `clamp(6px, 0.55vw, 8px)`
- `flex: "1 1 70px"`, `minWidth: 70` (was 90px)

## Current Known Issues / Bugs
- **Static Vectorscope** (Stereo view, `App.jsx` `Vectorscope` component): still SVG with 5000 `<circle>` elements — needs Canvas migration (was interrupted mid-session)
- **Phase meter during scrub**: empty state (would need per-band BiquadFilter pass on buffer slice)
- **LUFS short-term**: rolling 3s window at 60fps, not true max across full track

## Tracker
- Excel: `mix-analyzer-tracker.xlsx` — tasks #86–91 added this session, #78 updated (zoom)
- Want items: #84 (multi-BPM windowed detection), #85 (interactive parametric EQ on spectrum)

## Likely Next Steps
1. **Static Vectorscope Canvas migration** — convert `Vectorscope` in `App.jsx` from SVG circles to Canvas (same drawing logic as live vectorscope in PlaybackWaveform)
2. **Phase 7 infrastructure** — `src/api/client.js`, `.env` with `VITE_API_URL`, async feedback tier chain, FastAPI scaffold
3. **Multi-BPM** (#84) — windowed 20s autocorrelation, segment labels on waveform
4. **Interactive EQ** (#85) — draggable nodes on SpectrumDisplay, BiquadFilter in signal chain

## Key Files
- `src/components/PlaybackWaveform.jsx` — all playback, canvas drawing, scrub, zoom, resize
- `src/components/SpectrumDisplay.jsx` — static FFT spectrum + genre curve + ref overlay
- `src/components/MetricCard.jsx` — responsive metric display
- `src/App.jsx` — layout, file loading, ref track, view switching
- `src/analysis/analyze.js` — DSP orchestration (`_prefs` param reserved for Phase 7)
- `src/dsp/` — FFT, LUFS, True Peak, Spectrum, Stereo, Key, BPM worker
