/* ════════════════════════════════════════════════════
   Pure canvas draw functions — extracted from PlaybackWaveform.jsx
   No React, no DOM imports. Canvas + data in, nothing out.
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

export function drawLiveSpec(canvas, analyser, slope, mode, filterBank, msMode, scrubData = null) {
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

  const hasMS = (msMode && filterBank?.lAnalyser) || (msMode && scrubData?.dataS);
  if (!analyser && !hasMS && !scrubData) return;

  // ── Build spectrum data ──
  const numPts = 400;
  let rawDb, rawFreq, rawDbS, nyquist;

  if (msMode && filterBank?.lAnalyser) {
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
    if (msMode && scrubData.dataS) {
      ({ rawDb: rawDbS } = _buildSpecPoints(scrubData.dataS, nyquist, slope, numPts, fMin, fMax, dbFloor, dbCeil));
    }
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
  ctx.strokeStyle = "#ff336615"; ctx.lineWidth = 0.5;
  ctx.setLineDash([3, 3]);
  ctx.beginPath(); ctx.moveTo(0, 0.5); ctx.lineTo(W, 0.5); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, H - 0.5); ctx.lineTo(W, H - 0.5); ctx.stroke();
  ctx.setLineDash([]);

  // Center line
  ctx.strokeStyle = "#111120"; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, H / 2); ctx.lineTo(W, H / 2); ctx.stroke();

  if (isSpectral) {
    const bw = Math.max(0.8, W / frameCount);
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
    const bw = Math.max(0.65, W / frameCount);
    for (let fi = 0; fi < frameCount; fi++) {
      const frame = frames[fi];
      const x = (fi / frameCount) * W;
      ctx.lineWidth = bw;
      ctx.strokeStyle = "rgba(102,68,255,0.11)";
      ctx.beginPath(); ctx.moveTo(x, H / 2 - frame.mx * H / 2); ctx.lineTo(x, H / 2 - frame.mn * H / 2); ctx.stroke();
      ctx.strokeStyle = "rgba(102,68,255,0.5)";
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
      ctx.fillStyle = "#ff2244cc";
      ctx.fillRect(x, 0, bwClip + 0.5, 3);
    }
  }

  // Beat grid: adaptive subdivisions appear as you zoom in (bar → beat → 8th → 16th)
  if (bpm > 0 && duration > 0) {
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
        ctx.strokeStyle = "rgba(255,136,51,0.35)"; ctx.lineWidth = 1;
      } else if (isBeat) {
        ctx.strokeStyle = "rgba(255,136,51,0.15)"; ctx.lineWidth = 0.5;
      } else {
        ctx.strokeStyle = "rgba(255,136,51,0.06)"; ctx.lineWidth = 0.35;
      }
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

function drawPhaseBand(ctx, band, corr, W, rowH, bandNames, bandColors) {
  const y = band * rowH;
  const barLeft = 35, barRight = W - 30, barW = barRight - barLeft;
  const centerX = barLeft + barW / 2;
  const barY = y + rowH / 2;

  ctx.fillStyle = "#0c0c1a";
  ctx.fillRect(barLeft, barY - 6, barW, 12);

  ctx.strokeStyle = "#2a2a44"; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(centerX, barY - 6); ctx.lineTo(centerX, barY + 6); ctx.stroke();

  ctx.font = "6px 'JetBrains Mono', monospace"; ctx.textAlign = "center";
  ctx.fillStyle = "#2a2a44";
  ctx.fillText("L", barLeft - 6, barY + 2);
  ctx.fillText("R", barRight + 6, barY + 2);

  const dotX = centerX + corr * (barW / 2);
  const dotColor = corr < 0 ? "#ff3355" : corr < 0.3 ? "#ff8833" : bandColors[band];
  ctx.fillStyle = dotColor + "33";
  ctx.fillRect(Math.min(centerX, dotX), barY - 5, Math.abs(dotX - centerX), 10);
  ctx.beginPath(); ctx.arc(dotX, barY, 4, 0, Math.PI * 2);
  ctx.fillStyle = dotColor; ctx.fill();

  ctx.font = "7px 'JetBrains Mono', monospace"; ctx.textAlign = "left";
  ctx.fillStyle = bandColors[band]; ctx.fillText(bandNames[band], 4, barY + 3);

  ctx.font = "7px 'JetBrains Mono', monospace"; ctx.textAlign = "right";
  ctx.fillStyle = corr < 0 ? "#ff3355" : "#5a5a70";
  ctx.fillText(corr.toFixed(2), W - 2, barY + 3);
}

export function drawPhaseMeter(canvas, filterBank, scrubPhaseData = null) {
  if (!canvas) return;
  const setup = setupCanvas(canvas);
  if (!setup) return;
  const { ctx, W, H } = setup;
  ctx.fillStyle = "#080812"; ctx.fillRect(0, 0, W, H);

  const bandNames = ["LOW", "MID", "HIGH"];
  const bandColors = ["#ff5544", "#44cc66", "#4488ff"];
  const rowH = Math.floor(H / 3);

  if (!filterBank?.analysers?.length && !scrubPhaseData) {
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

  // Loudness target line
  if (prefs?.lufsTarget != null) {
    const tY = H - ((prefs.lufsTarget - dbMin) / dbRange) * H;
    if (tY > 0 && tY < H) {
      ctx.strokeStyle = "#22cc6688"; ctx.lineWidth = 1;
      ctx.setLineDash([4, 3]);
      ctx.beginPath(); ctx.moveTo(scaleW, tY); ctx.lineTo(W, tY); ctx.stroke();
      ctx.setLineDash([]);
      ctx.font = "6px 'JetBrains Mono', monospace"; ctx.textAlign = "right";
      ctx.fillStyle = "#22cc6699";
      ctx.fillText(`${prefs.lufsTarget}`, scaleW - 2, tY - 1);
    }
  }

  // Scrub mode: use pre-computed momentaryDb, skip history + analyser
  if (scrubDb !== null) {
    const momentaryDb = Math.max(-60, scrubDb);
    const mH = Math.max(0, ((momentaryDb - dbMin) / dbRange)) * H;
    const mColor = momentaryDb > -6 ? "#ff3355" : momentaryDb > -14 ? "#ff8833" : "#33aaff";
    const mGrad = ctx.createLinearGradient(0, H - mH, 0, H);
    mGrad.addColorStop(0, mColor); mGrad.addColorStop(1, mColor + "44");
    const scaleW2 = 22, barsW2 = W - scaleW2 - 2;
    ctx.fillStyle = mGrad;
    ctx.fillRect(scaleW2, H - mH, barsW2, mH);
    ctx.font = "8px 'JetBrains Mono', monospace"; ctx.textAlign = "center";
    ctx.fillStyle = mColor;
    ctx.fillText(momentaryDb > -60 ? momentaryDb.toFixed(1) : "---", scaleW2 + barsW2 / 2, 10);
    ctx.font = "6px 'JetBrains Mono', monospace";
    ctx.fillStyle = "#4a4a66"; ctx.fillText("SCRUB", scaleW2 + barsW2 / 2, H - 2);
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

  ctx.fillStyle = "#080812";
  ctx.fillRect(0, 0, W, H);

  const dbMin = -60, dbMax = 0, dbRange = dbMax - dbMin;
  const gap = 2;
  const barW = Math.floor((W - gap) / 2);

  // Grid lines
  for (const db of [-6, -12, -18, -24, -36, -48]) {
    const y = H - ((db - dbMin) / dbRange) * H;
    ctx.strokeStyle = "#1a1a30"; ctx.lineWidth = 0.5;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  }
  // dB labels
  ctx.font = "5px 'JetBrains Mono', monospace"; ctx.textAlign = "center";
  for (const db of [-12, -24, -48]) {
    const y = H - ((db - dbMin) / dbRange) * H;
    ctx.fillStyle = "#2a2a44";
    ctx.fillText(`${db}`, W / 2, y - 1);
  }
  // 0 dBFS ceiling marker
  ctx.strokeStyle = "#ff334422"; ctx.lineWidth = 1;
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
    const color = db > -3 ? "#ff3355" : db > -12 ? "#ff8833" : "#33aaff";
    const grad = ctx.createLinearGradient(x, H - barH, x, H);
    grad.addColorStop(0, color); grad.addColorStop(1, color + "55");
    ctx.fillStyle = grad;
    ctx.fillRect(x, H - barH, barW, barH);
    // Peak hold tick
    const peakY = H - Math.max(0, (Math.max(dbMin, peakDb) - dbMin) / dbRange) * H;
    if (peakY > 1 && peakY < H - 8) {
      ctx.fillStyle = peakDb > -3 ? "#ff3355cc" : "#ffffffaa";
      ctx.fillRect(x, peakY, barW, 2);
    }
    // Clip flash at top
    if (db > -0.5) {
      ctx.fillStyle = "#ff335588";
      ctx.fillRect(x, 0, barW, 3);
    }
  }

  drawBar(dbL, _dbPeakL, 0);
  drawBar(dbR, _dbPeakR, barW + gap);

  // L / R labels
  ctx.font = "5px 'JetBrains Mono', monospace"; ctx.textAlign = "center";
  ctx.fillStyle = "#3a3a55";
  ctx.fillText("L", barW / 2, H - 1);
  ctx.fillText("R", barW + gap + barW / 2, H - 1);
}

/* ════════════════════════════════════════════════════
   Phase 3: Live Vectorscope (Canvas Lissajous)
   ════════════════════════════════════════════════════ */

export function drawVectorscope(canvas, filterBank, scrubVsData = null) {
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

  ctx.fillStyle = "#080812";
  ctx.fillRect(0, 0, W, H);

  // Axes
  ctx.strokeStyle = "#151525"; ctx.lineWidth = 0.5;
  ctx.beginPath(); ctx.moveTo(cx, 0); ctx.lineTo(cx, H); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, cy); ctx.lineTo(W, cy); ctx.stroke();

  if (!isWide) {
    ctx.strokeStyle = "#12122a"; ctx.lineWidth = 0.3;
    ctx.beginPath(); ctx.moveTo(0, cy + cx); ctx.lineTo(cx + (H - cy), 0); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(W, cy + (W - cx)); ctx.lineTo(W - (H - cy), 0); ctx.stroke();
  }

  // Reference circles
  ctx.strokeStyle = "#151525"; ctx.lineWidth = 0.4;
  ctx.beginPath(); ctx.arc(cx, cy, radius * 0.5, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2); ctx.stroke();

  // Labels
  ctx.font = `${labelSz}px 'JetBrains Mono', monospace`;
  ctx.fillStyle = "#2a2a44";
  ctx.textAlign = "center";
  ctx.fillText("M", cx, labelSz + 2);
  ctx.textAlign = "right";
  ctx.fillText("R", W - 2, cy - 2);
  ctx.textAlign = "left";
  ctx.fillText("L", 2, cy - 2);

  // Scrub mode: draw wideband monochrome from buffer slice, skip live analyser
  if (scrubVsData) {
    const { lSlice, rSlice } = scrubVsData;
    ctx.beginPath();
    for (let i = 0; i < lSlice.length; i++) {
      const m = (lSlice[i] + rSlice[i]) * 0.7071;
      const s = (rSlice[i] - lSlice[i]) * 0.7071;
      const px = cx + s * radius;
      const py = cy - m * radius;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.strokeStyle = "rgba(51,170,255,0.25)";
    ctx.lineWidth = 0.8;
    ctx.stroke();
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
    const bandRGB = [[255, 85, 68], [68, 204, 102], [68, 136, 255]];
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
      ctx.fillStyle = `rgba(${r},${g},${b},0.3)`;
      ctx.fillRect(px - 1, py - 1, 2, 2);
    }
  } else {
    ctx.beginPath();
    for (let i = 0; i < bufSize; i++) {
      const m = (lData[i] + rData[i]) * 0.7071;
      const s = (rData[i] - lData[i]) * 0.7071;
      const px = cx + s * radius;
      const py = cy - m * radius;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.strokeStyle = "rgba(51,170,255,0.18)";
    ctx.lineWidth = 0.7;
    ctx.stroke();
  }
}

export function resetHeatmapBuf() {
  _heatmapBuf = null;
}
