# CLAUDE.md — Mix Analyzer Project Context

## What This Is
A browser-based audio analysis tool for EDM producers. React single-page app with Web Audio API for playback, custom DSP (FFT, LUFS, True Peak, stereo analysis), and a roadmap toward a full mixing feedback platform with Python backend, AI-powered recommendations, and DAW integration.

The primary user is an FL Studio EDM producer building this as a personal tool that could grow into a product.

## Current State (Phase 1 Complete)
The app is a single React component in `src/App.jsx` (~1400 lines). It needs to be modularized.

### Working Features
- **K-weighted LUFS** (BS.1770-4): two-stage biquad (high shelf 1681Hz + HPF 38Hz), 400ms blocks, absolute+relative gating
- **True Peak**: 4x Catmull-Rom oversampling (~0.3-0.5dB variance vs ITU FIR spec)
- **FFT spectrum**: verified Cooley-Tukey radix-2, Hann window, 1/6-octave smoothing, up to 48 averaged frames
- **Spectral waveform**: RGB color blend per column (low=red, mid=green, high=blue) — continuous MiniMeters-style
- **3-band stereo** (Low/Mid/High from 7-band FFT M/S decomposition): primary stereo view
- **Vectorscope**: static 5000-point Lissajous
- **Full-quality playback**: BufferSource → destination, disconnect-first pattern, traveling playhead, click-to-seek
- **Band toggle switches**: Low/Mid/High with proper React state (setPrefs)
- **Genre target profiles**: EDM, Hip-hop, Pop, Rock, Lo-fi with 30-point high-resolution curves + tolerance bands
- **Spectrum slope compensation**: configurable 0/1.5/3/4.5 dB/octave
- **7-band distribution bars** with genre target markers
- **EDM feedback engine**: genre-aware thresholds, FL Studio-specific tips
- **Preferences panel**: LUFS target, TP ceiling, mono crossover, slope, genre selector
- **Multi-stem tabs + frequency masking detection**
- **Three-view system**: Analysis / Stereo / Feedback

### Known Bugs
- **Spectrum display**: auto-ranging was recently fixed (was clamping dbMax to 0). If spectrum still looks flat, the issue is in the dB range calculation in `SpectrumDisplay`. The FFT data IS correct (spectral waveform proves it).
- **LUFS short-term**: only measures final 3s window — should track max across full track
- **True Peak**: Catmull-Rom approximation, not ITU FIR — acceptable variance but not broadcast-grade
- **SVG performance**: waveform uses ~600 SVG elements. Fine for static but needs Canvas migration for live viz

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
See `mix-analyzer-tracker.xlsx` for the full task list (73 features + 14 phases).
Key categories: Core Analysis, Playback, Live Viz, Display, Feedback, UI, Reference, Neural/AI, FLP, Infrastructure, Bugs, Version Comparison, Intelligent Feedback.

## Phase Roadmap

### Phase 1 ✅ (Current)
Spectral waveform, 3-band stereo, genre targets, slope compensation, band toggles, de-minified code.

### Phase 2 — Live Viz Foundation
- **Task #12**: 3-band BiquadFilter bank (LP 200Hz / BP 200-4kHz / HP 4kHz) → 6 AnalyserNodes (3 bands × 2 channels)
- **Task #15**: Live spectrum analyzer — AnalyserNode.getFloatFrequencyData() → Canvas 2D at 30-60fps
- **Task #24**: Canvas migration for waveform (replace SVG)
- Layout: Live spectrum above waveform, stereo phase + LUFS beside it

### Phase 3 — Live Meters + Playback Controls
- **Task #10**: Volume control (GainNode)
- **Task #11**: Mono preview (ChannelMerger)
- **Task #16**: 3-band stereo phase meter (real-time L/R correlation per band)
- **Task #17**: Live LUFS meter (momentary 400ms + short-term 3s)

### Phase 4 — BPM + Key Detection
- **Task #6**: BPM via onset detection + autocorrelation in sub/bass bands (20-250Hz)
- **Task #7**: Key via chromagram (FFT → 12 pitch classes → Krumhansl-Kessler correlation)
- Windowed analysis for tempo/key changes
- Colored regions on waveform

### Phase 5 — Version Comparison Engine
- Group multiple files as versions
- Per-metric delta matrix (LUFS, DR, crest, stereo, spectral)
- Best-of-each recommendation engine
- Spectral difference heatmap
- A/B playback switcher (level-matched, same position)

### Phase 6 — Reference A/B + Interactive EQ
- Reference track overlay (target curve from reference)
- Band solo/mute on audio output
- EQ isolation via BiquadFilter on parallel path

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
