# CLAUDE.md — Mix Analyzer Project Context

## What This Is
A browser-based audio analysis tool for EDM producers. React single-page app with Web Audio API for playback, custom DSP (FFT, LUFS, True Peak, stereo analysis), and a roadmap toward a full mixing feedback platform with Python backend, AI-powered recommendations, and DAW integration.

The primary user is an FL Studio EDM producer building this as a personal tool that could grow into a product.

## Current State (Phases 1–6.6 Complete, Phase 7 branch active)
Modularized into `src/dsp/`, `src/analysis/`, `src/components/`. All canvas-based. Branch: `feature/phase7-prep`.

### Working Features
- **K-weighted LUFS** (BS.1770-4): two-stage biquad, 400ms blocks, absolute+relative gating
- **True Peak**: 4x Catmull-Rom oversampling
- **FFT spectrum**: Cooley-Tukey radix-2, Hann window, 1/6-octave smoothing, M/S toggle
- **Spectral waveform**: Canvas, RGB spectral coloring per frame (MiniMeters-style)
- **Live spectrum**: Canvas 2D at ~60fps, line + spectrograph modes, M/S toggle, slope compensation
- **3-band stereo phase meter**: real-time L/R Pearson correlation per band
- **Live LUFS meter**: momentary + short-term RMS bars with peak hold
- **Live vectorscope**: Canvas Lissajous, multiband RGB coloring, centered, wide-mode (top half in horizontal layout)
- **BPM detection**: Web Worker autocorrelation, beat grid on waveform with adaptive subdivisions
- **Key detection**: Chromagram + Krumhansl-Kessler, displayed on waveform
- **Playback**: spacebar toggle, continuous scroll-wheel zoom (1×–32×, cursor-anchored), drag-to-scrub with live spectrum + vectorscope + LUFS updating
- **Resizable meter panels**: drag handles between SPEC/PHASE/VECTOR/LUFS panels
- **Canvas resize-on-resize**: ResizeObserver (per-canvas) + panelW effect keep all meters redrawn when paused
- **Reference track overlay**: gold dashed curve on static spectrum, LUFS-normalized
- **Band output mute**: LOW/MID/HIGH kill switches on playback signal path
- **Genre target profiles**: EDM, Hip-hop, Pop, Rock, Lo-fi — 30-point curves + tolerance bands
- **MetricCard scaling**: clamp() font sizes, flex min-width 70px
- **Multi-stem tabs + frequency masking detection**
- **Three-view system**: Analysis / Stereo / Feedback
- **Static Vectorscope** (Stereo view): Canvas-based, DPR-aware — no SVG elements
- **Phase meter scrub**: software biquad LP/BP/HP per band → Pearson correlation during drag-scrub
- **BPM octave correction**: doubles result when detected < 100 BPM (fixes half-tempo on EDM tracks)
- **Adaptive waveform resolution**: 2400 pre-computed frames (up from 600); zoom ≥ 4× triggers `computeHighResFrames` (raw buffer min/max/rms per pixel, spectral color from coarse waveData)

### Known Bugs / Limitations
- **LUFS short-term**: tracks rolling 3s window at 60fps, not true max across full track
- **True Peak**: Catmull-Rom approximation, not ITU FIR — acceptable for production use

## Architecture & Key Decisions

### DSP Pipeline
All analysis is synchronous, runs on the main thread. For long files (10min+) this blocks the UI.
- `computeLUFS()` → K-weighted with 2-stage biquad
- `computeTruePeak()` → Catmull-Rom 4x interpolation
- `computeSpectrum()` → FFT 8192, Hann window, 1/6-octave smoothed curve + per-frame 3-band energy for spectral waveform
- `computeStereo()` → L/R FFT with M/S decomposition, 7-band accumulated then grouped to 3-band
- `analyze()` → orchestrates all of the above

### Multiband Design
- **Stereo**: 3-band (Low <200Hz, Mid 200-4kHz, High >4kHz) as primary display. 7-band retained internally.
- **Waveform**: spectral coloring via RGB blend of 3-band energy proportions per frame
- **Live viz (future)**: BiquadFilter bank on PARALLEL analysis path — not in audio output

### Genre Target Curves
`GENRE_CURVES` object: 30 [freq, dBRelative] points per genre with cosine interpolation.
`interpolateTargetCurve()` handles lookup at any frequency.
`GENRE_TARGETS` (7-band proportions) derived from curves automatically.
Tolerance band rendered as shaded region ± genre.tolerance dB.

### Playback
- `PlaybackWaveform` component with ref-based state tracking
- `killSource()` → disconnect first, then stop, clear onended
- `playFrom(offset)` → creates new BufferSource each time
- `requestAnimationFrame` tick loop for playhead

## Project Tracker
See `mix-analyzer-tracker.xlsx` for the full task list (85 features). Tasks #84–85 are "Want" priority (multi-BPM windowed detection, interactive parametric EQ).
Key categories: Core Analysis, Playback, Live Viz, Display, Feedback, UI, Reference, Neural/AI, FLP, Infrastructure, Bugs, Version Comparison, Intelligent Feedback.

## Phase Roadmap

### Phase 1 ✅
Spectral waveform, 3-band stereo, genre targets, slope compensation, band toggles, de-minified code.

### Phase 2 ✅
Live spectrum (Canvas, 60fps, line + spectrograph + M/S), canvas waveform, 3-band BiquadFilter bank.

### Phase 3 ✅
Volume control, mono preview, 3-band stereo phase meter, live LUFS meter, live vectorscope.

### Phase 4 ✅
BPM (Web Worker autocorrelation), key detection (chromagram + Krumhansl-Kessler), beat grid with adaptive subdivisions (bar/beat/8th/16th based on zoom).

### Phase 5 ✅
Multi-stem tabs, frequency masking detection, A/B reference spectrum overlay (LUFS-normalized).

### Phase 6 ✅
Reference track loading, LUFS-normalized spectrum overlay (gold dashed), band solo/mute on audio output.

### Phase 6.5 ✅
- Spacebar play/pause global hotkey
- Continuous scroll-wheel zoom (1×–32×, cursor-anchored, adaptive beat subdivisions)
- Resizable meter panels (drag handles between SPEC/PHASE/VECTOR/LUFS)
- Canvas redraw on resize: ResizeObserver per-canvas + panelW useEffect with rAF
- Vectorscope: centered in panel, wide-mode shows top half (M>0) in horizontal layout
- Scrub live update: vectorscope + LUFS meter update from buffer slice during drag-scrub
- MetricCard: clamp() font sizes, flex min-width 70px

### Phase 6.6 ✅
- Static Vectorscope (Stereo view): SVG → Canvas migration, DPR-aware
- Phase meter scrub: software biquad (LP 200Hz / BP 200–4kHz / HP 4kHz) → per-band Pearson correlation during drag-scrub; same draw path as live playback
- BPM octave correction: doubles detected BPM when < 100 (fixes half-tempo on EDM); same fix in `bpm.js` + `bpmWorker.js`
- Adaptive waveform resolution: pre-computed frames 600 → 2400 in `sharedFFT.js`; zoom ≥ 4× uses `computeHighResFrames` (raw buffer pass, 1 frame/pixel, spectral color borrowed from 2400-frame waveData)

### Phase 7 — Python Backend + Neural
- FastAPI local server
- yt-dlp for SoundCloud/YouTube downloads
- CLAP embeddings → genre detection
- Demucs stem separation
- Claude API for intelligent feedback (Tier 3)

### Phase 8 — FLP Integration + Desktop
- PyFLP parser for FL Studio 20 projects
- Parametric EQ 2 binary parser
- Electron/Tauri wrapper

## Intelligent Feedback System (3-tier)
- **Tier 1 (offline, in-browser)**: Dynamic template engine with multi-factor correlation rules (~50-100 rules). Replaces current `generateFeedback()`. Always available.
- **Tier 2 (optional, local)**: Quantized 7-8B LLM via Ollama with validation layer. Lowest priority.
- **Tier 3 (cloud, optional)**: Claude API with structured analysis JSON → natural language mixing advice. Best quality.
- **Abstraction**: `generateFeedback(data, options)` with automatic fallback 3→2→1.

## Code Style
- React functional components with hooks
- No external dependencies beyond React (all DSP is custom)
- THEME object for all colors/fonts
- Prefer `useCallback` for event handlers, `useMemo` for derived data
- Keep DSP functions pure and stateless

## File Structure (Target after modularization)
```
src/
  App.jsx              # Main layout, routing between views
  dsp/
    fft.js             # Cooley-Tukey FFT
    lufs.js            # K-weighting + BS.1770 LUFS
    truepeak.js        # Catmull-Rom oversampling
    spectrum.js        # Spectrum computation + spectral waveform
    stereo.js          # M/S decomposition, multiband
    bpm.js             # (Phase 4) Onset + autocorrelation
    key.js             # (Phase 4) Chromagram + Krumhansl
  analysis/
    analyze.js         # Orchestrates all DSP
    feedback.js        # Tier 1 template engine
    genres.js          # GENRE_CURVES, interpolation, targets
  components/
    PlaybackWaveform.jsx
    SpectrumDisplay.jsx
    Vectorscope.jsx
    StereoDisplay3Band.jsx
    MetricCard.jsx
    FeedbackItem.jsx
    BandBar.jsx
    Preferences.jsx
  hooks/
    useAudioContext.js
    usePlayback.js
  theme.js             # THEME constants
  constants.js         # BANDS_7, BANDS_3, DEFAULT_PREFS
```

## Commands
```bash
npm run dev           # Vite dev server with hot reload
npm run build         # Production build
```

## Important Technical Context
- Web Audio API: AudioContext must be created/resumed on user gesture
- AnalyserNode: getFloatFrequencyData() returns linear-spaced bins — need log remapping for display
- BiquadFilterNode: for live analysis, connect on parallel path (not in audio output chain)
- Canvas: needed for 60fps live viz — SVG too slow for real-time rendering
- Worker: needed for analysis of 10min+ files — currently blocks main thread
