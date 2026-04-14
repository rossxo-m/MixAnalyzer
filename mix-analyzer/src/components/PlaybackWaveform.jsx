import { useState, useEffect, useRef, useCallback } from 'react';
import { THEME } from '../theme.js';
import { BANDS_3 } from '../constants.js';
import { fft } from '../dsp/fft.js';
import { drawLiveSpec, drawWaveCanvas, drawOverlay, drawVectorscope, drawLufsMeter, drawPhaseMeter, drawDBMeter, resetLufsState, resetDBMeterState, resetHeatmapBuf } from '../canvas/drawers.js';

// Minimal IIR biquad used for scrub-mode per-band phase computation
function applyBiquad(src, b0, b1, b2, a1, a2) {
  const dst = new Float32Array(src.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < src.length; i++) {
    const x = src[i];
    const y = b0*x + b1*x1 + b2*x2 - a1*y1 - a2*y2;
    dst[i] = y; x2 = x1; x1 = x; y2 = y1; y1 = y;
  }
  return dst;
}

function biquadLP(src, fc, sr) {
  const w0 = 2 * Math.PI * fc / sr, alpha = Math.sin(w0) / Math.SQRT2;
  const cosW = Math.cos(w0), a0 = 1 + alpha;
  return applyBiquad(src,
    (1 - cosW) / 2 / a0, (1 - cosW) / a0, (1 - cosW) / 2 / a0,
    -2 * cosW / a0, (1 - alpha) / a0);
}

function biquadHP(src, fc, sr) {
  const w0 = 2 * Math.PI * fc / sr, alpha = Math.sin(w0) / Math.SQRT2;
  const cosW = Math.cos(w0), a0 = 1 + alpha;
  return applyBiquad(src,
    (1 + cosW) / 2 / a0, -(1 + cosW) / a0, (1 + cosW) / 2 / a0,
    -2 * cosW / a0, (1 - alpha) / a0);
}

function pearson(a, b) {
  const n = a.length;
  let sA = 0, sB = 0, sAB = 0, sA2 = 0, sB2 = 0;
  for (let i = 0; i < n; i++) { sA += a[i]; sB += b[i]; sAB += a[i]*b[i]; sA2 += a[i]*a[i]; sB2 += b[i]*b[i]; }
  const num = n*sAB - sA*sB;
  const den = Math.sqrt((n*sA2 - sA*sA) * (n*sB2 - sB*sB));
  return den > 0 ? Math.max(-1, Math.min(1, num / den)) : 0;
}

function computeScrubBands(lSlice, rSlice, sr) {
  // Low: LP 200Hz; Mid: LP 4kHz then HP 200Hz; High: HP 4kHz
  // Return order matches filterBank.analysers: [lowL, midL, highL, lowR, midR, highR]
  const lLow  = biquadLP(lSlice, 200, sr),  rLow  = biquadLP(rSlice, 200, sr);
  const lMidA = biquadLP(lSlice, 4000, sr), rMidA = biquadLP(rSlice, 4000, sr);
  const lMid  = biquadHP(lMidA,  200, sr),  rMid  = biquadHP(rMidA,  200, sr);
  const lHigh = biquadHP(lSlice, 4000, sr), rHigh = biquadHP(rSlice, 4000, sr);
  return [lLow, lMid, lHigh, rLow, rMid, rHigh];
}

function scrubPhaseFromBands(bands) {
  return [pearson(bands[0], bands[3]), pearson(bands[1], bands[4]), pearson(bands[2], bands[5])];
}

function computeScrubData(buffer, position) {
  const N = 4096;
  const sr = buffer.sampleRate;
  const L = buffer.getChannelData(0);
  const R = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : L;
  const offset = Math.max(0, Math.min(Math.floor(position * sr), buffer.length - N));
  if (offset + N > buffer.length) return null;
  const win = new Float32Array(N);
  for (let i = 0; i < N; i++) win[i] = 0.5*(1-Math.cos(2*Math.PI*i/(N-1)));
  const re = new Float64Array(N), im = new Float64Array(N);
  const reS = new Float64Array(N), imS = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    re[i]  = ((L[offset+i]+R[offset+i])/2)*win[i]; im[i]  = 0;
    reS[i] = ((L[offset+i]-R[offset+i])/2)*win[i]; imS[i] = 0;
  }
  fft(re, im);
  fft(reS, imS);
  const half = N/2, data = new Float32Array(half), dataS = new Float32Array(half);
  for (let i = 0; i < half; i++) {
    const mag  = Math.sqrt(re[i]*re[i]+im[i]*im[i])/(N/2);
    const magS = Math.sqrt(reS[i]*reS[i]+imS[i]*imS[i])/(N/2);
    data[i]  = mag  > 1e-10 ? 20*Math.log10(mag)  : -100;
    dataS[i] = magS > 1e-10 ? 20*Math.log10(magS) : -100;
  }
  // Extra: L/R slice for vectorscope + RMS for LUFS meter
  const VS = 512;
  const lSlice = new Float32Array(VS), rSlice = new Float32Array(VS);
  let sumSq = 0;
  for (let i = 0; i < VS; i++) {
    lSlice[i] = L[offset + i];
    rSlice[i] = R[offset + i];
    const m = (lSlice[i] + rSlice[i]) * 0.5;
    sumSq += m * m;
  }
  const momentaryDb = 20 * Math.log10(Math.sqrt(sumSq / VS) + 1e-20);
  const bandSlices = computeScrubBands(lSlice, rSlice, sr);
  const scrubPhaseCorr = scrubPhaseFromBands(bandSlices);
  return { data, dataS, nyquist: sr/2, lSlice, rSlice, bandSlices, momentaryDb, scrubPhaseCorr };
}


// Module-level — no props/state dependency; safe to use in effects and render
const fmt = t => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;

/* ════════════════════════════════════════════════════
   PLAYBACK with Canvas waveform + Live Spectrum + Filter Bank + Meters
   ════════════════════════════════════════════════════ */

export function PlaybackWaveform({ buffer, audioCtx, waveData, duration, prefs, setPrefs, bpm, keyData }) {
  const [playing, setPlaying] = useState(false);
  const [position, setPositionState] = useState(0);
  const [zoom, setZoom] = useState(1);        // continuous zoom 1..32
  const [scrollPct, setScrollPct] = useState(0); // 0..1, fraction of total duration at left edge
  const [bandMutes, setBandMutes] = useState([false, false, false]); // P6-C: LOW/MID/HIGH output mute
  const [panelW, setPanelW] = useState({ phase: 150, vs: 90, lufs: 90 }); // resizable meter panels
  const [meterH, setMeterH] = useState(() => {
    const v = parseInt(localStorage.getItem('meterH') || '90', 10);
    return isFinite(v) ? Math.max(50, Math.min(300, v)) : 90;
  });
  const [waveH, setWaveH] = useState(() => {
    const v = parseInt(localStorage.getItem('waveH') || '120', 10);
    return isFinite(v) ? Math.max(60, Math.min(400, v)) : 120;
  });
  const bandMutesRef = useRef([false, false, false]);
  const bandOutGainsRef = useRef(null); // [[gainL, gainR], [gainL, gainR], [gainL, gainR]]
  const playFromRef = useRef(null); // Fix 1: stable ref so drag useEffect doesn't re-bind on playFrom identity change
  const toggleRef = useRef(null);   // spacebar listener — stable ref avoids re-binding on toggle identity changes
  const zoomRef = useRef(1);
  const scrollPctRef = useRef(0);
  const sourceRef = useRef(null);
  const startTimeRef = useRef(0);
  const animRef = useRef(null);
  const positionRef = useRef(0);
  const playingRef = useRef(false);
  // Phase 2: Canvas refs
  const waveCanvasRef = useRef(null);
  const overlayCanvasRef = useRef(null);
  const liveSpecCanvasRef = useRef(null);
  // Phase 2: Audio analysis refs
  const specAnalyserRef = useRef(null);
  const filterBankRef = useRef(null);
  // Phase 3: Canvas refs for meters
  const phaseCanvasRef = useRef(null);
  const lufsCanvasRef = useRef(null);
  const dbMeterCanvasRef = useRef(null);
  // Phase 3: Live vectorscope canvas
  const vsCanvasRef = useRef(null);
  const waveContainerRef = useRef(null);  // for passive:false wheel listener
  // Phase 3: Audio graph refs
  const gainRef = useRef(null);
  const monoMergerRef = useRef(null);
  // Keep prefs accessible in RAF without stale closures
  const prefsRef = useRef(prefs);
  // Drag scrub
  const isDraggingRef = useRef(false);
  const scrubDataRef = useRef(null);
  const timeDisplayRef = useRef(null);

  useEffect(() => { prefsRef.current = prefs; }, [prefs]);
  useEffect(() => { zoomRef.current = zoom; }, [zoom]);
  useEffect(() => { scrollPctRef.current = scrollPct; }, [scrollPct]);

  // Phase 3: Update gain value in real-time when volume slider changes
  useEffect(() => {
    if (gainRef.current) gainRef.current.gain.value = prefs.volume ?? 1.0;
  }, [prefs.volume]);

  // Draw static waveform when data or display prefs change
  useEffect(() => {
    drawWaveCanvas(waveCanvasRef.current, waveData, prefs, duration, bpm, keyData, zoomRef.current, scrollPctRef.current, buffer);
    drawOverlay(overlayCanvasRef.current, positionRef.current, duration, zoomRef.current, scrollPctRef.current);
  }, [waveData, prefs, duration, bpm, keyData, zoom, scrollPct]);

  // Init live spec + vectorscope canvases
  useEffect(() => {
    drawLiveSpec(liveSpecCanvasRef.current, null, prefsRef.current.specSlope, prefsRef.current.liveSpecMode, null, prefsRef.current.specMs);
    drawVectorscope(vsCanvasRef.current, null);
  }, []);

  // Stop playback on buffer change (tab switch)
  useEffect(() => {
    positionRef.current = 0;
    setPositionState(0); // eslint-disable-line react-hooks/set-state-in-effect -- intentional reset on buffer swap
    drawLiveSpec(liveSpecCanvasRef.current, null, prefsRef.current.specSlope, prefsRef.current.liveSpecMode, null, prefsRef.current.specMs);
    drawVectorscope(vsCanvasRef.current, null);
  }, [buffer]);

  // Drag-scrub: document-level mouse events so drag works outside the canvas
  

  const killSource = useCallback(() => {
    cancelAnimationFrame(animRef.current); animRef.current = null;
    const src = sourceRef.current;
    if (src) { src.onended = null; try { src.disconnect(); } catch { /* disconnect errors are non-fatal */ } try { src.stop(0); } catch { /* disconnect errors are non-fatal */ } sourceRef.current = null; }
    // Disconnect filter bank
    if (filterBankRef.current) {
      filterBankRef.current.nodes.forEach(n => { try { n.disconnect(); } catch { /* disconnect errors are non-fatal */ } });
      filterBankRef.current = null;
    }
    // Phase 3: Disconnect gain + mono nodes
    if (gainRef.current) { try { gainRef.current.disconnect(); } catch { /* disconnect errors are non-fatal */ } gainRef.current = null; }
    if (monoMergerRef.current) { try { monoMergerRef.current.disconnect(); } catch { /* disconnect errors are non-fatal */ } monoMergerRef.current = null; }
    bandOutGainsRef.current = null;
    specAnalyserRef.current = null;
    playingRef.current = false; setPlaying(false);
    resetLufsState();
    resetDBMeterState();
  }, []);

  // Cleanup on unmount
  useEffect(() => { return () => killSource(); }, [killSource]);

  // P6-C: Toggle band output mute — mutates gain directly, no graph rebuild
  const toggleBandMute = useCallback((i) => {
    setBandMutes(prev => {
      const next = [...prev];
      next[i] = !next[i];
      if (next.every(Boolean)) return prev; // at least one band must be audible
      bandMutesRef.current = next;
      if (bandOutGainsRef.current) {
        bandOutGainsRef.current[i].forEach(g => { g.gain.value = next[i] ? 0 : 1; });
      }
      return next;
    });
  }, []);

  const playFrom = useCallback((offset) => {
    if (!buffer || !audioCtx) return;
    killSource();
    if (audioCtx.state === "suspended") audioCtx.resume();
    const src = audioCtx.createBufferSource();
    src.buffer = buffer;

    // ── Phase 3 + P6-C: Master gain + output routing ──
    const gain = audioCtx.createGain();
    gain.gain.value = prefsRef.current.volume ?? 1.0;
    gainRef.current = gain;

    if (prefsRef.current.monoPreview && buffer.numberOfChannels >= 2) {
      // Mono preview: simple path, banded solo bypassed
      src.connect(gain);
      const merger = audioCtx.createChannelMerger(1);
      gain.connect(merger, 0, 0);
      merger.connect(audioCtx.destination);
      monoMergerRef.current = merger;
      bandOutGainsRef.current = null;
    } else {
      // P6-C: Banded stereo output — 3 bands × L/R → ChannelMerger(2) → masterGain → destination
      const outSplitter = audioCtx.createChannelSplitter(2);
      const outMerger = audioCtx.createChannelMerger(2);
      src.connect(outSplitter);
      const mutes = bandMutesRef.current;
      const bandDefs = [
        () => { const f = audioCtx.createBiquadFilter(); f.type = "lowpass";  f.frequency.value = 200;  f.Q.value = 0.707; return f; },
        () => { const hp = audioCtx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 200;  hp.Q.value = 0.707;
                const lp = audioCtx.createBiquadFilter(); lp.type = "lowpass";  lp.frequency.value = 4000; lp.Q.value = 0.707; hp.connect(lp); return { entry: hp, exit: lp }; },
        () => { const f = audioCtx.createBiquadFilter(); f.type = "highpass"; f.frequency.value = 4000; f.Q.value = 0.707; return f; },
      ];
      const outBandGains = [];
      for (let b = 0; b < 3; b++) {
        const bandGains = [];
        for (let ch = 0; ch < 2; ch++) {
          const def = bandDefs[b]();
          const entry = def.entry ?? def, exit = def.exit ?? def;
          const g = audioCtx.createGain();
          g.gain.value = mutes[b] ? 0 : 1;
          outSplitter.connect(entry, ch);
          exit.connect(g);
          g.connect(outMerger, 0, ch);
          bandGains.push(g);
        }
        outBandGains.push(bandGains);
      }
      outMerger.connect(gain);
      gain.connect(audioCtx.destination);
      bandOutGainsRef.current = outBandGains;
    }

    // ── Phase 2: Full-spectrum AnalyserNode (parallel tap for live spectrum) ──
    const specAnalyser = audioCtx.createAnalyser();
    specAnalyser.fftSize = 4096; // larger FFT for better bass resolution
    specAnalyser.smoothingTimeConstant = 0.8;
    src.connect(specAnalyser);
    specAnalyserRef.current = specAnalyser;

    // ── Phase 2: 3-band BiquadFilter bank → 6 AnalyserNodes ──
    // Architecture: BufferSource → ChannelSplitter → per-channel LP/BP/HP → AnalyserNodes
    // This is a PARALLEL analysis path — does not affect audio output
    const allNodes = [specAnalyser];
    const splitter = audioCtx.createChannelSplitter(2);
    src.connect(splitter);
    allNodes.push(splitter);

    const bandAnalysers = []; // [lowL, midL, highL, lowR, midR, highR]
    for (let ch = 0; ch < 2; ch++) {
      // Low band: LP 200Hz (Butterworth Q)
      const lowF = audioCtx.createBiquadFilter();
      lowF.type = "lowpass"; lowF.frequency.value = 200; lowF.Q.value = 0.707;
      const lowA = audioCtx.createAnalyser();
      lowA.fftSize = 512; lowA.smoothingTimeConstant = 0.8;
      splitter.connect(lowF, ch); lowF.connect(lowA);
      allNodes.push(lowF, lowA);
      bandAnalysers.push(lowA);

      // Mid band: HP 200Hz → LP 4kHz (two filters in series)
      const midHP = audioCtx.createBiquadFilter();
      midHP.type = "highpass"; midHP.frequency.value = 200; midHP.Q.value = 0.707;
      const midLP = audioCtx.createBiquadFilter();
      midLP.type = "lowpass"; midLP.frequency.value = 4000; midLP.Q.value = 0.707;
      const midA = audioCtx.createAnalyser();
      midA.fftSize = 512; midA.smoothingTimeConstant = 0.8;
      splitter.connect(midHP, ch); midHP.connect(midLP); midLP.connect(midA);
      allNodes.push(midHP, midLP, midA);
      bandAnalysers.push(midA);

      // High band: HP 4kHz
      const highF = audioCtx.createBiquadFilter();
      highF.type = "highpass"; highF.frequency.value = 4000; highF.Q.value = 0.707;
      const highA = audioCtx.createAnalyser();
      highA.fftSize = 512; highA.smoothingTimeConstant = 0.8;
      splitter.connect(highF, ch); highF.connect(highA);
      allNodes.push(highF, highA);
      bandAnalysers.push(highA);
    }
    // Wideband L/R analysers for live vectorscope + M/S spectrum
    const lA = audioCtx.createAnalyser(); lA.fftSize = 4096; lA.smoothingTimeConstant = 0.8;
    const rA = audioCtx.createAnalyser(); rA.fftSize = 4096; rA.smoothingTimeConstant = 0.8;
    splitter.connect(lA, 0); splitter.connect(rA, 1);
    allNodes.push(lA, rA);
    filterBankRef.current = { analysers: bandAnalysers, lAnalyser: lA, rAnalyser: rA, nodes: allNodes };

    sourceRef.current = src; startTimeRef.current = audioCtx.currentTime - offset;
    playingRef.current = true; setPlaying(true);
    src.onended = () => {
      if (sourceRef.current === src) {
        sourceRef.current = null; playingRef.current = false;
        cancelAnimationFrame(animRef.current);
        positionRef.current = 0; // Fix 2: ref before state so any triggered effect reads correct value
        setPlaying(false); setPositionState(0);
        drawOverlay(overlayCanvasRef.current, 0, buffer.duration);
      }
    };
    src.start(0, offset);

    const tick = () => {
      if (!playingRef.current || sourceRef.current !== src) return;
      const elapsed = Math.min(audioCtx.currentTime - startTimeRef.current, buffer.duration);
      positionRef.current = elapsed; setPositionState(elapsed);
      // Phase 2: update live spectrum + playhead overlay via Canvas
      drawLiveSpec(liveSpecCanvasRef.current, specAnalyserRef.current, prefsRef.current.specSlope, prefsRef.current.liveSpecMode, filterBankRef.current, prefsRef.current.specMs);
      // Auto-scroll: keep playhead in view when zoomed
      if (zoomRef.current > 1) {
        const posFrac = elapsed / buffer.duration;
        const visibleFrac = 1 / zoomRef.current;
        const curScroll = scrollPctRef.current;
        const endFrac = curScroll + visibleFrac;
        if (posFrac > endFrac - visibleFrac * 0.1 || posFrac < curScroll) {
          const newScroll = Math.max(0, Math.min(1 - visibleFrac, posFrac - visibleFrac * 0.1));
          scrollPctRef.current = newScroll;
          setScrollPct(newScroll);
        }
      }
      drawOverlay(overlayCanvasRef.current, elapsed, buffer.duration, zoomRef.current, scrollPctRef.current);
      // Phase 3: update meters
      drawPhaseMeter(phaseCanvasRef.current, filterBankRef.current);
      drawLufsMeter(lufsCanvasRef.current, specAnalyserRef.current, null, prefsRef.current);
      drawVectorscope(vsCanvasRef.current, filterBankRef.current, null, prefsRef.current.vectorscopeStyle);
      drawDBMeter(dbMeterCanvasRef.current, filterBankRef.current?.lAnalyser, filterBankRef.current?.rAnalyser);
      if (elapsed < buffer.duration) animRef.current = requestAnimationFrame(tick);
    };
    animRef.current = requestAnimationFrame(tick);
  }, [buffer, audioCtx, killSource]);

  // Fix 1: keep playFromRef in sync so drag effect doesn't re-bind on playFrom identity changes
  useEffect(() => { playFromRef.current = playFrom; }, [playFrom]);

  // Spacebar: global keydown → play/pause (only when not typing in an input)
  useEffect(() => {
    const onKey = (e) => {
      if (e.code !== 'Space') return;
      const tag = e.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      e.preventDefault();
      toggleRef.current?.();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []); // [] — uses toggleRef, never stale

  // Drag-scrub: document-level so drag works outside canvas
  // Fix 3 (corrected): throttle only the FFT+draw, not the overlay — overlay stays at full mouse rate
  useEffect(() => {
    let lastScrubT = 0;
    const onMove = (e) => {
      if (!isDraggingRef.current || !buffer) return;
      const canvas = overlayCanvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const visibleFrac = 1 / zoomRef.current;
      const startFrac = Math.min(scrollPctRef.current, 1 - visibleFrac);
      const newPos = (startFrac + pct * visibleFrac) * duration;
      // Overlay + time display: always at full mouse rate
      positionRef.current = newPos;
      if (timeDisplayRef.current) timeDisplayRef.current.textContent = `${fmt(newPos)} / ${fmt(duration)}`;
      drawOverlay(overlayCanvasRef.current, newPos, duration, zoomRef.current, scrollPctRef.current);
      // FFT scrub: throttled to ~60fps — computeScrubData is a full N=4096 FFT
      const now = performance.now();
      if (now - lastScrubT >= 16) {
        lastScrubT = now;
        scrubDataRef.current = computeScrubData(buffer, newPos);
        drawLiveSpec(liveSpecCanvasRef.current, null, prefsRef.current.specSlope, prefsRef.current.liveSpecMode, null, prefsRef.current.specMs, scrubDataRef.current);
        drawVectorscope(vsCanvasRef.current, null, scrubDataRef.current, prefsRef.current.vectorscopeStyle);
        drawLufsMeter(lufsCanvasRef.current, null, scrubDataRef.current?.momentaryDb ?? null, prefsRef.current);
        drawPhaseMeter(phaseCanvasRef.current, null, scrubDataRef.current?.scrubPhaseCorr ?? null);
      }
    };
    const onUp = () => {
      if (!isDraggingRef.current) return;
      isDraggingRef.current = false;
      document.body.style.cursor = '';
      // Fix 1: use ref — avoids playFrom in dep array, prevents listener re-bind on every playFrom identity change
      if (playingRef.current) playFromRef.current?.(positionRef.current);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
  }, [buffer, duration]); // playFrom removed from deps — accessed via playFromRef
  const toggle = useCallback(() => {
    if (playingRef.current) killSource(); else playFrom(positionRef.current);
  }, [killSource, playFrom]);
  useEffect(() => { toggleRef.current = toggle; }, [toggle]);

  const seek = useCallback((e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickPct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    // Map click position within visible window to absolute time
    const visibleFrac = 1 / zoomRef.current;
    const startFrac = Math.min(scrollPctRef.current, 1 - visibleFrac);
    const newPos = (startFrac + clickPct * visibleFrac) * duration;
    if (playingRef.current) playFrom(newPos);
    else { positionRef.current = newPos; setPositionState(newPos); drawOverlay(overlayCanvasRef.current, newPos, duration, zoomRef.current, scrollPctRef.current); }
  }, [duration, playFrom]);

  const handleWheelZoom = useCallback((e) => {
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const cursorPct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const factor = e.deltaY < 0 ? 1.18 : 1 / 1.18;
    setZoom(prev => {
      const newZoom = Math.max(1, Math.min(32, prev * factor));
      zoomRef.current = newZoom;
      if (newZoom <= 1) {
        scrollPctRef.current = 0;
        setScrollPct(0);
      } else {
        // Anchor: cursor's song-time fraction stays fixed under the mouse
        const oldVisibleFrac = 1 / prev;
        const oldStart = Math.min(scrollPctRef.current, 1 - oldVisibleFrac);
        const cursorTimeFrac = oldStart + cursorPct * oldVisibleFrac;
        const newVisibleFrac = 1 / newZoom;
        const newStart = Math.max(0, Math.min(1 - newVisibleFrac, cursorTimeFrac - cursorPct * newVisibleFrac));
        scrollPctRef.current = newStart;
        setScrollPct(newStart);
      }
      return newZoom;
    });
  }, []);

  // Wheel zoom: passive:false required so preventDefault() stops page scroll.
  // React's synthetic onWheel is passive by default in modern browsers.
  useEffect(() => {
    const el = waveContainerRef.current;
    if (!el) return;
    const handler = (e) => handleWheelZoom(e);
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, [handleWheelZoom]);

  // Redraw waveform + live-spec on browser window resize (canvas CSS width:"100%" reflows).
  // rAF defers until layout has settled so getBoundingClientRect() returns correct dims.
  useEffect(() => {
    let rafId = 0;
    const redraw = () => {
      if (playingRef.current) return;
      rafId = requestAnimationFrame(() => {
        drawWaveCanvas(waveCanvasRef.current, waveData, prefsRef.current, duration, bpm, keyData, zoomRef.current, scrollPctRef.current, buffer);
        drawOverlay(overlayCanvasRef.current, positionRef.current, duration, zoomRef.current, scrollPctRef.current);
        drawLiveSpec(liveSpecCanvasRef.current, null, prefsRef.current.specSlope, prefsRef.current.liveSpecMode, null, prefsRef.current.specMs, scrubDataRef.current);
        drawPhaseMeter(phaseCanvasRef.current, null, scrubDataRef.current?.scrubPhaseCorr ?? null);
        drawVectorscope(vsCanvasRef.current, null, scrubDataRef.current, prefsRef.current.vectorscopeStyle);
        drawLufsMeter(lufsCanvasRef.current, null, scrubDataRef.current?.momentaryDb ?? null, prefsRef.current);
      });
    };
    const ro = new ResizeObserver(redraw);
    if (waveCanvasRef.current) ro.observe(waveCanvasRef.current);
    return () => { ro.disconnect(); cancelAnimationFrame(rafId); };
  }, [waveData, duration, bpm, keyData]);

  // Redraw meter panels when their widths change (panelW state) — ResizeObserver on the
  // waveform canvas doesn't fire for internal panel resizes, so this covers drag handles.
  // Also redraws on browser resize via panelW-independent initial mount.
  useEffect(() => {
    if (playingRef.current) return;
    const id = requestAnimationFrame(() => {
      drawLiveSpec(liveSpecCanvasRef.current, null, prefsRef.current.specSlope, prefsRef.current.liveSpecMode, null, prefsRef.current.specMs, scrubDataRef.current);
      drawPhaseMeter(phaseCanvasRef.current, null, scrubDataRef.current?.scrubPhaseCorr ?? null);
      drawVectorscope(vsCanvasRef.current, null, scrubDataRef.current, prefsRef.current.vectorscopeStyle);
      drawLufsMeter(lufsCanvasRef.current, null, scrubDataRef.current?.momentaryDb ?? null, prefsRef.current);
      drawDBMeter(dbMeterCanvasRef.current, null, null);
    });
    return () => cancelAnimationFrame(id);
  }, [panelW, meterH, waveH]);

  // Drag-to-resize meter panels — closure captures startX+startW, no refs needed
  const startResize = useCallback((e, key, currentW) => {
    e.preventDefault();
    const startX = e.clientX, startW = currentW;
    document.body.style.cursor = 'col-resize';
    const onMove = (me) => {
      const w = Math.max(55, Math.min(400, startW - (me.clientX - startX)));
      setPanelW(prev => ({ ...prev, [key]: w }));
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, []);

  const startVResize = useCallback((e, setter, currentH, min, max, storageKey) => {
    e.preventDefault();
    const startY = e.clientY, startH = currentH;
    document.body.style.cursor = 'row-resize';
    let last = currentH;
    const onMove = (me) => {
      const h = Math.max(min, Math.min(max, startH + (me.clientY - startY)));
      last = h;
      setter(h);
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      localStorage.setItem(storageKey, String(last));
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, []);

  const handleScrollDrag = useCallback((e) => {
    if (zoom <= 1) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const visibleFrac = 1 / zoom;
    // Click on mini-map strip: position the view so strip thumb center = click
    const newScroll = Math.max(0, Math.min(1 - visibleFrac, pct - visibleFrac / 2));
    scrollPctRef.current = newScroll;
    setScrollPct(newScroll);
  }, [zoom]);

  if (!buffer || !waveData) return null;

  const H = waveH, LSH = meterH;
  const isSpectral = prefs.waveMode === "spectral";
  const toggles = prefs.bandToggles;
  const vol = Math.round((prefs.volume ?? 1) * 100);

  return (
    <div style={{ marginBottom: 14 }}>
      {/* Transport bar: play, time, volume, mono, band toggles */}
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 5 }}>
        <button onClick={toggle} style={{
          width: 28, height: 28, borderRadius: "50%",
          background: playing ? "#ff335518" : THEME.accent + "18",
          color: playing ? THEME.error : "#bb99ff",
          border: `1px solid ${playing ? THEME.error + "44" : THEME.accent + "44"}`,
          cursor: "pointer", fontSize: 12,
          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
        }}>{playing ? "■" : "▶"}</button>
        <span ref={timeDisplayRef} style={{ fontSize: 9, color: THEME.sub, fontFamily: THEME.mono }}>{fmt(position)} / {fmt(duration)}</span>

        {/* Phase 3: Volume slider */}
        <div style={{ display: "flex", alignItems: "center", gap: 3, marginLeft: 4 }}>
          <span style={{ fontSize: 7, color: THEME.dim, fontFamily: THEME.mono }}>VOL</span>
          <input type="range" min={0} max={100} value={vol} onChange={e => {
            setPrefs(p => ({ ...p, volume: +e.target.value / 100 }));
          }} style={{ width: 50, height: 3, accentColor: THEME.accent }} />
          <span style={{ fontSize: 7, color: THEME.sub, fontFamily: THEME.mono, width: 22 }}>{vol}%</span>
        </div>

        {/* Phase 3: Mono preview toggle */}
        <button onClick={() => {
          const newMono = !prefsRef.current.monoPreview;
          // Fix 4 (corrected): force-sync prefsRef before rebuilding graph — setTimeout/rAF both
          // race against the useEffect([prefs]) sync and neither reliably wins. Direct mutation
          // is safe here because setPrefs will overwrite it on next render anyway.
          prefsRef.current = { ...prefsRef.current, monoPreview: newMono };
          setPrefs(p => ({ ...p, monoPreview: newMono }));
          if (playingRef.current) playFrom(positionRef.current);
        }} style={{
          padding: "2px 6px", fontSize: 7, fontFamily: THEME.mono,
          background: prefs.monoPreview ? "#ff885522" : THEME.card,
          color: prefs.monoPreview ? "#ff8855" : THEME.dim,
          border: `1px solid ${prefs.monoPreview ? "#ff885544" : THEME.border}`,
          borderRadius: 3, cursor: "pointer",
        }}>MONO</button>

        {/* P6-C: Band output mute buttons */}
        <div style={{ display: "flex", gap: 2, marginLeft: 4 }}>
          {BANDS_3.map((band, i) => (
            <button key={band.name} onClick={() => toggleBandMute(i)} style={{
              padding: "2px 6px", fontSize: 7, fontFamily: THEME.mono,
              background: bandMutes[i] ? "#33333344" : band.color + "22",
              color: bandMutes[i] ? THEME.dim : band.color,
              border: `1px solid ${bandMutes[i] ? THEME.border : band.color + "44"}`,
              borderRadius: 3, cursor: "pointer",
              textDecoration: bandMutes[i] ? "line-through" : "none",
            }}>{band.name}</button>
          ))}
        </div>

        {/* Band toggles (waveform display) */}
        <div style={{ marginLeft: "auto", display: "flex", gap: 3 }}>
          {BANDS_3.map((band, i) => (
            <button key={band.name} onClick={() => {
              setPrefs(p => {
                const next = [...p.bandToggles];
                next[i] = !next[i];
                if (!next.some(Boolean)) return p;
                return { ...p, bandToggles: next };
              });
            }} style={{
              padding: "2px 8px", fontSize: 8, fontFamily: THEME.mono,
              background: toggles[i] ? band.color + "22" : THEME.card,
              color: toggles[i] ? band.color : THEME.dim,
              border: `1px solid ${toggles[i] ? band.color + "44" : THEME.border}`,
              borderRadius: 3, cursor: "pointer",
            }}>{band.name}</button>
          ))}
          <button onClick={() => {
            setPrefs(p => ({ ...p, waveMode: p.waveMode === "spectral" ? "uniform" : "spectral" }));
          }} style={{
            padding: "2px 8px", fontSize: 7, fontFamily: THEME.mono,
            background: isSpectral ? THEME.accent + "18" : THEME.card,
            color: isSpectral ? "#bb99ff" : THEME.dim,
            border: `1px solid ${isSpectral ? THEME.accent + "33" : THEME.border}`,
            borderRadius: 3, cursor: "pointer",
          }}>{isSpectral ? "SPECTRAL" : "UNIFORM"}</button>
        </div>
      </div>

      {/* Live Spectrum + Phase Meter + LUFS Meter (PROJECT.md layout) */}
      <div style={{ display: "flex", gap: 0, borderRadius: "7px 7px 0 0", overflow: "hidden" }}>
        {/* Live Spectrum (left) */}
        <div style={{ flex: 1, background: "#080812" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 8px 0" }}>
            <span style={{ fontSize: 8, color: THEME.dim, fontFamily: THEME.mono, letterSpacing: 1.5 }}>
              LIVE SPECTRUM {playing ? <span style={{ color: "#ff3366" }}>●</span> : <span style={{ color: THEME.dim }}>○</span>}
            </span>
            <div style={{ display: "flex", gap: 3, alignItems: "center" }}>
              {["line", "spectrograph"].map(m => (
                <button key={m} onClick={() => {
                  setPrefs(p => ({ ...p, liveSpecMode: m }));
                  if (m !== prefs.liveSpecMode) { resetHeatmapBuf(); }
                }} style={{
                  padding: "1px 6px", fontSize: 7, fontFamily: THEME.mono, textTransform: "uppercase",
                  background: prefs.liveSpecMode === m ? THEME.accent + "18" : "transparent",
                  color: prefs.liveSpecMode === m ? "#bb99ff" : THEME.dim,
                  border: `1px solid ${prefs.liveSpecMode === m ? THEME.accent + "33" : THEME.border}`,
                  borderRadius: 2, cursor: "pointer",
                }}>{m}</button>
              ))}
              <button onClick={() => setPrefs(p => ({ ...p, specMs: !p.specMs }))} style={{
                padding: "1px 6px", fontSize: 7, fontFamily: THEME.mono,
                background: prefs.specMs ? "#ff885518" : "transparent",
                color: prefs.specMs ? "#ff9966" : THEME.dim,
                border: `1px solid ${prefs.specMs ? "#ff885544" : THEME.border}`,
                borderRadius: 2, cursor: "pointer",
              }}>M/S</button>
              <span style={{ display: "flex", alignItems: "center", gap: 3, marginLeft: 2 }}>
                <span style={{ fontSize: 7, color: THEME.dim, fontFamily: THEME.mono }}>slope</span>
                <input type="range" min={0} max={6} step={0.1}
                  value={prefs.specSlope}
                  onChange={e => setPrefs(p => ({ ...p, specSlope: +e.target.value }))}
                  onDoubleClick={() => setPrefs(p => ({ ...p, specSlope: 3.0 }))}
                  title="Double-click to reset to 3 dB/oct"
                  style={{ width: 60, accentColor: THEME.accent, height: 4, cursor: "pointer" }} />
                <input type="number" min={0} max={6} step={0.1}
                  value={prefs.specSlope}
                  onChange={e => {
                    const v = e.target.value === '' ? 0 : +e.target.value;
                    if (!Number.isNaN(v)) setPrefs(p => ({ ...p, specSlope: Math.max(0, Math.min(6, v)) }));
                  }}
                  style={{
                    width: 34, fontSize: 7, fontFamily: THEME.mono, padding: "1px 3px",
                    background: "#0b0b16", color: THEME.sub,
                    border: `1px solid ${THEME.border}`, borderRadius: 2, outline: "none",
                  }} />
                <span style={{ fontSize: 7, color: THEME.dim, fontFamily: THEME.mono }}>dB/oct</span>
              </span>
            </div>
          </div>
          <canvas ref={liveSpecCanvasRef} style={{ display: "block", width: "100%", height: LSH }} />
        </div>

        {/* Drag handle */}
        <div onMouseDown={e => startResize(e, 'phase', panelW.phase)}
          style={{ width: 4, cursor: 'col-resize', background: 'transparent', flexShrink: 0 }}
          onMouseEnter={e => e.currentTarget.style.background = '#2a2a44'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'} />

        {/* 3-Band Phase Meter */}
        <div style={{ width: panelW.phase, flexShrink: 0, background: "#080812" }}>
          <div style={{ padding: "4px 6px 0" }}>
            <span style={{ fontSize: 7, color: THEME.dim, fontFamily: THEME.mono, letterSpacing: 1 }}>PHASE</span>
          </div>
          <canvas ref={phaseCanvasRef} style={{ display: "block", width: "100%", height: LSH }} />
        </div>

        {/* Drag handle */}
        <div onMouseDown={e => startResize(e, 'vs', panelW.vs)}
          style={{ width: 4, cursor: 'col-resize', background: 'transparent', flexShrink: 0 }}
          onMouseEnter={e => e.currentTarget.style.background = '#2a2a44'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'} />

        {/* Live Vectorscope */}
        <div style={{ width: panelW.vs, flexShrink: 0, background: "#080812" }}>
          <div style={{ padding: "4px 6px 0" }}>
            <span style={{ fontSize: 7, color: THEME.dim, fontFamily: THEME.mono, letterSpacing: 1 }}>VECTOR</span>
          </div>
          <canvas ref={vsCanvasRef} style={{ display: "block", width: "100%", height: LSH }} />
        </div>

        {/* Drag handle */}
        <div onMouseDown={e => startResize(e, 'lufs', panelW.lufs)}
          style={{ width: 4, cursor: 'col-resize', background: 'transparent', flexShrink: 0 }}
          onMouseEnter={e => e.currentTarget.style.background = '#2a2a44'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'} />

        {/* LUFS Meter */}
        <div style={{ width: panelW.lufs, flexShrink: 0, background: "#080812" }}>
          <div style={{ padding: "4px 6px 0" }}>
            <span style={{ fontSize: 7, color: THEME.dim, fontFamily: THEME.mono, letterSpacing: 1 }}>LUFS</span>
          </div>
          <canvas ref={lufsCanvasRef} style={{ display: "block", width: "100%", height: LSH }} />
        </div>
      </div>

      {/* Row resize handle — meters ↕ */}
      <div onMouseDown={e => startVResize(e, setMeterH, meterH, 50, 300, 'meterH')}
        style={{ height: 4, cursor: 'row-resize', background: 'transparent' }}
        onMouseEnter={e => e.currentTarget.style.background = '#2a2a44'}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'} />

      {/* Canvas Waveform with playhead overlay */}
      <div style={{ background: "#080812", borderRadius: "0 0 7px 7px", borderTop: "1px solid #111122" }}>
        {/* Zoom controls — scroll wheel on waveform for continuous zoom, reset button + indicator here */}
        <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "3px 6px 0" }}>
          <span style={{ fontSize: 7, color: THEME.dim, fontFamily: THEME.mono }}>ZOOM</span>
          <span style={{ fontSize: 7, color: zoom > 1 ? "#bb99ff" : THEME.dim, fontFamily: THEME.mono, minWidth: 30 }}>
            {zoom.toFixed(zoom >= 10 ? 0 : 1)}×
          </span>
          {zoom > 1 && (
            <button onClick={() => {
              setZoom(1); zoomRef.current = 1;
              scrollPctRef.current = 0; setScrollPct(0);
            }} style={{
              padding: "1px 6px", fontSize: 7, fontFamily: THEME.mono,
              background: "transparent", color: THEME.dim,
              border: `1px solid ${THEME.border}`, borderRadius: 2, cursor: "pointer",
            }}>RESET</button>
          )}
          {zoom > 1 && (
            <input type="range" min={0} max={100} value={Math.round(scrollPct * 100)} onChange={e => {
              const v = +e.target.value / 100;
              scrollPctRef.current = v; setScrollPct(v);
            }} style={{ flex: 1, height: 3, accentColor: THEME.accent, marginLeft: 4 }} />
          )}
          <span style={{ marginLeft: "auto", fontSize: 6, color: THEME.dim, fontFamily: THEME.mono, opacity: 0.5 }}>
            scroll to zoom · drag to scrub
          </span>
        </div>
        <div style={{ display: "flex", padding: "4px 0 0" }}>
          {/* dB Peak Meter — L/R bars */}
          <canvas ref={dbMeterCanvasRef} style={{ display: "block", width: 28, height: H, flexShrink: 0 }} />
          {/* Waveform + overlay */}
          <div ref={waveContainerRef} style={{ flex: 1, position: "relative", cursor: "pointer" }}
            onMouseDown={e => {
              const rect = e.currentTarget.getBoundingClientRect();
              if (zoom > 1 && e.clientY > rect.bottom - 8) { handleScrollDrag(e); return; }
              isDraggingRef.current = true;
              document.body.style.cursor = 'col-resize';
              if (playingRef.current) killSource();
              seek(e);
            }}
          >
            <canvas ref={waveCanvasRef} style={{ display: "block", width: "100%", height: H }} />
            <canvas ref={overlayCanvasRef} style={{
              position: "absolute", top: 0, left: 0, display: "block", width: "100%", height: H, pointerEvents: "none",
            }} />
          </div>
        </div>
      </div>

      {/* Row resize handle — waveform ↕ */}
      <div onMouseDown={e => startVResize(e, setWaveH, waveH, 60, 400, 'waveH')}
        style={{ height: 4, cursor: 'row-resize', background: 'transparent' }}
        onMouseEnter={e => e.currentTarget.style.background = '#2a2a44'}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'} />
    </div>
  );
}
