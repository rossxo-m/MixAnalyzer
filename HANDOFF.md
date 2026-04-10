# Mix Analyzer — New Chat Handoff Prompt

Paste everything below this line into a new Claude Code session.

---

## Project

Mix Analyzer — browser-based audio analysis tool for EDM producers. React SPA, all DSP custom (no external libs), Web Audio API for live meters. Primary file: `mix-analyzer/src/App.jsx` (~2400 lines). Full context in `mix-analyzer/CLAUDE.md`.

**Working directory:** `C:\Users\Ross\Desktop\MixAnalyzer`
**Repo:** `https://github.com/rossxo-m/MixAnalyzer` (branch: `phase-2-3-live-viz-bpm-key`)
**Dev server:** `cd mix-analyzer && npm run dev`

---

## What Was Built (Phases 1–3, all complete)

### Core Analysis (static, runs on file load)
- K-weighted LUFS (BS.1770-4), True Peak (Catmull-Rom 4x), FFT spectrum, stereo M/S
- BPM detection: enhanced autocorrelation (hop=256, harmonic scoring, octave correction)
- Key detection: chromagram → Krumhansl-Kessler Pearson correlation
- Genre target curves (EDM/Hip-hop/Pop/Rock/Lo-fi) with tolerance bands
- 7-band distribution + spectral waveform (RGB-colored per frame)

### Live Meters (during playback — Web Audio API)
- 3-band BiquadFilter bank: LP 200Hz / BP 200-4kHz / HP 4kHz → 6 AnalyserNodes + wideband L/R
- Live spectrum: line mode + spectrograph mode (MiniMeters-style — spectrograph scrolls in BG, live curve on top)
- M/S toggle: works in both line and spectrograph modes (Mid=blue, Side=orange)
- 3-band stereo phase meter (Pearson correlation per band, dot on L/R axis)
- Live LUFS meter (momentary + short-term bars, peak hold)
- Live vectorscope: M/S Lissajous, multiband RGB dot coloring (red=Low, green=Mid, blue=High)
- Volume control (GainNode), mono preview (ChannelMerger)

### Display
- DPR-aware canvas scaling: `setupCanvas()` helper on all 5 draw functions — lossless at any window size
- Waveform zoom + scroll: 1×/2×/4×/8× buttons + mouse wheel, scroll slider, auto-follows playhead, mini-map strip
- Beat grid on waveform (orange ticks at BPM intervals, brighter at bar lines)

### Infrastructure
- Electron wrapper (`electron/main.cjs`) — Windows .exe (NSIS installer + portable) via `npm run package:win`
- GitHub Actions (`mix-analyzer/.github/workflows/build.yml`) — push tag `v*` → builds Win .exe + Mac .dmg
- Tracker: `mix-analyzer-tracker.xlsx` (tasks #1–82, phases 1–8+)

---

## Key Technical Patterns

```js
// DPR-aware canvas setup (used in all draw functions)
function setupCanvas(canvas) {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;
  const PW = Math.round(rect.width * dpr), PH = Math.round(rect.height * dpr);
  if (canvas.width !== PW || canvas.height !== PH) { canvas.width = PW; canvas.height = PH; }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, W: rect.width, H: rect.height, PW, PH, dpr };
}

// Canvas JSX pattern (no HTML width/height attrs — CSS drives sizing)
<canvas ref={myRef} style={{ display: 'block', width: '100%', height: 90 }} />

// Live spec draw call (in RAF loop)
drawLiveSpec(canvas, analyser, slope, mode, filterBank, msMode);
// mode: "line" | "spectrograph"   msMode: boolean (prefs.specMs)

// FilterBank shape
filterBankRef.current = {
  analysers: [lowL, midL, highL, lowR, midR, highR],  // fftSize=512
  lAnalyser, rAnalyser,  // wideband, fftSize=4096
  nodes: allNodes,
}
```

---

## Open Bugs / Immediate Next Steps

| # | Task | Priority |
|---|------|----------|
| 79 | Verify BPM accuracy on 4-5 tracks at varied tempos (90, 120, 170+ BPM) | High |
| 80 | Fix PR: main and feature branch are orphans with no common history. Rebase feature onto a proper scaffold base, then open PR on GitHub | High |
| 82 | QA vectorscope multiband coloring — band fftSize=512 vs wideband fftSize=4096, stride mapping may misalign at transients | Medium |
| 81 | App icon: need icon.ico (256×256) + icon.icns (512×512) for Electron builds | Low |

---

## Phase 4 Next (from roadmap)

Phase 4 is already implemented (BPM + key). The next unbuilt phases are:

**Phase 5 — Version Comparison Engine**
- Group files as versions, per-metric delta matrix (LUFS/DR/crest/stereo/spectral)
- A/B playback switcher (level-matched, same position)
- Spectral difference heatmap

**Phase 6 — Reference A/B + Interactive EQ**
- Reference track overlay (target curve from reference file)
- Band solo/mute on audio output via BiquadFilter

**Phase 7 — Python Backend**
- FastAPI local server, yt-dlp downloads, CLAP embeddings, Demucs stems, Claude API feedback

See `mix-analyzer/CLAUDE.md` for full phase roadmap and `mix-analyzer-tracker.xlsx` for all 82 tasks.
