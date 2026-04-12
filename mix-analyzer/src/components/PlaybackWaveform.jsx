import { useState, useEffect, useRef, useCallback } from 'react';
import { THEME } from '../theme.js';
import { BANDS_3 } from '../constants.js';
import { fft } from '../dsp/fft.js';

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
  for (let i = 0; i < N; i++) { re[i] = ((L[offset+i]+R[offset+i])/2)*win[i]; im[i]=0; }
  fft(re, im);
  const half = N/2, data = new Float32Array(half);
  for (let i = 0; i < half; i++) {
    const mag = Math.sqrt(re[i]*re[i]+im[i]*im[i])/(N/2);
    data[i] = mag > 1e-10 ? 20*Math.log10(mag) : -100;
  }
  return { data, nyquist: sr/2 };
}

/* ════════════════════════════════════════════════════
   CANVAS DRAWING: Live Spectrum + Waveform (Phase 2)
   ════════════════════════════════════════════════════ */

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

function drawLiveSpec(canvas, analyser, slope, mode, filterBank, msMode, scrubData = null) {
  const setup = setupCanvas(canvas);
  if (!setup) return;
  const { ctx, W, H, PW, PH, dpr } = setup;

  const fMin = 20, fMax = 20000;
  const dbFloor = -80, dbCeil = -10;
  const freqGrid = [50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000];
  const isSpectrograph = mode === "spectrograph";

  // ── Background (always dark) ──
  ctx.fillStyle = "#080812";
  ctx.fillRect(0, 0, W, H);

  // Grid drawn in line mode; spectrograph overlays its own grid after putImageData
  if (!isSpectrograph) {
    for (const f of freqGrid) {
      const x = Math.log(f / fMin) / Math.log(fMax / fMin) * W;
      ctx.strokeStyle = "#151528"; ctx.lineWidth = 0.5;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }
    for (let db = Math.ceil(dbFloor / 10) * 10; db <= dbCeil; db += 10) {
      const y = H - ((db - dbFloor) / (dbCeil - dbFloor)) * H;
      ctx.strokeStyle = "#1a1a30"; ctx.lineWidth = 0.5;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
      ctx.font = "6px 'JetBrains Mono', monospace"; ctx.fillStyle = "#2a2a44"; ctx.textAlign = "right";
      ctx.fillText(`${db}`, W - 2, y - 2);
    }
  }

  const hasMS = msMode && filterBank?.lAnalyser;
  if (!analyser && !hasMS && !scrubData) return;

  // ── Build spectrum data ──
  const numPts = 400;
  let rawDb, rawFreq, rawDbS, nyquist;

  if (hasMS) {
    nyquist = filterBank.lAnalyser.context.sampleRate / 2;
    const lLen = filterBank.lAnalyser.frequencyBinCount;
    const lFreq = new Float32Array(lLen), rFreq = new Float32Array(lLen);
    filterBank.lAnalyser.getFloatFrequencyData(lFreq);
    filterBank.rAnalyser.getFloatFrequencyData(rFreq);
    const mData = new Float32Array(lLen), sData = new Float32Array(lLen);
    for (let i = 0; i < lLen; i++) {
      const lL = Math.pow(10, lFreq[i] / 20), rL = Math.pow(10, rFreq[i] / 20);
      mData[i] = 20 * Math.log10((lL + rL) / 2 + 1e-10);
      sData[i] = 20 * Math.log10(Math.abs(rL - lL) / 2 + 1e-10);
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
  } else return;

  // ── Spectrograph: scrolling spectrogram (physical pixels) ──
  if (isSpectrograph) {
    // Reset buffer if canvas was resized
    if (!_heatmapBuf || _sgW !== PW || _sgH !== PH) {
      _heatmapBuf = new ImageData(PW, PH);
      _sgW = PW; _sgH = PH;
      for (let i = 3; i < _heatmapBuf.data.length; i += 4) _heatmapBuf.data[i] = 255;
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
      ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 0.4;
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

  if (hasMS) {
    const ptsS = Array.from({ length: numPts }, (_, i) => [
      (i / (numPts - 1)) * W,
      Math.max(0, Math.min(H, H - ((rawDbS[i] - dbFloor) / (dbCeil - dbFloor)) * H)),
    ]);
    if (!isSpectrograph) {
      // Fills only in line mode (would obscure spectrograph)
      const gradM = ctx.createLinearGradient(0, 0, 0, H);
      gradM.addColorStop(0, "rgba(51,170,255,0.2)"); gradM.addColorStop(1, "rgba(51,170,255,0.01)");
      ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
      pts.forEach(p => ctx.lineTo(p[0], p[1]));
      ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath(); ctx.fillStyle = gradM; ctx.fill();
      const gradS = ctx.createLinearGradient(0, 0, 0, H);
      gradS.addColorStop(0, "rgba(255,136,51,0.15)"); gradS.addColorStop(1, "rgba(255,136,51,0.01)");
      ctx.beginPath(); ctx.moveTo(ptsS[0][0], ptsS[0][1]);
      ptsS.forEach(p => ctx.lineTo(p[0], p[1]));
      ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath(); ctx.fillStyle = gradS; ctx.fill();
    }
    drawCurve(pts,  "#55ccff", 1.3, "rgba(51,170,255,0.3)", 3);
    drawCurve(ptsS, "#ff8833", 1.3, "rgba(255,136,51,0.3)", 3);
    ctx.font = "7px 'JetBrains Mono', monospace"; ctx.textAlign = "left";
    ctx.fillStyle = isSpectrograph ? "rgba(85,204,255,0.8)" : "#55ccff"; ctx.fillText("MID", 6, 12);
    ctx.fillStyle = isSpectrograph ? "rgba(255,136,51,0.8)" : "#ff8833"; ctx.fillText("SIDE", 6, 22);
  } else {
    if (!isSpectrograph) {
      const bandRanges = [[20, 200, "#ff5544"], [200, 4000, "#44cc66"], [4000, 20000, "#4488ff"]];
      for (const [lo, hi, color] of bandRanges) {
        const i0 = pts.findIndex((_, i) => rawFreq[i] >= lo);
        const i1 = pts.findIndex((_, i) => rawFreq[i] >= hi);
        if (i0 < 0 || i1 < 0 || i0 >= i1) continue;
        ctx.beginPath(); ctx.moveTo(pts[i0][0], pts[i0][1]);
        for (let i = i0+1; i <= i1 && i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
        ctx.lineTo(pts[i1][0], H); ctx.lineTo(pts[i0][0], H); ctx.closePath();
        ctx.fillStyle = color + "18"; ctx.fill();
      }
      const grad = ctx.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, "rgba(51,170,255,0.4)");
      grad.addColorStop(0.5, "rgba(51,170,255,0.12)");
      grad.addColorStop(1, "rgba(51,170,255,0.02)");
      ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
      pts.forEach(p => ctx.lineTo(p[0], p[1]));
      ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath(); ctx.fillStyle = grad; ctx.fill();
    }
    drawCurve(pts, isSpectrograph ? "#55ccffcc" : "#55ccff", 1.3,
      isSpectrograph ? "rgba(51,170,255,0.2)" : "rgba(51,170,255,0.3)", 3);
  }

  // Freq labels
  ctx.font = "7px 'JetBrains Mono', monospace"; ctx.textAlign = "center";
  for (const f of [50, 200, 1000, 5000, 10000]) {
    const x = Math.log(f / fMin) / Math.log(fMax / fMin) * W;
    ctx.fillStyle = isSpectrograph ? "rgba(255,255,255,0.35)" : "#3a3a55";
    ctx.fillText(f >= 1000 ? `${f/1000}k` : `${f}`, x, H - 3);
  }
}

function drawWaveCanvas(canvas, waveData, prefs, duration, bpm, keyData, zoom = 1, scrollPct = 0) {
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
  const visibleCount = iEnd - iStart;

  // Clip indicator dashes
  ctx.strokeStyle = "#ff336615"; ctx.lineWidth = 0.5;
  ctx.setLineDash([3, 3]);
  ctx.beginPath(); ctx.moveTo(0, 0.5); ctx.lineTo(W, 0.5); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, H - 0.5); ctx.lineTo(W, H - 0.5); ctx.stroke();
  ctx.setLineDash([]);

  // Center line
  ctx.strokeStyle = "#111120"; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, H / 2); ctx.lineTo(W, H / 2); ctx.stroke();

  if (isSpectral) {
    const bw = Math.max(0.8, W / visibleCount);
    for (let i = iStart; i < iEnd; i++) {
      const frame = waveData[i];
      const x = ((i - iStart) / visibleCount) * W;
      const amplitude = frame.rms * H / 2;
      if (amplitude < 0.3) continue;

      let low = toggles[0] ? frame.low : 0;
      let mid = toggles[1] ? frame.mid : 0;
      let high = toggles[2] ? frame.high : 0;
      const sum = low + mid + high;
      if (sum < 0.001) continue;
      low /= sum; mid /= sum; high /= sum;

      const r = Math.round(low * 255 + mid * 60 + high * 70);
      const g = Math.round(low * 80 + mid * 210 + high * 130);
      const b = Math.round(low * 60 + mid * 100 + high * 255);
      const peakH = Math.max(frame.mx, -frame.mn) * H / 2;

      ctx.lineWidth = bw;
      ctx.strokeStyle = `rgba(${r},${g},${b},0.18)`;
      ctx.beginPath(); ctx.moveTo(x, H / 2 - peakH); ctx.lineTo(x, H / 2 + peakH); ctx.stroke();
      ctx.strokeStyle = `rgba(${r},${g},${b},0.7)`;
      ctx.beginPath(); ctx.moveTo(x, H / 2 - amplitude); ctx.lineTo(x, H / 2 + amplitude); ctx.stroke();
    }
  } else {
    const bw = Math.max(0.65, W / visibleCount);
    for (let i = iStart; i < iEnd; i++) {
      const frame = waveData[i];
      const x = ((i - iStart) / visibleCount) * W;
      ctx.lineWidth = bw;
      ctx.strokeStyle = "rgba(102,68,255,0.11)";
      ctx.beginPath(); ctx.moveTo(x, H / 2 - frame.mx * H / 2); ctx.lineTo(x, H / 2 - frame.mn * H / 2); ctx.stroke();
      ctx.strokeStyle = "rgba(102,68,255,0.5)";
      ctx.beginPath(); ctx.moveTo(x, H / 2 - frame.rms * H / 2); ctx.lineTo(x, H / 2 + frame.rms * H / 2); ctx.stroke();
    }
  }

  // Beat grid: thin tick marks at BPM intervals
  if (bpm > 0 && duration > 0) {
    const beatInterval = 60 / bpm;
    const barInterval = beatInterval * 4;
    const visibleStart = startFrac * duration;
    const visibleEnd = endFrac * duration;
    ctx.lineWidth = 0.5;
    for (let t = 0; t < duration; t += beatInterval) {
      if (t < visibleStart || t > visibleEnd) continue;
      const x = ((t - visibleStart) / (visibleEnd - visibleStart)) * W;
      const isBarLine = Math.abs(t - Math.round(t / barInterval) * barInterval) < beatInterval * 0.1;
      ctx.strokeStyle = isBarLine ? "rgba(255,136,51,0.25)" : "rgba(255,136,51,0.1)";
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }
  }

  // BPM + key corner labels
  ctx.font = "bold 8px 'JetBrains Mono', monospace";
  if (bpm > 0) {
    ctx.textAlign = "left";
    ctx.fillStyle = "rgba(255,136,51,0.7)";
    ctx.fillText(`${bpm} BPM`, 6, 11);
  }
  if (keyData?.key) {
    const keyColor = keyData.mode === "minor" ? "#aa66ff" : "#33ccaa";
    ctx.textAlign = "right";
    ctx.fillStyle = keyColor + "bb";
    ctx.fillText(keyData.key, W - 6, 11);
  }

  // Zoom position indicator (mini map strip) — visible only when zoomed
  if (zoom > 1) {
    ctx.fillStyle = "rgba(255,255,255,0.04)";
    ctx.fillRect(0, H - 4, W, 4);
    const thumbW = W * visibleFrac;
    const thumbX = startFrac * W;
    ctx.fillStyle = "rgba(102,68,255,0.35)";
    ctx.fillRect(thumbX, H - 4, thumbW, 4);
  }
}

function drawOverlay(canvas, position, duration, zoom = 1, scrollPct = 0) {
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

  ctx.fillStyle = "rgba(102,68,255,0.04)";
  ctx.fillRect(0, 0, Math.max(0, px), H);

  ctx.strokeStyle = "rgba(255,255,255,0.8)"; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, H); ctx.stroke();

  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.beginPath(); ctx.arc(px, H / 2, 3, 0, Math.PI * 2); ctx.fill();
}

/* ════════════════════════════════════════════════════
   Phase 3: 3-Band Stereo Phase Meter
   ════════════════════════════════════════════════════ */

function drawPhaseMeter(canvas, filterBank) {
  if (!canvas) return;
  const setup = setupCanvas(canvas);
  if (!setup) return;
  const { ctx, W, H } = setup;
  ctx.fillStyle = "#080812"; ctx.fillRect(0, 0, W, H);

  const bandNames = ["LOW", "MID", "HIGH"];
  const bandColors = ["#ff5544", "#44cc66", "#4488ff"];
  const rowH = Math.floor(H / 3);

  if (!filterBank?.analysers?.length) {
    // No data — draw empty meter
    ctx.font = "7px 'JetBrains Mono', monospace"; ctx.textAlign = "left";
    for (let i = 0; i < 3; i++) {
      const y = i * rowH + rowH / 2;
      ctx.fillStyle = "#2a2a44"; ctx.fillText(bandNames[i], 4, y + 3);
      ctx.strokeStyle = "#1a1a30"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(35, y); ctx.lineTo(W - 30, y); ctx.stroke();
      // Center tick
      const cx = 35 + (W - 65) / 2;
      ctx.strokeStyle = "#2a2a44"; ctx.beginPath(); ctx.moveTo(cx, y - 5); ctx.lineTo(cx, y + 5); ctx.stroke();
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
    const width = sumRms > 0.0001 ? Math.min(1, diffRms / sumRms) : 0;

    const y = band * rowH;
    const barLeft = 35, barRight = W - 30, barW = barRight - barLeft;
    const centerX = barLeft + barW / 2;
    const barY = y + rowH / 2;

    // Background track
    ctx.fillStyle = "#0c0c1a";
    ctx.fillRect(barLeft, barY - 6, barW, 12);

    // Center line
    ctx.strokeStyle = "#2a2a44"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(centerX, barY - 6); ctx.lineTo(centerX, barY + 6); ctx.stroke();

    // L/R labels at ends
    ctx.font = "6px 'JetBrains Mono', monospace"; ctx.textAlign = "center";
    ctx.fillStyle = "#2a2a44";
    ctx.fillText("L", barLeft - 6, barY + 2);
    ctx.fillText("R", barRight + 6, barY + 2);

    // Correlation indicator dot — maps -1..+1 to left..right
    const dotX = centerX + corr * (barW / 2);
    const dotColor = corr < 0 ? "#ff3355" : corr < 0.3 ? "#ff8833" : bandColors[band];
    ctx.fillStyle = dotColor + "33";
    ctx.fillRect(Math.min(centerX, dotX), barY - 5, Math.abs(dotX - centerX), 10);
    ctx.beginPath(); ctx.arc(dotX, barY, 4, 0, Math.PI * 2);
    ctx.fillStyle = dotColor; ctx.fill();

    // Band label
    ctx.font = "7px 'JetBrains Mono', monospace"; ctx.textAlign = "left";
    ctx.fillStyle = bandColors[band]; ctx.fillText(bandNames[band], 4, barY + 3);

    // Correlation value
    ctx.font = "7px 'JetBrains Mono', monospace"; ctx.textAlign = "right";
    ctx.fillStyle = corr < 0 ? "#ff3355" : "#5a5a70";
    ctx.fillText(corr.toFixed(2), W - 2, barY + 3);
  }
}

/* ════════════════════════════════════════════════════
   Phase 3: Live LUFS Meter (momentary + short-term)
   ════════════════════════════════════════════════════ */

// Rolling history for short-term LUFS (3s window at ~60fps = ~180 frames)
let _lufsHistory = [];
let _lufsPeak = -60;
let _lufsPeakDecay = 0;

function drawLufsMeter(canvas, analyser) {
  if (!canvas) return;
  const setup = setupCanvas(canvas);
  if (!setup) return;
  const { ctx, W, H } = setup;
  ctx.fillStyle = "#080812"; ctx.fillRect(0, 0, W, H);

  const dbMin = -50, dbMax = 0;
  const dbRange = dbMax - dbMin;

  // Grid lines + dB scale labels
  const scaleW = 22;
  for (let db = -50; db <= 0; db += 10) {
    const y = H - ((db - dbMin) / dbRange) * H;
    ctx.strokeStyle = "#1a1a30"; ctx.lineWidth = 0.5;
    ctx.beginPath(); ctx.moveTo(scaleW, y); ctx.lineTo(W, y); ctx.stroke();
    ctx.font = "7px 'JetBrains Mono', monospace"; ctx.textAlign = "right"; ctx.fillStyle = "#3a3a55";
    ctx.fillText(`${db}`, scaleW - 2, y + 3);
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
  const mColor = momentaryDb > -6 ? "#ff3355" : momentaryDb > -14 ? "#ff8833" : "#33aaff";
  const mGrad = ctx.createLinearGradient(0, H - mH, 0, H);
  mGrad.addColorStop(0, mColor);
  mGrad.addColorStop(1, mColor + "44");
  ctx.fillStyle = mGrad;
  ctx.fillRect(barLeft, H - mH, barW, mH);

  // Short-term bar
  const stH = Math.max(0, ((shortTermDb - dbMin) / dbRange)) * H;
  ctx.fillStyle = "#6644ff55";
  ctx.fillRect(stBarLeft, H - stH, stBarW, stH);

  // Peak line
  const peakY = H - ((_lufsPeak - dbMin) / dbRange) * H;
  if (peakY > 0 && peakY < H) {
    ctx.strokeStyle = "#ffffff88"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(barLeft - 2, peakY); ctx.lineTo(stBarLeft + stBarW + 2, peakY); ctx.stroke();
  }

  // Value readouts above each bar
  ctx.font = "8px 'JetBrains Mono', monospace"; ctx.textAlign = "center";
  ctx.fillStyle = mColor;
  ctx.fillText(momentaryDb > -60 ? momentaryDb.toFixed(1) : "---", barLeft + barW / 2, 10);
  ctx.font = "7px 'JetBrains Mono', monospace";
  ctx.fillStyle = "#8866ff";
  ctx.fillText(shortTermDb > -60 ? shortTermDb.toFixed(1) : "---", stBarLeft + stBarW / 2, 10);

  // Column labels at bottom
  ctx.font = "6px 'JetBrains Mono', monospace"; ctx.textAlign = "center";
  ctx.fillStyle = "#4a4a66";
  ctx.fillText("M", barLeft + barW / 2, H - 2);
  ctx.fillText("ST", stBarLeft + stBarW / 2, H - 2);
}

/* ════════════════════════════════════════════════════
   Phase 3: Live Vectorscope (Canvas Lissajous)
   ════════════════════════════════════════════════════ */

function drawVectorscope(canvas, filterBank) {
  if (!canvas) return;
  const setup = setupCanvas(canvas);
  if (!setup) return;
  const { ctx, W, H } = setup;
  const S = Math.min(W, H);
  const c = S / 2, scale = c * 0.82;

  ctx.fillStyle = "#080812";
  ctx.fillRect(0, 0, S, S);

  // Grid: axes + diagonals + circles
  ctx.strokeStyle = "#151525"; ctx.lineWidth = 0.5;
  ctx.beginPath(); ctx.moveTo(c, 0); ctx.lineTo(c, S); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, c); ctx.lineTo(S, c); ctx.stroke();
  ctx.strokeStyle = "#12122a"; ctx.lineWidth = 0.3;
  ctx.beginPath(); ctx.moveTo(0, S); ctx.lineTo(S, 0); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(S, S); ctx.stroke();
  ctx.strokeStyle = "#151525"; ctx.lineWidth = 0.4;
  ctx.beginPath(); ctx.arc(c, c, scale * 0.5, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.arc(c, c, scale, 0, Math.PI * 2); ctx.stroke();

  // Labels
  ctx.font = `${Math.round(S * 0.07)}px 'JetBrains Mono', monospace`;
  ctx.fillStyle = "#2a2a44";
  ctx.textAlign = "center";
  ctx.fillText("M", c, 9);
  ctx.textAlign = "right";
  ctx.fillText("R", S - 2, c - 2);
  ctx.textAlign = "left";
  ctx.fillText("L", 2, c - 2);

  if (!filterBank?.lAnalyser) return;

  const bufSize = filterBank.lAnalyser.fftSize;
  const lData = new Float32Array(bufSize);
  const rData = new Float32Array(bufSize);
  filterBank.lAnalyser.getFloatTimeDomainData(lData);
  filterBank.rAnalyser.getFloatTimeDomainData(rData);

  const hasMultiband = filterBank.analysers?.length >= 6;
  if (hasMultiband) {
    // Per-band time domain data for multiband coloring
    const bandBufSize = filterBank.analysers[0].fftSize; // 512
    const bandData = Array.from({ length: 6 }, (_, i) => {
      const d = new Float32Array(bandBufSize);
      filterBank.analysers[i].getFloatTimeDomainData(d);
      return d;
    });
    // Align temporal windows: wideband buffer covers bufSize samples (4096 ≈ 93ms),
    // band buffers cover bandBufSize samples (512 ≈ 11.6ms). Use the tail of the
    // wideband buffer so both windows represent the same most-recent samples (1:1 mapping).
    const wbOffset = bufSize - bandBufSize;
    const bandRGB = [[255, 85, 68], [68, 204, 102], [68, 136, 255]];
    for (let i = 0; i < bandBufSize; i++) {
      const wi = wbOffset + i;
      const m = (lData[wi] + rData[wi]) * 0.7071;
      const s = (rData[wi] - lData[wi]) * 0.7071;
      const px = c + s * scale;
      const py = c - m * scale;
      const e = [0, 1, 2].map(b => {
        const lv = bandData[b][i], rv = bandData[b + 3][i];
        return lv * lv + rv * rv;
      });
      const eSum = e[0] + e[1] + e[2] + 1e-12;
      const [rw, gw, bw] = e.map(v => v / eSum);
      const r = Math.round(rw * bandRGB[0][0] + gw * bandRGB[1][0] + bw * bandRGB[2][0]);
      const g = Math.round(rw * bandRGB[0][1] + gw * bandRGB[1][1] + bw * bandRGB[2][1]);
      const b = Math.round(rw * bandRGB[0][2] + gw * bandRGB[1][2] + bw * bandRGB[2][2]);
      ctx.fillStyle = `rgba(${r},${g},${b},0.3)`;
      ctx.fillRect(px - 1, py - 1, 2, 2); // 2px dots compensate for fewer points (512 vs 4096)
    }
  } else {
    // Wideband monochrome fallback
    ctx.beginPath();
    for (let i = 0; i < bufSize; i++) {
      const m = (lData[i] + rData[i]) * 0.7071;
      const s = (rData[i] - lData[i]) * 0.7071;
      const px = c + s * scale;
      const py = c - m * scale;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.strokeStyle = "rgba(51,170,255,0.18)";
    ctx.lineWidth = 0.7;
    ctx.stroke();
  }
}

/* ════════════════════════════════════════════════════
   PLAYBACK with Canvas waveform + Live Spectrum + Filter Bank + Meters
   ════════════════════════════════════════════════════ */

export function PlaybackWaveform({ buffer, audioCtx, waveData, duration, prefs, setPrefs, bpm, keyData }) {
  const [playing, setPlaying] = useState(false);
  const [position, setPositionState] = useState(0);
  const [zoom, setZoom] = useState(1);        // 1x / 2x / 4x / 8x
  const [scrollPct, setScrollPct] = useState(0); // 0..1, fraction of total duration at left edge
  const [bandMutes, setBandMutes] = useState([false, false, false]); // P6-C: LOW/MID/HIGH output mute
  const bandMutesRef = useRef([false, false, false]);
  const bandOutGainsRef = useRef(null); // [[gainL, gainR], [gainL, gainR], [gainL, gainR]]
  const playFromRef = useRef(null); // Fix 1: stable ref so drag useEffect doesn't re-bind on playFrom identity change
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
  // Phase 3: Live vectorscope canvas
  const vsCanvasRef = useRef(null);
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
    drawWaveCanvas(waveCanvasRef.current, waveData, prefs, duration, bpm, keyData, zoomRef.current, scrollPctRef.current);
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
    setPositionState(0);
    drawLiveSpec(liveSpecCanvasRef.current, null, prefsRef.current.specSlope, prefsRef.current.liveSpecMode, null, prefsRef.current.specMs);
    drawVectorscope(vsCanvasRef.current, null);
  }, [buffer]);

  // Drag-scrub: document-level mouse events so drag works outside the canvas
  

  const killSource = useCallback(() => {
    cancelAnimationFrame(animRef.current); animRef.current = null;
    const src = sourceRef.current;
    if (src) { src.onended = null; try { src.disconnect(); } catch(e) {} try { src.stop(0); } catch(e) {} sourceRef.current = null; }
    // Disconnect filter bank
    if (filterBankRef.current) {
      filterBankRef.current.nodes.forEach(n => { try { n.disconnect(); } catch(e) {} });
      filterBankRef.current = null;
    }
    // Phase 3: Disconnect gain + mono nodes
    if (gainRef.current) { try { gainRef.current.disconnect(); } catch(e) {} gainRef.current = null; }
    if (monoMergerRef.current) { try { monoMergerRef.current.disconnect(); } catch(e) {} monoMergerRef.current = null; }
    bandOutGainsRef.current = null;
    specAnalyserRef.current = null;
    playingRef.current = false; setPlaying(false);
    _lufsHistory = []; _lufsPeak = -60;
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
      drawLufsMeter(lufsCanvasRef.current, specAnalyserRef.current);
      drawVectorscope(vsCanvasRef.current, filterBankRef.current);
      if (elapsed < buffer.duration) animRef.current = requestAnimationFrame(tick);
    };
    animRef.current = requestAnimationFrame(tick);
  }, [buffer, audioCtx, killSource]);

  // Fix 1: keep playFromRef in sync so drag effect doesn't re-bind on playFrom identity changes
  useEffect(() => { playFromRef.current = playFrom; }, [playFrom]);

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
        drawLiveSpec(liveSpecCanvasRef.current, null, prefsRef.current.specSlope, prefsRef.current.liveSpecMode, null, false, scrubDataRef.current);
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
    const levels = [1, 2, 4, 8];
    setZoom(prev => {
      const idx = levels.indexOf(prev);
      const newZoom = e.deltaY < 0
        ? levels[Math.min(idx + 1, levels.length - 1)]
        : levels[Math.max(idx - 1, 0)];
      zoomRef.current = newZoom;
      // Keep the hovered position as anchor point
      if (newZoom === 1) {
        scrollPctRef.current = 0;
        setScrollPct(0);
      }
      return newZoom;
    });
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

  const SPEC_W = 560, W = 760, H = 120, LSH = 90;
  const PHASE_W = 150, LUFS_W = 90;
  const fmt = t => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;
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
                  if (m !== prefs.liveSpecMode) { _heatmapBuf = null; }
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
              <span style={{ fontSize: 7, color: THEME.dim, fontFamily: THEME.mono, marginLeft: 4 }}>
                slope {prefs.specSlope}dB/oct
              </span>
            </div>
          </div>
          <canvas ref={liveSpecCanvasRef} style={{ display: "block", width: "100%", height: LSH }} />
        </div>

        {/* 3-Band Phase Meter (center) */}
        <div style={{ width: PHASE_W, background: "#080812", borderLeft: "1px solid #111122" }}>
          <div style={{ padding: "4px 6px 0" }}>
            <span style={{ fontSize: 7, color: THEME.dim, fontFamily: THEME.mono, letterSpacing: 1 }}>PHASE</span>
          </div>
          <canvas ref={phaseCanvasRef} style={{ display: "block", width: "100%", height: LSH }} />
        </div>

        {/* Live Vectorscope */}
        <div style={{ width: LSH, background: "#080812", borderLeft: "1px solid #111122" }}>
          <div style={{ padding: "4px 6px 0" }}>
            <span style={{ fontSize: 7, color: THEME.dim, fontFamily: THEME.mono, letterSpacing: 1 }}>VECTOR</span>
          </div>
          <canvas ref={vsCanvasRef} style={{ display: "block", width: "100%", height: LSH }} />
        </div>

        {/* LUFS Meter (right) */}
        <div style={{ width: LUFS_W, background: "#080812", borderLeft: "1px solid #111122" }}>
          <div style={{ padding: "4px 6px 0" }}>
            <span style={{ fontSize: 7, color: THEME.dim, fontFamily: THEME.mono, letterSpacing: 1 }}>LUFS</span>
          </div>
          <canvas ref={lufsCanvasRef} style={{ display: "block", width: "100%", height: LSH }} />
        </div>
      </div>

      {/* Canvas Waveform with playhead overlay */}
      <div style={{ background: "#080812", borderRadius: "0 0 7px 7px", borderTop: "1px solid #111122" }}>
        {/* Zoom controls */}
        <div style={{ display: "flex", alignItems: "center", gap: 3, padding: "3px 6px 0" }}>
          <span style={{ fontSize: 7, color: THEME.dim, fontFamily: THEME.mono }}>ZOOM</span>
          {[1, 2, 4, 8].map(z => (
            <button key={z} onClick={() => {
              setZoom(z);
              zoomRef.current = z;
              if (z === 1) { scrollPctRef.current = 0; setScrollPct(0); }
            }} style={{
              padding: "1px 5px", fontSize: 7, fontFamily: THEME.mono,
              background: zoom === z ? THEME.accent + "22" : "transparent",
              color: zoom === z ? "#bb99ff" : THEME.dim,
              border: `1px solid ${zoom === z ? THEME.accent + "44" : THEME.border}`,
              borderRadius: 2, cursor: "pointer",
            }}>{z}×</button>
          ))}
          {zoom > 1 && (
            <input type="range" min={0} max={100} value={Math.round(scrollPct * 100)} onChange={e => {
              const v = +e.target.value / 100;
              scrollPctRef.current = v; setScrollPct(v);
            }} style={{ flex: 1, height: 3, accentColor: THEME.accent, marginLeft: 4 }} />
          )}
        </div>
        <div style={{ position: "relative", padding: "4px 0 0", cursor: "pointer" }}
          onMouseDown={e => {
            const rect = e.currentTarget.getBoundingClientRect();
            if (zoom > 1 && e.clientY > rect.bottom - 8) { handleScrollDrag(e); return; }
            isDraggingRef.current = true;
            document.body.style.cursor = 'col-resize';
            if (playingRef.current) killSource();
            seek(e);
          }}
          onWheel={handleWheelZoom}
        >
          <canvas ref={waveCanvasRef} style={{ display: "block", width: "100%", height: H }} />
          <canvas ref={overlayCanvasRef} style={{
            position: "absolute", top: 4, left: 0, display: "block", width: "100%", height: H, pointerEvents: "none",
          }} />
        </div>
      </div>
    </div>
  );
}
