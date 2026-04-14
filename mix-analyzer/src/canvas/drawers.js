/* ════════════════════════════════════════════════════
   Pure canvas draw functions — extracted from PlaybackWaveform.jsx
   No React, no DOM imports. Canvas + data in, nothing out.
   ════════════════════════════════════════════════════ */

import { fft } from '../dsp/fft.js';
import { THEME, hexToRgb, withAlpha } from '../theme.js';

// DPR-aware canvas setup: sets physical pixel dimensions from CSS layout, applies scale transform.
// Returns { ctx, W, H, PW, PH, dpr } where W/H are logical CSS pixels for drawing.
function setupCanvas(canvas) {
  if (!canvas) return null;
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;
  const PW = Math.round(rect.width * dpr);
  const PH = Math.round(rect.height * dpr);
  if (canvas.width !== PW || canvas.height !== PH) {
    canvas.width = PW;
    canvas.height = PH;
  }
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, W: rect.width, H: rect.height, PW, PH, dpr };
}

// Persistent spectrograph scroll buffer (shared across frames)
let _heatmapBuf = null;
let _sgW = 0, _sgH = 0; // spectrograph buffer physical dimensions

function _buildSpecPoints(data, nyquist, slope, numPts, fMin, fMax, dbFloor, dbCeil) {
  const dataLen = data.length;
  const rawDb = new Float64Array(numPts);
  const rawFreq = new Float64Array(numPts);
  for (let i = 0; i < numPts; i++) {
    const t = i / (numPts - 1);
    const freq = fMin * Math.pow(fMax / fMin, t);
    rawFreq[i] = freq;
    const smoothOct = 1 / 6;
    const loFreq = freq * Math.pow(2, -smoothOct / 2);
    const hiFreq = freq * Math.pow(2, smoothOct / 2);
    const b0 = Math.max(0, Math.floor(loFreq / nyquist * dataLen));
    const b1 = Math.min(dataLen - 1, Math.ceil(hiFreq / nyquist * dataLen));
    let sum = 0, count = 0;
    for (let b = b0; b <= b1; b++) { sum += data[b]; count++; }
    let db = count > 0 ? sum / count : dbFloor;
    db += Math.log2(Math.max(freq, 1) / 1000) * slope;
    rawDb[i] = Math.max(dbFloor, Math.min(dbCeil, db));
  }
  return { rawDb, rawFreq };
}

export function drawLiveSpec(canvas, analyser, slope, mode, filterBank, msMode, scrubData = null) {
  const setup = setupCanvas(canvas);
  if (!setup) return;
  const { ctx, W, H, PW, PH, dpr } = setup;

  const fMin = 20, fMax = 20000;
  const dbFloor = -80, dbCeil = -10;
  const freqGrid = [50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000];
  const isSpectrograph = mode === "spectrograph";

  // ── Background ──
  ctx.fillStyle = THEME.waveBg;
  ctx.fillRect(0, 0, W, H);

  // Grid drawn in line mode; spectrograph overlays its own grid after putImageData
  if (!isSpectrograph) {
    for (const f of freqGrid) {
      const x = Math.log(f / fMin) / Math.log(fMax / fMin) * W;
      ctx.strokeStyle = THEME.waveGrid; ctx.lineWidth = 0.5;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }
    for (let db = Math.ceil(dbFloor / 10) * 10; db <= dbCeil; db += 10) {
      const y = H - ((db - dbFloor) / (dbCeil - dbFloor)) * H;
      ctx.strokeStyle = THEME.waveGrid; ctx.lineWidth = 0.5;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
      ctx.font = "6px 'JetBrains Mono', monospace"; ctx.fillStyle = THEME.waveGridText; ctx.textAlign = "right";
      ctx.fillText(`${db}`, W - 2, y - 2);
    }
  }

  const hasMS = (msMode && filterBank?.lAnalyser) || (msMode && scrubData?.dataS);
  if (!analyser && !hasMS && !scrubData) return;

  // ── Build spectrum data ──
  const numPts = 400;
  let rawDb, rawFreq, rawDbS, nyquist;

  if (msMode && filterBank?.lAnalyser) {
    // Correct M/S: compute Mid=(L+R)/2 and Side=(L-R)/2 in time domain,
    // apply Hann window, FFT each independently, then take magnitudes.
    // Using getFloatFrequencyData (magnitude only) discards phase and makes
    // Mid look identical to the mono mix — this is the correct approach.
    nyquist = filterBank.lAnalyser.context.sampleRate / 2;
    const N = filterBank.lAnalyser.fftSize;
    const dataL = new Float32Array(N), dataR = new Float32Array(N);
    filterBank.lAnalyser.getFloatTimeDomainData(dataL);
    filterBank.rAnalyser.getFloatTimeDomainData(dataR);

    const mRe = new Float64Array(N), mIm = new Float64Array(N);
    const sRe = new Float64Array(N), sIm = new Float64Array(N);
    for (let i = 0; i < N; i++) {
      const w = 0.5 * (1 - Math.cos(2 * Math.PI * i / (N - 1)));
      mRe[i] = (dataL[i] + dataR[i]) * 0.5 * w;
      sRe[i] = (dataL[i] - dataR[i]) * 0.5 * w;
    }
    fft(mRe, mIm);
    fft(sRe, sIm);

    const half = N / 2;
    const mData = new Float32Array(half), sData = new Float32Array(half);
    for (let k = 0; k < half; k++) {
      const mMag = Math.sqrt(mRe[k]*mRe[k] + mIm[k]*mIm[k]) / (N / 2);
      const sMag = Math.sqrt(sRe[k]*sRe[k] + sIm[k]*sIm[k]) / (N / 2);
      mData[k] = mMag > 1e-10 ? 20 * Math.log10(mMag) : -120;
      sData[k] = sMag > 1e-10 ? 20 * Math.log10(sMag) : -120;
    }
    ({ rawDb, rawFreq } = _buildSpecPoints(mData, nyquist, slope, numPts, fMin, fMax, dbFloor, dbCeil));
    ({ rawDb: rawDbS } = _buildSpecPoints(sData, nyquist, slope, numPts, fMin, fMax, dbFloor, dbCeil));
  } else if (analyser) {
    nyquist = analyser.context.sampleRate / 2;
    const data = new Float32Array(analyser.frequencyBinCount);
    analyser.getFloatFrequencyData(data);
    ({ rawDb, rawFreq } = _buildSpecPoints(data, nyquist, slope, numPts, fMin, fMax, dbFloor, dbCeil));
  } else if (scrubData) {
    nyquist = scrubData.nyquist;
    ({ rawDb, rawFreq } = _buildSpecPoints(scrubData.data, nyquist, slope, numPts, fMin, fMax, dbFloor, dbCeil));
    if (msMode && scrubData.dataS) {
      ({ rawDb: rawDbS } = _buildSpecPoints(scrubData.dataS, nyquist, slope, numPts, fMin, fMax, dbFloor, dbCeil));
    }
  } else return;

  // ── Spectrograph: scrolling spectrogram (physical pixels) ──
  if (isSpectrograph) {
    // Resize: resample existing buffer into new dimensions (preserve scroll history)
    if (!_heatmapBuf || _sgW !== PW || _sgH !== PH) {
      const newBuf = new ImageData(PW, PH);
      const nd = newBuf.data;
      for (let i = 3; i < nd.length; i += 4) nd[i] = 255;
      if (_heatmapBuf && _sgW > 0 && _sgH > 0) {
        const od = _heatmapBuf.data;
        const sx = _sgW / PW, sy = _sgH / PH;
        for (let y = 0; y < PH; y++) {
          const oy = Math.min(_sgH - 1, (y * sy) | 0);
          const oRow = oy * _sgW;
          const nRow = y * PW;
          for (let x = 0; x < PW; x++) {
            const ox = Math.min(_sgW - 1, (x * sx) | 0);
            const oOff = (oRow + ox) * 4;
            const nOff = (nRow + x) * 4;
            nd[nOff] = od[oOff]; nd[nOff+1] = od[oOff+1]; nd[nOff+2] = od[oOff+2];
          }
        }
      }
      _heatmapBuf = newBuf;
      _sgW = PW; _sgH = PH;
    }
    const imgData = _heatmapBuf;
    const scrollPx = Math.max(1, Math.round(dpr)); // 1 logical px per frame
    const stride = PW * 4;
    // Scroll left
    for (let y = 0; y < PH; y++) {
      const rowOff = y * stride;
      imgData.data.copyWithin(rowOff, rowOff + scrollPx * 4, rowOff + stride);
    }
    // Paint new column(s) at right edge
    for (let s = 0; s < scrollPx; s++) {
      const colX = PW - scrollPx + s;
      for (let py = 0; py < PH; py++) {
        const freqIdx = Math.floor((1 - py / PH) * (numPts - 1));
        const db = rawDb[freqIdx];
        const norm = Math.max(0, Math.min(1, (db - dbFloor) / (dbCeil - dbFloor)));
        let r, g, b;
        if (norm < 0.25) { r = 0; g = 0; b = Math.round(norm * 4 * 180); }
        else if (norm < 0.5) { const t = (norm - 0.25) * 4; r = 0; g = Math.round(t * 220); b = 180; }
        else if (norm < 0.75) { const t = (norm - 0.5) * 4; r = Math.round(t * 255); g = 220; b = Math.round(180 * (1 - t)); }
        else { const t = (norm - 0.75) * 4; r = 255; g = Math.round(220 + t * 35); b = Math.round(t * 255); }
        const off = (py * PW + colX) * 4;
        imgData.data[off] = r; imgData.data[off+1] = g; imgData.data[off+2] = b; imgData.data[off+3] = 255;
      }
    }
    // putImageData bypasses the DPR transform — reset to identity first
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.putImageData(imgData, 0, 0);
    // Re-apply DPR transform for overlay drawing
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Translucent grid overlay
    ctx.globalAlpha = 0.25;
    for (const f of freqGrid) {
      const x = Math.log(f / fMin) / Math.log(fMax / fMin) * W;
      ctx.strokeStyle = THEME.playhead; ctx.lineWidth = 0.4;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }
    ctx.globalAlpha = 1.0;
  }

  // ── Line curve(s) — drawn in both modes ──
  const pts = [];
  for (let i = 0; i < numPts; i++) {
    const x = (i / (numPts - 1)) * W;
    const y = H - ((rawDb[i] - dbFloor) / (dbCeil - dbFloor)) * H;
    pts.push([x, Math.max(0, Math.min(H, y))]);
  }
  if (pts.length < 2) return;

  const drawCurve = (ptArr, strokeColor, lw, glowColor, glowW) => {
    const path = () => {
      ctx.beginPath(); ctx.moveTo(ptArr[0][0], ptArr[0][1]);
      for (let i = 1; i < ptArr.length - 1; i++) {
        const cx = (ptArr[i][0] + ptArr[i+1][0]) / 2, cy = (ptArr[i][1] + ptArr[i+1][1]) / 2;
        ctx.quadraticCurveTo(ptArr[i][0], ptArr[i][1], cx, cy);
      }
      ctx.lineTo(ptArr[ptArr.length-1][0], ptArr[ptArr.length-1][1]);
    };
    if (glowColor) { path(); ctx.strokeStyle = glowColor; ctx.lineWidth = glowW; ctx.stroke(); }
    path(); ctx.strokeStyle = strokeColor; ctx.lineWidth = lw; ctx.stroke();
  };

  const [mr, mg, mb] = hexToRgb(THEME.midCurve);
  const [sr, sg, sb] = hexToRgb(THEME.sideCurve);

  if (hasMS) {
    const ptsS = Array.from({ length: numPts }, (_, i) => [
      (i / (numPts - 1)) * W,
      Math.max(0, Math.min(H, H - ((rawDbS[i] - dbFloor) / (dbCeil - dbFloor)) * H)),
    ]);
    if (!isSpectrograph) {
      // Fills only in line mode (would obscure spectrograph)
      const gradM = ctx.createLinearGradient(0, 0, 0, H);
      gradM.addColorStop(0, `rgba(${mr},${mg},${mb},0.2)`); gradM.addColorStop(1, `rgba(${mr},${mg},${mb},0.01)`);
      ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
      pts.forEach(p => ctx.lineTo(p[0], p[1]));
      ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath(); ctx.fillStyle = gradM; ctx.fill();
      const gradS = ctx.createLinearGradient(0, 0, 0, H);
      gradS.addColorStop(0, `rgba(${sr},${sg},${sb},0.15)`); gradS.addColorStop(1, `rgba(${sr},${sg},${sb},0.01)`);
      ctx.beginPath(); ctx.moveTo(ptsS[0][0], ptsS[0][1]);
      ptsS.forEach(p => ctx.lineTo(p[0], p[1]));
      ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath(); ctx.fillStyle = gradS; ctx.fill();
    }
    drawCurve(pts,  THEME.midCurve, 1.3, `rgba(${mr},${mg},${mb},0.3)`, 3);
    drawCurve(ptsS, THEME.sideCurve, 1.3, `rgba(${sr},${sg},${sb},0.3)`, 3);
    ctx.font = "7px 'JetBrains Mono', monospace"; ctx.textAlign = "left";
    ctx.fillStyle = isSpectrograph ? `rgba(${mr},${mg},${mb},0.8)` : THEME.midCurve; ctx.fillText("MID", 6, 12);
    ctx.fillStyle = isSpectrograph ? `rgba(${sr},${sg},${sb},0.8)` : THEME.sideCurve; ctx.fillText("SIDE", 6, 22);
  } else {
    if (!isSpectrograph) {
      const bandRanges = [[20, 200, THEME.bandLow], [200, 4000, THEME.bandMid], [4000, 20000, THEME.bandHigh]];
      for (const [lo, hi, color] of bandRanges) {
        const i0 = pts.findIndex((_, i) => rawFreq[i] >= lo);
        const i1 = pts.findIndex((_, i) => rawFreq[i] >= hi);
        if (i0 < 0 || i1 < 0 || i0 >= i1) continue;
        ctx.beginPath(); ctx.moveTo(pts[i0][0], pts[i0][1]);
        for (let i = i0+1; i <= i1 && i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
        ctx.lineTo(pts[i1][0], H); ctx.lineTo(pts[i0][0], H); ctx.closePath();
        ctx.fillStyle = withAlpha(color, 0.09); ctx.fill();
      }
      const grad = ctx.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, `rgba(${mr},${mg},${mb},0.4)`);
      grad.addColorStop(0.5, `rgba(${mr},${mg},${mb},0.12)`);
      grad.addColorStop(1, `rgba(${mr},${mg},${mb},0.02)`);
      ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
      pts.forEach(p => ctx.lineTo(p[0], p[1]));
      ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath(); ctx.fillStyle = grad; ctx.fill();
    }
    drawCurve(pts, isSpectrograph ? withAlpha(THEME.midCurve, 0.8) : THEME.midCurve, 1.3,
      isSpectrograph ? `rgba(${mr},${mg},${mb},0.2)` : `rgba(${mr},${mg},${mb},0.3)`, 3);
  }

  // Freq labels
  ctx.font = "7px 'JetBrains Mono', monospace"; ctx.textAlign = "center";
  for (const f of [50, 200, 1000, 5000, 10000]) {
    const x = Math.log(f / fMin) / Math.log(fMax / fMin) * W;
    ctx.fillStyle = isSpectrograph ? withAlpha(THEME.playhead, 0.35) : THEME.waveGridText;
    ctx.fillText(f >= 1000 ? `${f/1000}k` : `${f}`, x, H - 3);
  }
}

function computeHighResFrames(buffer, waveData, startFrac, endFrac, targetFrames) {
  const ch0 = buffer.getChannelData(0);
  const ch1 = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : ch0;
  const sampleStart = Math.floor(startFrac * buffer.length);
  const sampleEnd   = Math.ceil(endFrac   * buffer.length);
  const rangeLen    = sampleEnd - sampleStart;
  const hopSize     = Math.max(1, Math.floor(rangeLen / targetFrames));
  const frames      = [];

  for (let s = sampleStart; s < sampleEnd; s += hopSize) {
    const end = Math.min(s + hopSize, sampleEnd);
    let mx = 0, mn = 0, sumSq = 0;
    for (let i = s; i < end; i++) {
      const v0 = ch0[i], v1 = ch1[i];
      if (v0 > mx) mx = v0;
      if (v1 > mx) mx = v1;
      if (v0 < mn) mn = v0;
      if (v1 < mn) mn = v1;
      const mid = (v0 + v1) * 0.5;
      sumSq += mid * mid;
    }
    const rms = Math.sqrt(sumSq / (end - s));
    const t = ((s + hopSize / 2) - sampleStart) / rangeLen;
    const coarseIdx = Math.min(
      Math.floor((startFrac + t * (endFrac - startFrac)) * waveData.length),
      waveData.length - 1
    );
    const { low, mid, high } = waveData[coarseIdx];
    frames.push({ mx, mn, rms, low, mid, high });
  }
  return frames;
}

export function drawWaveCanvas(canvas, waveData, prefs, duration, bpm, keyData, zoom = 1, scrollPct = 0, buffer = null) {
  if (!canvas || !waveData?.length) return;
  const setup = setupCanvas(canvas);
  if (!setup) return;
  const { ctx, W, H } = setup;
  const isSpectral = prefs.waveMode === "spectral";
  const toggles = prefs.bandToggles;

  ctx.clearRect(0, 0, W, H);

  // Zoom/scroll: which slice of waveData frames is visible
  const visibleFrac = 1 / zoom;
  // scrollPct 0 = start, 1 = full scroll to right edge
  const maxScrollPct = 1 - visibleFrac;
  const startFrac = Math.min(scrollPct, maxScrollPct);
  const endFrac = startFrac + visibleFrac;
  const iStart = Math.floor(startFrac * waveData.length);
  const iEnd = Math.min(Math.ceil(endFrac * waveData.length), waveData.length);

  // Frame source: raw buffer at zoom ≥ 4 for pixel-perfect amplitude; waveData otherwise
  let frames;
  if (zoom >= 4 && buffer != null) {
    frames = computeHighResFrames(buffer, waveData, startFrac, endFrac, Math.min(W, 2048));
  } else {
    frames = waveData.slice(iStart, iEnd);
  }
  const frameCount = frames.length;

  // Clip indicator dashes
  ctx.strokeStyle = withAlpha(THEME.clipIndicator, 0.08); ctx.lineWidth = 0.5;
  ctx.setLineDash([3, 3]);
  ctx.beginPath(); ctx.moveTo(0, 0.5); ctx.lineTo(W, 0.5); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, H - 0.5); ctx.lineTo(W, H - 0.5); ctx.stroke();
  ctx.setLineDash([]);

  // Center line
  ctx.strokeStyle = THEME.waveCenter; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, H / 2); ctx.lineTo(W, H / 2); ctx.stroke();

  if (isSpectral) {
    const bw = Math.max(0.8, W / frameCount);
    const blendMode = prefs.spectralBlend === "classic" ? "classic" : "layered";

    if (blendMode === "classic") {
      // Single weighted-color stroke per column (original Phase 1 visual).
      for (let fi = 0; fi < frameCount; fi++) {
        const frame = frames[fi];
        const x = (fi / frameCount) * W;
        const amplitude = frame.rms * H / 2;
        if (amplitude < 0.3) continue;

        let low = toggles[0] ? frame.low : 0;
        let mid = toggles[1] ? frame.mid : 0;
        let high = toggles[2] ? frame.high : 0;
        const sum = low + mid + high;
        if (sum < 0.001) continue;
        low /= sum; mid /= sum; high /= sum;

        const [lr, lg, lb] = hexToRgb(THEME.bandLow);
        const [midR, midG, midB] = hexToRgb(THEME.bandMid);
        const [hr, hg, hb] = hexToRgb(THEME.bandHigh);
        const r = Math.round(low * lr + mid * midR + high * hr);
        const g = Math.round(low * lg + mid * midG + high * hg);
        const b = Math.round(low * lb + mid * midB + high * hb);
        const peakH = Math.max(frame.mx, -frame.mn) * H / 2;

        ctx.lineWidth = bw;
        ctx.strokeStyle = `rgba(${r},${g},${b},0.18)`;
        ctx.beginPath(); ctx.moveTo(x, H / 2 - peakH); ctx.lineTo(x, H / 2 + peakH); ctx.stroke();
        ctx.strokeStyle = `rgba(${r},${g},${b},0.7)`;
        ctx.beginPath(); ctx.moveTo(x, H / 2 - amplitude); ctx.lineTo(x, H / 2 + amplitude); ctx.stroke();
      }
    } else {
      // Layered additive: per-band strokes under `lighter`, alpha scaled by band
      // proportion so sum-of-alphas = BASE (no whiteout on overlap).
      const BAND_COLORS = [
        hexToRgb(THEME.bandLow),
        hexToRgb(THEME.bandMid),
        hexToRgb(THEME.bandHigh),
      ];
      const PEAK_BASE = 0.32;
      const RMS_BASE = 0.92;
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.lineWidth = bw;
      for (let fi = 0; fi < frameCount; fi++) {
        const frame = frames[fi];
        const x = (fi / frameCount) * W;
        const amplitude = frame.rms * H / 2;
        if (amplitude < 0.3) continue;

        const v0 = toggles[0] ? frame.low : 0;
        const v1 = toggles[1] ? frame.mid : 0;
        const v2 = toggles[2] ? frame.high : 0;
        const sum = v0 + v1 + v2;
        if (sum < 0.001) continue;
        const peakH = Math.max(frame.mx, -frame.mn) * H / 2;

        const vals = [v0 / sum, v1 / sum, v2 / sum];
        for (let bi = 0; bi < 3; bi++) {
          const v = vals[bi];
          if (v <= 0) continue;
          const [r, g, b] = BAND_COLORS[bi];
          ctx.strokeStyle = `rgba(${r},${g},${b},${(PEAK_BASE * v).toFixed(4)})`;
          ctx.beginPath(); ctx.moveTo(x, H / 2 - peakH); ctx.lineTo(x, H / 2 + peakH); ctx.stroke();
          ctx.strokeStyle = `rgba(${r},${g},${b},${(RMS_BASE * v).toFixed(4)})`;
          ctx.beginPath(); ctx.moveTo(x, H / 2 - amplitude); ctx.lineTo(x, H / 2 + amplitude); ctx.stroke();
        }
      }
      ctx.restore();
    }
  } else {
    const bw = Math.max(0.65, W / frameCount);
    for (let fi = 0; fi < frameCount; fi++) {
      const frame = frames[fi];
      const x = (fi / frameCount) * W;
      const [ar, ag, ab] = hexToRgb(THEME.accent);
      ctx.lineWidth = bw;
      ctx.strokeStyle = `rgba(${ar},${ag},${ab},0.11)`;
      ctx.beginPath(); ctx.moveTo(x, H / 2 - frame.mx * H / 2); ctx.lineTo(x, H / 2 - frame.mn * H / 2); ctx.stroke();
      ctx.strokeStyle = `rgba(${ar},${ag},${ab},0.5)`;
      ctx.beginPath(); ctx.moveTo(x, H / 2 - frame.rms * H / 2); ctx.lineTo(x, H / 2 + frame.rms * H / 2); ctx.stroke();
    }
  }

  // Per-frame clipping strip (2px at top) — red where any sample hits full scale
  const CLIP_THRESH = 0.999;
  const bwClip = Math.max(1, W / frameCount);
  for (let fi = 0; fi < frameCount; fi++) {
    const frame = frames[fi];
    if (frame.mx >= CLIP_THRESH || frame.mn <= -CLIP_THRESH) {
      const x = (fi / frameCount) * W;
      ctx.fillStyle = withAlpha(THEME.clipIndicator, 0.8);
      ctx.fillRect(x, 0, bwClip + 0.5, 3);
    }
  }

  // Beat grid: adaptive subdivisions appear as you zoom in (bar → beat → 8th → 16th)
  if (bpm > 0 && duration > 0) {
    const [br, bg, bb] = hexToRgb(THEME.beatGrid);
    const beatInterval = 60 / bpm;
    const barInterval = beatInterval * 4;
    const visibleStart = startFrac * duration;
    const visibleEnd = endFrac * duration;
    const visibleDuration = visibleEnd - visibleStart;
    // Choose subdivision so we aim for ~12-48 lines on screen at once
    const pixelsPerBeat = W * beatInterval / visibleDuration;
    const subDiv = pixelsPerBeat >= 60 ? 4 : pixelsPerBeat >= 30 ? 2 : 1;
    const subInterval = beatInterval / subDiv;
    const firstT = Math.floor(visibleStart / subInterval) * subInterval;
    for (let t = firstT; t <= visibleEnd + subInterval * 0.5; t += subInterval) {
      if (t < 0) continue;
      const x = ((t - visibleStart) / visibleDuration) * W;
      if (x < 0 || x > W) continue;
      const isBar  = (t % barInterval)  < subInterval * 0.3;
      const isBeat = !isBar && (t % beatInterval) < subInterval * 0.3;
      if (isBar) {
        ctx.strokeStyle = `rgba(${br},${bg},${bb},0.35)`; ctx.lineWidth = 1;
      } else if (isBeat) {
        ctx.strokeStyle = `rgba(${br},${bg},${bb},0.15)`; ctx.lineWidth = 0.5;
      } else {
        ctx.strokeStyle = `rgba(${br},${bg},${bb},0.06)`; ctx.lineWidth = 0.35;
      }
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }
  }

  // BPM + key corner labels
  ctx.font = "bold 8px 'JetBrains Mono', monospace";
  if (bpm > 0) {
    ctx.textAlign = "left";
    ctx.fillStyle = withAlpha(THEME.beatGrid, 0.7);
    ctx.fillText(`${bpm} BPM`, 6, 11);
  }
  if (keyData?.key) {
    const keyColor = keyData.mode === "minor" ? THEME.keyMinor : THEME.keyMajor;
    ctx.textAlign = "right";
    ctx.fillStyle = withAlpha(keyColor, 0.73);
    ctx.fillText(keyData.key, W - 6, 11);
  }

  // Zoom position indicator (mini map strip) — visible only when zoomed
  if (zoom > 1) {
    const [tr, tg, tb] = hexToRgb(THEME.text);
    const [ar2, ag2, ab2] = hexToRgb(THEME.accent);
    ctx.fillStyle = `rgba(${tr},${tg},${tb},0.04)`;
    ctx.fillRect(0, H - 4, W, 4);
    const thumbW = W * visibleFrac;
    const thumbX = startFrac * W;
    ctx.fillStyle = `rgba(${ar2},${ag2},${ab2},0.35)`;
    ctx.fillRect(thumbX, H - 4, thumbW, 4);
  }
}

export function drawOverlay(canvas, position, duration, zoom = 1, scrollPct = 0) {
  if (!canvas) return;
  const setup = setupCanvas(canvas);
  if (!setup) return;
  const { ctx, W, H } = setup;
  ctx.clearRect(0, 0, W, H);
  if (position <= 0 || duration <= 0) return;

  const visibleFrac = 1 / zoom;
  const maxScrollPct = 1 - visibleFrac;
  const startFrac = Math.min(scrollPct, maxScrollPct);
  const endFrac = startFrac + visibleFrac;
  const posFrac = position / duration;

  // Playhead only visible if within current view
  if (posFrac < startFrac || posFrac > endFrac) return;
  const px = ((posFrac - startFrac) / visibleFrac) * W;

  const [ar, ag, ab] = hexToRgb(THEME.accent);
  const [pr, pg, pb] = hexToRgb(THEME.playhead);
  ctx.fillStyle = `rgba(${ar},${ag},${ab},0.04)`;
  ctx.fillRect(0, 0, Math.max(0, px), H);

  ctx.strokeStyle = `rgba(${pr},${pg},${pb},0.8)`; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, H); ctx.stroke();

  ctx.fillStyle = `rgba(${pr},${pg},${pb},0.85)`;
  ctx.beginPath(); ctx.arc(px, H / 2, 3, 0, Math.PI * 2); ctx.fill();
}

/* ════════════════════════════════════════════════════
   Phase 3: 3-Band Stereo Phase Meter
   ════════════════════════════════════════════════════ */

function drawPhaseBand(ctx, band, corr, W, rowH, bandNames, bandColors) {
  const y = band * rowH;
  const barLeft = 35, barRight = W - 30, barW = barRight - barLeft;
  const centerX = barLeft + barW / 2;
  const barY = y + rowH / 2;

  ctx.fillStyle = THEME.waveCard;
  ctx.fillRect(barLeft, barY - 6, barW, 12);

  ctx.strokeStyle = THEME.waveGridText; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(centerX, barY - 6); ctx.lineTo(centerX, barY + 6); ctx.stroke();

  ctx.font = "6px 'JetBrains Mono', monospace"; ctx.textAlign = "center";
  ctx.fillStyle = THEME.waveGridText;
  ctx.fillText("L", barLeft - 6, barY + 2);
  ctx.fillText("R", barRight + 6, barY + 2);

  const dotX = centerX + corr * (barW / 2);
  const dotColor = corr < 0 ? THEME.error : corr < 0.3 ? THEME.warn : bandColors[band];
  ctx.fillStyle = withAlpha(dotColor, 0.2);
  ctx.fillRect(Math.min(centerX, dotX), barY - 5, Math.abs(dotX - centerX), 10);
  ctx.beginPath(); ctx.arc(dotX, barY, 4, 0, Math.PI * 2);
  ctx.fillStyle = dotColor; ctx.fill();

  ctx.font = "7px 'JetBrains Mono', monospace"; ctx.textAlign = "left";
  ctx.fillStyle = bandColors[band]; ctx.fillText(bandNames[band], 4, barY + 3);

  ctx.font = "7px 'JetBrains Mono', monospace"; ctx.textAlign = "right";
  ctx.fillStyle = corr < 0 ? THEME.error : THEME.sub;
  ctx.fillText(corr.toFixed(2), W - 2, barY + 3);
}

export function drawPhaseMeter(canvas, filterBank, scrubPhaseData = null) {
  if (!canvas) return;
  const setup = setupCanvas(canvas);
  if (!setup) return;
  const { ctx, W, H } = setup;
  ctx.fillStyle = THEME.waveBg; ctx.fillRect(0, 0, W, H);

  const bandNames = ["LOW", "MID", "HIGH"];
  const bandColors = [THEME.bandLow, THEME.bandMid, THEME.bandHigh];
  const rowH = Math.floor(H / 3);

  if (!filterBank?.analysers?.length && !scrubPhaseData) {
    // No data — draw empty meter
    ctx.font = "7px 'JetBrains Mono', monospace"; ctx.textAlign = "left";
    for (let i = 0; i < 3; i++) {
      const y = i * rowH + rowH / 2;
      ctx.fillStyle = THEME.waveGridText; ctx.fillText(bandNames[i], 4, y + 3);
      ctx.strokeStyle = THEME.waveGrid; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(35, y); ctx.lineTo(W - 30, y); ctx.stroke();
      // Center tick
      const cx = 35 + (W - 65) / 2;
      ctx.strokeStyle = THEME.waveGridText; ctx.beginPath(); ctx.moveTo(cx, y - 5); ctx.lineTo(cx, y + 5); ctx.stroke();
    }
    return;
  }

  // Scrub path: correlation pre-computed from software biquad filters
  if (scrubPhaseData) {
    for (let band = 0; band < 3; band++) {
      drawPhaseBand(ctx, band, scrubPhaseData[band], W, rowH, bandNames, bandColors);
    }
    return;
  }

  const analysers = filterBank.analysers; // [lowL, midL, highL, lowR, midR, highR]

  for (let band = 0; band < 3; band++) {
    const aL = analysers[band];     // Left channel for this band
    const aR = analysers[band + 3]; // Right channel for this band
    const bufSize = aL.fftSize;
    const dataL = new Float32Array(bufSize);
    const dataR = new Float32Array(bufSize);
    aL.getFloatTimeDomainData(dataL);
    aR.getFloatTimeDomainData(dataR);

    // Pearson correlation coefficient
    let sumL = 0, sumR = 0, sumLR = 0, sumL2 = 0, sumR2 = 0;
    for (let i = 0; i < bufSize; i++) {
      sumL += dataL[i]; sumR += dataR[i];
      sumLR += dataL[i] * dataR[i];
      sumL2 += dataL[i] * dataL[i];
      sumR2 += dataR[i] * dataR[i];
    }
    const n = bufSize;
    const num = n * sumLR - sumL * sumR;
    const den = Math.sqrt((n * sumL2 - sumL * sumL) * (n * sumR2 - sumR * sumR));
    const corr = den > 0 ? num / den : 0;

    // Stereo width: RMS difference / RMS sum
    let diffRms = 0, sumRms = 0;
    for (let i = 0; i < bufSize; i++) {
      const mid = (dataL[i] + dataR[i]) / 2;
      const side = (dataL[i] - dataR[i]) / 2;
      diffRms += side * side;
      sumRms += mid * mid;
    }
    diffRms = Math.sqrt(diffRms / n);
    sumRms = Math.sqrt(sumRms / n);
    const _width = sumRms > 0.0001 ? Math.min(1, diffRms / sumRms) : 0; // reserved for future per-band width display
    drawPhaseBand(ctx, band, corr, W, rowH, bandNames, bandColors);
  }
}

/* ════════════════════════════════════════════════════
   Phase 3: Live LUFS Meter (momentary + short-term)
   ════════════════════════════════════════════════════ */

// Rolling history for short-term LUFS (3s window at ~60fps = ~180 frames)
let _lufsHistory = [];
let _lufsPeak = -60;
let _lufsPeakDecay = 0;
export function resetLufsState() {
  _lufsHistory = [];
  _lufsPeak = -60;
  _lufsPeakDecay = 0;
}

export function drawLufsMeter(canvas, analyser, scrubDb = null, prefs = null) {
  if (!canvas) return;
  const setup = setupCanvas(canvas);
  if (!setup) return;
  const { ctx, W, H } = setup;
  ctx.fillStyle = THEME.waveBg; ctx.fillRect(0, 0, W, H);

  const dbMin = -50, dbMax = 0;
  const dbRange = dbMax - dbMin;

  // Grid lines + dB scale labels
  const scaleW = 22;
  for (let db = -50; db <= 0; db += 10) {
    const y = H - ((db - dbMin) / dbRange) * H;
    ctx.strokeStyle = THEME.waveGrid; ctx.lineWidth = 0.5;
    ctx.beginPath(); ctx.moveTo(scaleW, y); ctx.lineTo(W, y); ctx.stroke();
    ctx.font = "7px 'JetBrains Mono', monospace"; ctx.textAlign = "right"; ctx.fillStyle = THEME.waveGridText;
    ctx.fillText(`${db}`, scaleW - 2, y + 3);
  }

  // Loudness target line
  if (prefs?.lufsTarget != null) {
    const tY = H - ((prefs.lufsTarget - dbMin) / dbRange) * H;
    if (tY > 0 && tY < H) {
      ctx.strokeStyle = withAlpha(THEME.good, 0.53); ctx.lineWidth = 1;
      ctx.setLineDash([4, 3]);
      ctx.beginPath(); ctx.moveTo(scaleW, tY); ctx.lineTo(W, tY); ctx.stroke();
      ctx.setLineDash([]);
      ctx.font = "6px 'JetBrains Mono', monospace"; ctx.textAlign = "right";
      ctx.fillStyle = withAlpha(THEME.good, 0.6);
      ctx.fillText(`${prefs.lufsTarget}`, scaleW - 2, tY - 1);
    }
  }

  const lufsColor = (db) => db > -6 ? THEME.error : db > -14 ? THEME.warn : THEME.info;

  // Scrub mode: use pre-computed momentaryDb, skip history + analyser
  if (scrubDb !== null) {
    const momentaryDb = Math.max(-60, scrubDb);
    const mH = Math.max(0, ((momentaryDb - dbMin) / dbRange)) * H;
    const mColor = lufsColor(momentaryDb);
    const mGrad = ctx.createLinearGradient(0, H - mH, 0, H);
    mGrad.addColorStop(0, mColor); mGrad.addColorStop(1, withAlpha(mColor, 0.27));
    const scaleW2 = 22, barsW2 = W - scaleW2 - 2;
    ctx.fillStyle = mGrad;
    ctx.fillRect(scaleW2, H - mH, barsW2, mH);
    ctx.font = "8px 'JetBrains Mono', monospace"; ctx.textAlign = "center";
    ctx.shadowColor = "rgba(0,0,0,0.85)"; ctx.shadowBlur = 3;
    ctx.fillStyle = THEME.text;
    ctx.fillText(momentaryDb > -60 ? momentaryDb.toFixed(1) : "---", scaleW2 + barsW2 / 2, 10);
    ctx.shadowBlur = 0;
    ctx.font = "6px 'JetBrains Mono', monospace";
    ctx.fillStyle = THEME.dim; ctx.fillText("SCRUB", scaleW2 + barsW2 / 2, H - 2);
    return;
  }

  if (!analyser) {
    _lufsHistory = [];
    _lufsPeak = -60;
    return;
  }

  const bufSize = analyser.fftSize;
  const data = new Float32Array(bufSize);
  analyser.getFloatTimeDomainData(data);

  // Compute RMS → dB (approximate LUFS without K-weighting for live display)
  let sumSq = 0;
  for (let i = 0; i < bufSize; i++) sumSq += data[i] * data[i];
  const rms = Math.sqrt(sumSq / bufSize);
  const momentaryDb = rms > 0.00001 ? 20 * Math.log10(rms) : -60;

  // Track rolling history for short-term (3s ≈ 180 frames at 60fps)
  _lufsHistory.push(momentaryDb);
  if (_lufsHistory.length > 180) _lufsHistory.shift();

  // Short-term: average of last 3s in linear domain
  let stSum = 0;
  for (const db of _lufsHistory) stSum += Math.pow(10, db / 10);
  const shortTermDb = 10 * Math.log10(stSum / _lufsHistory.length);

  // Peak tracking with decay
  if (momentaryDb > _lufsPeak) { _lufsPeak = momentaryDb; _lufsPeakDecay = 0; }
  _lufsPeakDecay++;
  if (_lufsPeakDecay > 120) _lufsPeak = Math.max(_lufsPeak - 0.15, momentaryDb); // slow decay after 2s

  // Proportional bar geometry based on canvas width
  const barsW = W - scaleW - 2;
  const barLeft = scaleW, barW = Math.round(barsW * 0.52);
  const stBarLeft = barLeft + barW + 3, stBarW = barsW - barW - 3;

  // Momentary bar
  const mH = Math.max(0, ((momentaryDb - dbMin) / dbRange)) * H;
  const mColor = lufsColor(momentaryDb);
  const mGrad = ctx.createLinearGradient(0, H - mH, 0, H);
  mGrad.addColorStop(0, mColor);
  mGrad.addColorStop(1, withAlpha(mColor, 0.27));
  ctx.fillStyle = mGrad;
  ctx.fillRect(barLeft, H - mH, barW, mH);

  // Short-term bar
  const stH = Math.max(0, ((shortTermDb - dbMin) / dbRange)) * H;
  ctx.fillStyle = withAlpha(THEME.accent, 0.33);
  ctx.fillRect(stBarLeft, H - stH, stBarW, stH);

  // Peak line
  const peakY = H - ((_lufsPeak - dbMin) / dbRange) * H;
  if (peakY > 0 && peakY < H) {
    ctx.strokeStyle = withAlpha(THEME.playhead, 0.53); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(barLeft - 2, peakY); ctx.lineTo(stBarLeft + stBarW + 2, peakY); ctx.stroke();
  }

  // Value readouts above each bar — constant light text with shadow for legibility over any bar color
  ctx.shadowColor = "rgba(0,0,0,0.85)"; ctx.shadowBlur = 3;
  ctx.font = "8px 'JetBrains Mono', monospace"; ctx.textAlign = "center";
  ctx.fillStyle = THEME.text;
  ctx.fillText(momentaryDb > -60 ? momentaryDb.toFixed(1) : "---", barLeft + barW / 2, 10);
  ctx.font = "7px 'JetBrains Mono', monospace";
  ctx.fillText(shortTermDb > -60 ? shortTermDb.toFixed(1) : "---", stBarLeft + stBarW / 2, 10);
  ctx.shadowBlur = 0;

  // Column labels at bottom
  ctx.font = "6px 'JetBrains Mono', monospace"; ctx.textAlign = "center";
  ctx.fillStyle = THEME.dim;
  ctx.fillText("M", barLeft + barW / 2, H - 2);
  ctx.fillText("ST", stBarLeft + stBarW / 2, H - 2);

}

/* ════════════════════════════════════════════════════
   dB Peak Meter — L/R bars with peak hold
   ════════════════════════════════════════════════════ */

let _dbPeakL = -90, _dbPeakR = -90;
let _dbDecayL = 0, _dbDecayR = 0;

export function resetDBMeterState() {
  _dbPeakL = _dbPeakR = -90;
  _dbDecayL = _dbDecayR = 0;
}

export function drawDBMeter(canvas, lAnalyser, rAnalyser) {
  if (!canvas) return;
  const setup = setupCanvas(canvas);
  if (!setup) return;
  const { ctx, W, H } = setup;

  ctx.fillStyle = THEME.waveBg;
  ctx.fillRect(0, 0, W, H);

  const dbMin = -60, dbMax = 0, dbRange = dbMax - dbMin;
  const gap = 2;
  const barW = Math.floor((W - gap) / 2);

  // Grid lines
  for (const db of [-6, -12, -18, -24, -36, -48]) {
    const y = H - ((db - dbMin) / dbRange) * H;
    ctx.strokeStyle = THEME.waveGrid; ctx.lineWidth = 0.5;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  }
  // dB labels
  ctx.font = "5px 'JetBrains Mono', monospace"; ctx.textAlign = "center";
  for (const db of [-12, -24, -48]) {
    const y = H - ((db - dbMin) / dbRange) * H;
    ctx.fillStyle = THEME.waveGridText;
    ctx.fillText(`${db}`, W / 2, y - 1);
  }
  // 0 dBFS ceiling marker
  ctx.strokeStyle = withAlpha(THEME.error, 0.13); ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, 1); ctx.lineTo(W, 1); ctx.stroke();

  if (!lAnalyser) { _dbPeakL = _dbPeakR = -90; _dbDecayL = _dbDecayR = 0; return; }

  const bufSize = lAnalyser.fftSize;
  const dataL = new Float32Array(bufSize);
  const dataR = new Float32Array(bufSize);
  lAnalyser.getFloatTimeDomainData(dataL);
  if (rAnalyser) rAnalyser.getFloatTimeDomainData(dataR);
  else dataL.forEach((v, i) => { dataR[i] = v; });

  let peakL = 0, peakR = 0;
  for (let i = 0; i < bufSize; i++) {
    const al = Math.abs(dataL[i]), ar = Math.abs(dataR[i]);
    if (al > peakL) peakL = al;
    if (ar > peakR) peakR = ar;
  }
  const dbL = peakL > 0.00001 ? 20 * Math.log10(peakL) : -90;
  const dbR = peakR > 0.00001 ? 20 * Math.log10(peakR) : -90;

  if (dbL > _dbPeakL) { _dbPeakL = dbL; _dbDecayL = 0; }
  else { _dbDecayL++; if (_dbDecayL > 120) _dbPeakL = Math.max(_dbPeakL - 0.3, dbL); }
  if (dbR > _dbPeakR) { _dbPeakR = dbR; _dbDecayR = 0; }
  else { _dbDecayR++; if (_dbDecayR > 120) _dbPeakR = Math.max(_dbPeakR - 0.3, dbR); }

  function drawBar(db, peakDb, x) {
    const clamped = Math.max(dbMin, db);
    const barH = Math.max(0, (clamped - dbMin) / dbRange) * H;
    const color = db > -3 ? THEME.error : db > -12 ? THEME.warn : THEME.info;
    const grad = ctx.createLinearGradient(x, H - barH, x, H);
    grad.addColorStop(0, color); grad.addColorStop(1, withAlpha(color, 0.33));
    ctx.fillStyle = grad;
    ctx.fillRect(x, H - barH, barW, barH);
    // Peak hold tick
    const peakY = H - Math.max(0, (Math.max(dbMin, peakDb) - dbMin) / dbRange) * H;
    if (peakY > 1 && peakY < H - 8) {
      ctx.fillStyle = peakDb > -3 ? withAlpha(THEME.error, 0.8) : withAlpha(THEME.playhead, 0.67);
      ctx.fillRect(x, peakY, barW, 2);
    }
    // Clip flash at top
    if (db > -0.5) {
      ctx.fillStyle = withAlpha(THEME.error, 0.53);
      ctx.fillRect(x, 0, barW, 3);
    }
  }

  drawBar(dbL, _dbPeakL, 0);
  drawBar(dbR, _dbPeakR, barW + gap);

  // L / R labels
  ctx.font = "5px 'JetBrains Mono', monospace"; ctx.textAlign = "center";
  ctx.fillStyle = THEME.waveGridText;
  ctx.fillText("L", barW / 2, H - 1);
  ctx.fillText("R", barW + gap + barW / 2, H - 1);
}

/* ════════════════════════════════════════════════════
   Phase 3: Live Vectorscope (Canvas Lissajous)
   ════════════════════════════════════════════════════ */

export function drawVectorscope(canvas, filterBank, scrubVsData = null, style = "dots") {
  if (!canvas) return;
  const setup = setupCanvas(canvas);
  if (!setup) return;
  const { ctx, W, H } = setup;

  // Wide mode (W > H): anchor centre at bottom, only M>0 half visible.
  // Normal mode: full circle centred in the smaller dimension, centred in canvas.
  const isWide = W > H * 1.1;
  const radius = isWide ? H * 0.88 : Math.min(W, H) * 0.41;
  const cx = W / 2;
  const cy = isWide ? H : Math.min(W, H) / 2 + (H - Math.min(W, H)) / 2;
  const labelSz = Math.max(6, Math.round(Math.min(W, H) * 0.07));

  ctx.fillStyle = THEME.waveBg;
  ctx.fillRect(0, 0, W, H);

  // Axes
  ctx.strokeStyle = THEME.waveGrid; ctx.lineWidth = 0.5;
  ctx.beginPath(); ctx.moveTo(cx, 0); ctx.lineTo(cx, H); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, cy); ctx.lineTo(W, cy); ctx.stroke();

  if (!isWide) {
    ctx.strokeStyle = THEME.waveCenter; ctx.lineWidth = 0.3;
    ctx.beginPath(); ctx.moveTo(0, cy + cx); ctx.lineTo(cx + (H - cy), 0); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(W, cy + (W - cx)); ctx.lineTo(W - (H - cy), 0); ctx.stroke();
  }

  // Reference circles
  ctx.strokeStyle = THEME.waveGrid; ctx.lineWidth = 0.4;
  ctx.beginPath(); ctx.arc(cx, cy, radius * 0.5, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2); ctx.stroke();

  // Labels
  ctx.font = `${labelSz}px 'JetBrains Mono', monospace`;
  ctx.fillStyle = THEME.waveGridText;
  ctx.textAlign = "center";
  ctx.fillText("M", cx, labelSz + 2);
  ctx.textAlign = "right";
  ctx.fillText("R", W - 2, cy - 2);
  ctx.textAlign = "left";
  ctx.fillText("L", 2, cy - 2);

  // Scrub mode: draw multiband RGB dots from buffer slice + pre-filtered bands,
  // matching the live playback render path (scrubVsData.bandSlices = [lL,lM,lH,rL,rM,rH])
  if (scrubVsData) {
    const { lSlice, rSlice, bandSlices } = scrubVsData;
    if (bandSlices && bandSlices.length >= 6) {
      const n = lSlice.length;
      const bandRGB = [hexToRgb(THEME.bandLow), hexToRgb(THEME.bandMid), hexToRgb(THEME.bandHigh)];
      ctx.globalCompositeOperation = "lighter";
      const dotR = Math.max(0.9, Math.min(W, H) * 0.006);
      for (let i = 0; i < n; i++) {
        const m = (lSlice[i] + rSlice[i]) * 0.7071;
        const s = (rSlice[i] - lSlice[i]) * 0.7071;
        const px = cx + s * radius;
        const py = cy - m * radius;
        if (px < 0 || px > W || py < 0 || py > H) continue;
        const e = [0, 1, 2].map(b => {
          const lv = bandSlices[b][i], rv = bandSlices[b + 3][i];
          return lv * lv + rv * rv;
        });
        const eSum = e[0] + e[1] + e[2] + 1e-12;
        const [rw, gw, bw] = e.map(v => v / eSum);
        const r = Math.round(rw * bandRGB[0][0] + gw * bandRGB[1][0] + bw * bandRGB[2][0]);
        const g = Math.round(rw * bandRGB[0][1] + gw * bandRGB[1][1] + bw * bandRGB[2][1]);
        const b = Math.round(rw * bandRGB[0][2] + gw * bandRGB[1][2] + bw * bandRGB[2][2]);
        if (style === "pixels") {
          ctx.fillStyle = `rgba(${r},${g},${b},0.5)`;
          ctx.fillRect(px | 0, py | 0, 1, 1);
        } else {
          ctx.fillStyle = `rgba(${r},${g},${b},0.22)`;
          ctx.beginPath(); ctx.arc(px, py, dotR, 0, Math.PI * 2); ctx.fill();
        }
      }
      ctx.globalCompositeOperation = "source-over";
    } else {
      ctx.beginPath();
      for (let i = 0; i < lSlice.length; i++) {
        const m = (lSlice[i] + rSlice[i]) * 0.7071;
        const s = (rSlice[i] - lSlice[i]) * 0.7071;
        const px = cx + s * radius;
        const py = cy - m * radius;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.strokeStyle = withAlpha(THEME.midCurve, 0.25);
      ctx.lineWidth = 0.8;
      ctx.stroke();
    }
    return;
  }

  if (!filterBank?.lAnalyser) return;

  const bufSize = filterBank.lAnalyser.fftSize;
  const lData = new Float32Array(bufSize);
  const rData = new Float32Array(bufSize);
  filterBank.lAnalyser.getFloatTimeDomainData(lData);
  filterBank.rAnalyser.getFloatTimeDomainData(rData);

  const hasMultiband = filterBank.analysers?.length >= 6;
  if (hasMultiband) {
    const bandBufSize = filterBank.analysers[0].fftSize;
    const bandData = Array.from({ length: 6 }, (_, i) => {
      const d = new Float32Array(bandBufSize);
      filterBank.analysers[i].getFloatTimeDomainData(d);
      return d;
    });
    // Use tail of wideband buffer to align temporal window with band buffers (1:1 sample mapping)
    const wbOffset = bufSize - bandBufSize;
    const bandRGB = [hexToRgb(THEME.bandLow), hexToRgb(THEME.bandMid), hexToRgb(THEME.bandHigh)];
    ctx.globalCompositeOperation = "lighter";
    const dotR = Math.max(0.9, Math.min(W, H) * 0.006);
    for (let i = 0; i < bandBufSize; i++) {
      const wi = wbOffset + i;
      const m = (lData[wi] + rData[wi]) * 0.7071;
      const s = (rData[wi] - lData[wi]) * 0.7071;
      const px = cx + s * radius;
      const py = cy - m * radius;
      if (px < 0 || px > W || py < 0 || py > H) continue;
      const e = [0, 1, 2].map(b => {
        const lv = bandData[b][i], rv = bandData[b + 3][i];
        return lv * lv + rv * rv;
      });
      const eSum = e[0] + e[1] + e[2] + 1e-12;
      const [rw, gw, bw] = e.map(v => v / eSum);
      const r = Math.round(rw * bandRGB[0][0] + gw * bandRGB[1][0] + bw * bandRGB[2][0]);
      const g = Math.round(rw * bandRGB[0][1] + gw * bandRGB[1][1] + bw * bandRGB[2][1]);
      const b = Math.round(rw * bandRGB[0][2] + gw * bandRGB[1][2] + bw * bandRGB[2][2]);
      if (style === "pixels") {
        ctx.fillStyle = `rgba(${r},${g},${b},0.5)`;
        ctx.fillRect(px | 0, py | 0, 1, 1);
      } else {
        ctx.fillStyle = `rgba(${r},${g},${b},0.45)`;
        ctx.beginPath(); ctx.arc(px, py, dotR, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.globalCompositeOperation = "source-over";
  } else {
    ctx.beginPath();
    for (let i = 0; i < bufSize; i++) {
      const m = (lData[i] + rData[i]) * 0.7071;
      const s = (rData[i] - lData[i]) * 0.7071;
      const px = cx + s * radius;
      const py = cy - m * radius;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.strokeStyle = withAlpha(THEME.midCurve, 0.18);
    ctx.lineWidth = 0.7;
    ctx.stroke();
  }
}

export function resetHeatmapBuf() {
  _heatmapBuf = null;
}
