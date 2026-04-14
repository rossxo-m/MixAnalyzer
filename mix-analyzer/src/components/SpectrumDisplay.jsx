import { useState, useRef, useEffect, useCallback } from "react";
import { THEME, withAlpha } from '../theme.js';
import { BANDS_3 } from '../constants.js';
import { GENRE_COLORS } from '../constants.js';
import { GENRE_CURVES, interpolateTargetCurve } from '../analysis/genres.js';

function drawSpectrum(canvas, points, pointsS, slope, genre, refPoints, msMode) {
  if (!canvas || !points?.length) return;
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const PW = Math.round(rect.width * dpr);
  const PH = Math.round(rect.height * dpr);
  if (canvas.width !== PW || canvas.height !== PH) {
    canvas.width = PW; canvas.height = PH;
  }
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const W = rect.width, H = rect.height;
  const fMin = points[0]?.freq || 20, fMax = points[points.length - 1]?.freq || 20000;
  const genreColor = genre ? (GENRE_COLORS[genre] || "#ffcc44") : "#ffcc44";

  // Apply slope compensation
  const compensated = points.map(p => {
    const octavesFromRef = Math.log2(p.freq / 1000);
    return { freq: p.freq, db: p.db + octavesFromRef * slope };
  });
  const compensatedS = msMode && pointsS ? pointsS.map(p => {
    const octavesFromRef = Math.log2(p.freq / 1000);
    return { freq: p.freq, db: p.db + octavesFromRef * slope };
  }) : null;
  const compensatedRef = refPoints?.length ? refPoints.map(p => {
    const octavesFromRef = Math.log2(p.freq / 1000);
    return { freq: p.freq, db: p.db + octavesFromRef * slope };
  }) : null;

  // Auto-range
  let dataMin = Infinity, dataMax = -Infinity;
  for (const p of compensated) {
    if (p.db > dataMax) dataMax = p.db;
    if (p.db < dataMin && p.db > -100) dataMin = p.db;
  }
  if (compensatedRef) {
    for (const p of compensatedRef) {
      if (p.db > dataMax) dataMax = p.db;
      if (p.db < dataMin && p.db > -100) dataMin = p.db;
    }
  }
  const minSpan = 36;
  if (dataMax - dataMin < minSpan) {
    const center = (dataMax + dataMin) / 2;
    dataMax = center + minSpan / 2;
    dataMin = center - minSpan / 2;
  }
  const dbMax = Math.ceil(dataMax / 6) * 6 + 3;
  const dbMin = Math.floor(dataMin / 6) * 6 - 3;
  const dbRange = dbMax - dbMin || 1;

  const fToX = f => (Math.log(f / fMin) / Math.log(fMax / fMin)) * W;
  const dbToY = db => H - ((db - dbMin) / dbRange) * H;

  // Background
  ctx.fillStyle = THEME.waveBg;
  ctx.fillRect(0, 0, W, H);

  // dB grid
  for (let db = dbMin; db <= dbMax; db += 6) {
    const y = dbToY(db);
    const isMajor = db % 12 === 0;
    ctx.strokeStyle = isMajor ? THEME.waveGridText : THEME.waveGrid;
    ctx.lineWidth = isMajor ? 1 : 0.5;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    ctx.font = `7px '${THEME.mono}', monospace`;
    ctx.fillStyle = isMajor ? THEME.sub : THEME.waveGridText;
    ctx.textAlign = "right";
    ctx.fillText(`${db}`, W - 3, y - 2);
  }

  // Freq grid
  const freqGrid = [50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000].filter(f => f >= fMin && f <= fMax);
  for (const f of freqGrid) {
    const x = fToX(f);
    const isMajor = [100, 1000, 10000].includes(f);
    ctx.strokeStyle = isMajor ? THEME.waveGrid : THEME.waveCenter;
    ctx.lineWidth = isMajor ? 0.6 : 0.4;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
  }

  // Build main curve points
  const len = compensated.length;
  const ptsX = new Float32Array(len), ptsY = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    ptsX[i] = (i / (len - 1)) * W;
    ptsY[i] = Math.max(0, Math.min(H, dbToY(compensated[i].db)));
  }

  // Band-colored fills
  for (const band of BANDS_3) {
    const i0 = compensated.findIndex(p => p.freq >= band.min);
    const i1 = compensated.findIndex(p => p.freq >= band.max);
    if (i0 < 0 || i1 < 0 || i0 >= i1) continue;
    ctx.beginPath();
    ctx.moveTo(ptsX[i0], ptsY[i0]);
    for (let i = i0 + 1; i <= i1; i++) ctx.lineTo(ptsX[i], ptsY[i]);
    ctx.lineTo(ptsX[i1], H); ctx.lineTo(ptsX[i0], H); ctx.closePath();
    ctx.fillStyle = band.color + "1e";
    ctx.fill();
  }

  // Fill under curve with gradient
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, withAlpha(THEME.midCurve, 0.25));
  grad.addColorStop(1, withAlpha(THEME.midCurve, 0.02));
  ctx.beginPath();
  ctx.moveTo(ptsX[0], ptsY[0]);
  for (let i = 1; i < len; i++) ctx.lineTo(ptsX[i], ptsY[i]);
  ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath();
  ctx.fillStyle = grad; ctx.fill();

  // Main curve — glow + solid
  const traceCurve = () => {
    ctx.beginPath();
    ctx.moveTo(ptsX[0], ptsY[0]);
    for (let i = 1; i < len; i++) ctx.lineTo(ptsX[i], ptsY[i]);
  };
  traceCurve(); ctx.strokeStyle = THEME.midCurve; ctx.lineWidth = 2.2; ctx.globalAlpha = 0.3; ctx.stroke(); ctx.globalAlpha = 1;
  traceCurve(); ctx.strokeStyle = THEME.midCurve; ctx.lineWidth = 1.3; ctx.stroke();

  // M/S: Side curve overlay
  if (msMode && compensatedS) {
    const sLen = compensatedS.length;
    const sX = new Float32Array(sLen), sY = new Float32Array(sLen);
    for (let i = 0; i < sLen; i++) {
      sX[i] = (i / (sLen - 1)) * W;
      sY[i] = Math.max(0, Math.min(H, dbToY(compensatedS[i].db)));
    }
    // Side fill
    ctx.beginPath();
    ctx.moveTo(sX[0], sY[0]);
    for (let i = 1; i < sLen; i++) ctx.lineTo(sX[i], sY[i]);
    ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath();
    ctx.fillStyle = withAlpha(THEME.sideCurve, 0.1); ctx.fill();
    // Side curve
    const traceS = () => { ctx.beginPath(); ctx.moveTo(sX[0], sY[0]); for (let i = 1; i < sLen; i++) ctx.lineTo(sX[i], sY[i]); };
    traceS(); ctx.strokeStyle = THEME.sideCurve; ctx.lineWidth = 2; ctx.globalAlpha = 0.3; ctx.stroke(); ctx.globalAlpha = 1;
    traceS(); ctx.strokeStyle = THEME.sideCurve; ctx.lineWidth = 1.2; ctx.stroke();
    // Legend
    ctx.font = `8px '${THEME.mono}', monospace`; ctx.textAlign = "left";
    ctx.fillStyle = THEME.midCurve; ctx.fillText("MID", 6, 14);
    ctx.fillStyle = THEME.sideCurve; ctx.fillText("SIDE", 36, 14);
  }

  // Reference spectrum overlay — gold dashed
  if (compensatedRef) {
    const rLen = compensatedRef.length;
    const rX = new Float32Array(rLen), rY = new Float32Array(rLen);
    for (let i = 0; i < rLen; i++) {
      rX[i] = (i / (rLen - 1)) * W;
      rY[i] = Math.max(0, Math.min(H, dbToY(compensatedRef[i].db)));
    }
    const traceRef = () => { ctx.beginPath(); ctx.moveTo(rX[0], rY[0]); for (let i = 1; i < rLen; i++) ctx.lineTo(rX[i], rY[i]); };
    // Fill
    traceRef(); ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath();
    ctx.fillStyle = "rgba(255,200,68,0.07)"; ctx.fill();
    // Glow
    traceRef(); ctx.strokeStyle = "#ffc844"; ctx.lineWidth = 2; ctx.globalAlpha = 0.25; ctx.stroke(); ctx.globalAlpha = 1;
    // Dashed
    ctx.setLineDash([5, 3]);
    traceRef(); ctx.strokeStyle = "#ffc844"; ctx.lineWidth = 1.2; ctx.globalAlpha = 0.8; ctx.stroke(); ctx.globalAlpha = 1;
    ctx.setLineDash([]);
    // Label
    ctx.font = `8px '${THEME.mono}', monospace`; ctx.textAlign = "end";
    ctx.fillStyle = "rgba(255,200,68,0.9)"; ctx.fillText("REF", W - 6, 14);
  }

  // Genre target curve with tolerance band
  if (genre && GENRE_CURVES[genre]) {
    const curve = GENRE_CURVES[genre];
    const around1k = compensated.filter(p => p.freq > 800 && p.freq < 1200);
    const anchor = around1k.length > 0
      ? around1k.reduce((s, p) => s + p.db, 0) / around1k.length
      : (dataMax + dataMin) / 2;

    // Tolerance band fill
    ctx.beginPath();
    for (let i = 0; i < len; i++) {
      const x = (i / (len - 1)) * W;
      const { db: targetRel, range: tol } = interpolateTargetCurve(curve.points, compensated[i].freq);
      const yU = Math.max(0, Math.min(H, dbToY(targetRel + anchor + tol)));
      if (i === 0) ctx.moveTo(x, yU); else ctx.lineTo(x, yU);
    }
    for (let i = len - 1; i >= 0; i--) {
      const x = (i / (len - 1)) * W;
      const { db: targetRel, range: tol } = interpolateTargetCurve(curve.points, compensated[i].freq);
      const yL = Math.max(0, Math.min(H, dbToY(targetRel + anchor - tol)));
      ctx.lineTo(x, yL);
    }
    ctx.closePath();
    ctx.fillStyle = genreColor + "1e"; ctx.fill();

    // Upper/lower dashed
    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = genreColor; ctx.lineWidth = 0.5; ctx.globalAlpha = 0.3;
    for (const sign of [1, -1]) {
      ctx.beginPath();
      for (let i = 0; i < len; i++) {
        const x = (i / (len - 1)) * W;
        const { db: targetRel, range: tol } = interpolateTargetCurve(curve.points, compensated[i].freq);
        const y = Math.max(0, Math.min(H, dbToY(targetRel + anchor + sign * tol)));
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1; ctx.setLineDash([]);

    // Center curve
    ctx.beginPath();
    for (let i = 0; i < len; i++) {
      const x = (i / (len - 1)) * W;
      const { db: targetRel } = interpolateTargetCurve(curve.points, compensated[i].freq);
      const y = Math.max(0, Math.min(H, dbToY(targetRel + anchor)));
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = genreColor; ctx.lineWidth = 1.8; ctx.globalAlpha = 0.7; ctx.stroke(); ctx.globalAlpha = 1;

    // Dots on every 4th curve point
    ctx.fillStyle = genreColor; ctx.globalAlpha = 0.5;
    for (let i = 0; i < curve.points.length; i += 4) {
      const [f, db] = curve.points[i];
      const x = fToX(f), y = dbToY(db + anchor);
      if (x >= 0 && x <= W && y >= 0 && y <= H) {
        ctx.beginPath(); ctx.arc(x, y, 2, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  // Freq labels
  const freqLabels = [20, 30, 50, 80, 100, 150, 200, 300, 500, 800, 1000, 1500, 2000, 3000, 5000, 8000, 10000, 15000, 20000].filter(f => f >= fMin && f <= fMax);
  ctx.font = `7px '${THEME.mono}', monospace`; ctx.textAlign = "center";
  for (const f of freqLabels) {
    const x = fToX(f);
    const isMain = [100, 1000, 10000].includes(f);
    ctx.fillStyle = isMain ? THEME.waveGridText : THEME.waveGrid;
    ctx.font = `${isMain ? 8 : 7}px '${THEME.mono}', monospace`;
    ctx.fillText(f >= 1000 ? `${f / 1000}k` : `${f}`, x, H - 3);
  }
}

export function SpectrumDisplay({ points, pointsS, slope, genre, refPoints }) {
  const [msMode, setMsMode] = useState(false);
  const canvasRef = useRef(null);

  const redraw = useCallback(() => {
    drawSpectrum(canvasRef.current, points, pointsS, slope, genre, refPoints, msMode);
  }, [points, pointsS, slope, genre, refPoints, msMode]);

  useEffect(() => { redraw(); }, [redraw]);

  // Redraw on container resize
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver(() => { requestAnimationFrame(redraw); });
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [redraw]);

  if (!points?.length) return null;

  const genreColor = genre ? (GENRE_COLORS[genre] || "#ffcc44") : "#ffcc44";

  return (
    <div style={{ background: THEME.waveBg, borderRadius: 7, padding: "8px 8px 4px", marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <span style={{ fontSize: 8, color: THEME.dim, fontFamily: THEME.mono, letterSpacing: 1.5 }}>
          SPECTRUM {genre && <span style={{ color: genreColor, letterSpacing: 0.5 }}>· {genre}</span>}
        </span>
        <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
          {pointsS && (
            <button onClick={() => setMsMode(m => !m)} style={{
              padding: "1px 6px", fontSize: 7, fontFamily: THEME.mono,
              background: msMode ? withAlpha(THEME.sideCurve, 0.13) : "transparent",
              color: msMode ? THEME.sideCurve : THEME.dim,
              border: `1px solid ${msMode ? withAlpha(THEME.sideCurve, 0.27) : THEME.border}`,
              borderRadius: 2, cursor: "pointer",
            }}>M/S</button>
          )}
          <span style={{ fontSize: 7, color: THEME.dim, fontFamily: THEME.mono }}>
            1/6 oct · slope {slope}dB/oct
          </span>
        </div>
      </div>
      <canvas ref={canvasRef} style={{ display: "block", width: "100%", height: 220, borderRadius: 3 }} />
    </div>
  );
}
