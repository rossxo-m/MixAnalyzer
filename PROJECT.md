# PROJECT.md — Mix Analyzer Technical Reference

## Research Findings

### FLP Parsing
- **PyFLP** library parses FL Studio 20 projects (NOT FL21)
- Extracts: mixer routing, insert names, plugin chains, volumes, pans
- 8 native effects + 1 synth have parameter parsers
- Parametric EQ 2 binary structure: 7 bands × level/freq/bw/type/order — documented but not implemented in PyFLP
- Third-party VST parameters are opaque blobs (can read plugin name but not settings)

### Audio Downloads
- **yt-dlp**: best for programmatic SoundCloud/YouTube downloads, preserves original quality
- **Cobalt**: SoundCloud support, uses original MP3 when available. Public API requires Turnstile bot protection — recommend self-hosted instance

### EDM Mixing Standards
- Modern EDM masters show ~4.5 dB/octave spectral slope
- LUFS range: -12 to -6 for EDM (streaming normalization target: -14 LUFS Spotify)
- Sub bass must be mono below ~120Hz
- Kick fundamental: 45-120Hz
- EDM drops approximate pink noise (flat at 3dB/oct slope)
- Intros/breakdowns show steeper downward slope

### BPM Detection
- **web-audio-beat-detector**: onset detection + autocorrelation, proven for electronic music
- Algorithm: low-pass → half-wave rectify → onset strength envelope → autocorrelation → peak pick 60-200 BPM
- For tempo changes: windowed analysis (8-16 bar sliding windows), flag >2 BPM shifts

### Key Detection
- **Chromagram**: FFT (4096, hop 512) → map bins to 12 pitch classes via octave folding → correlate against Krumhansl-Kessler profiles for 24 major/minor keys
- Camelot wheel notation for DJ compatibility (e.g., C minor = 5A)
- For key changes: per-section chromagram, detect where best-matching key shifts

### MiniMeters Reference Features
- 7 modules: Spectrogram, Waveform, Loudness (LUFS/RMS), Stereometer, Oscilloscope, VU, Spectrum
- Spectrum: FFT up to 16384, Mel/Log/Linear scale, adjustable slope (4.5dB matches Pro-Q), target curve from reference WAV
- Stereometer: Scaled/Linear/Lissajous modes, RGB color mode (multiband), Multi-Band correlation (L/M/H)
- Color modes: Static, RGB (frequency-colored), Multi-Band (3-band overlay)
- Stick mode, pop-out windows, quad layout

### iZotope Tonal Balance Control
- Target curves from analyzing thousands of masters
- Shows RANGES of typical spectral variation (not just single line)
- Broad view: 4 bands (Low, Low-Mid, High-Mid, High)
- Fine view: full frequency-resolution curve
- Genre targets: EDM, Hip-hop, Pop, Rock, Jazz, Folk, Country, R&B, Orchestral, and more
- Key insight: "most modern non-classical music is surprisingly similar — large bump below 250Hz, flat midrange 250-8000Hz, steep rolloff above 8kHz"

## Version Comparison Engine Design

### Architecture
- Reuses existing analysis pipeline — no new DSP needed
- Groups files as versions → runs analyze() on each → stores results
- Comparison is purely a diffing layer on stored results

### Components
1. **Version Group Management**: UI to group files as versions (auto-detect from naming like v1/v2/v3)
2. **Per-Metric Deltas**: For each metric pair, compute signed difference + magnitude
3. **Time-Aligned Sectional Comparison**: Split by sections (needs BPM detection for intelligent splits)
4. **Best-of-Each Engine**: Score each version per category, configurable criteria
5. **Spectral Difference Heatmap**: Frequency × dB difference between two versions
6. **Per-Element Detection**: Kick/snare/perc clarity via transient isolation (approximate) or Demucs stems (precise)
7. **Anomaly Detection**: Narrow-band peaks, extraneous elements, artifacts
8. **A/B Playback Switcher**: Level-matched switching at same position

### Roadblocks
- Sectional comparison needs BPM/beat detection (Phase 4)
- Per-element detection needs Demucs (Phase 7) for reliability — in-browser transient isolation is approximate
- Anomaly detection is computationally expensive on long files

## Intelligent Feedback System Design

### Tier 1: Dynamic Template Engine
- Multi-factor correlation rules evaluate COMBINATIONS of metrics
- Example: IF crest<5 AND lufs>-8 AND dr<4 → "limiter overwork" template
- ~50-100 rules organized by category
- 3-5 phrasing variations per template to avoid repetition
- Summary opener characterizes overall mix
- Knowledge base: JSON with conditions, explanations, FL Studio tips

### Tier 3: Claude API
- Structured system prompt with mixing engineering principles
- Analysis JSON as context — Claude can't hallucinate about the data
- Optional: version comparison data, reference comparison data
- Cost: ~$0.003-0.01 per analysis
- Model: claude-sonnet-4-20250514

### Abstraction Layer
- `generateFeedback(analysisData, options)` → feedback[]
- Options: tier, detail level, genre, version data, reference data
- Fallback chain: Tier 3 → Tier 2 → Tier 1
- UI renders all tiers identically

## Live Visualization Architecture

### Filter Bank (Phase 2)
```
BufferSource → destination (clean audio)
     ↓ (parallel)
ChannelSplitter (L/R)
     ↓
L → LP 200Hz → AnalyserNode (Low L)
L → BP 200-4k → AnalyserNode (Mid L)  
L → HP 4kHz → AnalyserNode (High L)
R → LP 200Hz → AnalyserNode (Low R)
R → BP 200-4k → AnalyserNode (Mid R)
R → HP 4kHz → AnalyserNode (High R)
```

### Rendering
- Live spectrum: Canvas 2D, requestAnimationFrame at 30-60fps
- Live LUFS: K-weight from AnalyserNode data, vertical bar meter
- 3-band phase: Per-band L/R correlation, horizontal bar display
- All share the same AnalyserNode bank — zero duplicated processing

### Layout During Playback
```
┌─────────────────────┬──────────────┬────────┐
│  Live Spectrum       │ 3-Band Phase │  LUFS  │
│  (Canvas, real-time) │ LOW  ←●→     │  ████  │
│                      │ MID  ←──●→   │  ████  │
│                      │ HIGH ←────●→ │  ████  │
├──────────────────────┴──────────────┴────────┤
│  Spectral Waveform + Playhead                │
└──────────────────────────────────────────────┘
```
