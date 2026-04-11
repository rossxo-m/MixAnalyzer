import { useState } from "react";
import { THEME } from '../theme.js';
import { BANDS_3 } from '../constants.js';
import { GENRE_COLORS } from '../constants.js';
import { GENRE_CURVES, interpolateTargetCurve } from '../analysis/genres.js';

export function SpectrumDisplay({ points, pointsS, slope, genre, refPoints }) {
  const [msMode, setMsMode] = useState(false);
  if (!points?.length) return null;
  const W = 760, H = 220;
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

  // Auto-range: tighter range centered on data for better visual spread
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
  // Tighter minimum span (36dB) so curves fill more of the display
  const minSpan = 36;
  if (dataMax - dataMin < minSpan) {
    const center = (dataMax + dataMin) / 2;
    dataMax = center + minSpan / 2;
    dataMin = center - minSpan / 2;
  }
  // Round to nice grid values, pad by 3dB (tighter padding)
  const dbMax = Math.ceil(dataMax / 6) * 6 + 3;
  const dbMin = Math.floor(dataMin / 6) * 6 - 3;
  const dbRange = dbMax - dbMin || 1;

  // Map frequency to x (log scale)
  const fToX = f => (Math.log(f / fMin) / Math.log(fMax / fMin)) * W;
  // Map dB to y
  const dbToY = db => H - ((db - dbMin) / dbRange) * H;

  // Build path — main curve
  const pathD = compensated.map((p, i) => {
    const x = (i / (compensated.length - 1)) * W;
    const y = Math.max(0, Math.min(H, dbToY(p.db)));
    return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");

  // Build colored fill segments per band
  const bandFills = BANDS_3.map((band, bi) => {
    const pts = compensated.filter(p => p.freq >= band.min && p.freq <= band.max);
    if (pts.length < 2) return null;
    const startIdx = compensated.indexOf(pts[0]);
    const d = pts.map((p, i) => {
      const x = ((startIdx + i) / (compensated.length - 1)) * W;
      const y = Math.max(0, Math.min(H, dbToY(p.db)));
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(" ");
    const xStart = (startIdx / (compensated.length - 1)) * W;
    const xEnd = ((startIdx + pts.length - 1) / (compensated.length - 1)) * W;
    return { d: d + ` L${xEnd.toFixed(1)},${H} L${xStart.toFixed(1)},${H} Z`, color: band.color };
  }).filter(Boolean);

  // Grid lines
  const gridLines = [];
  for (let db = dbMin; db <= dbMax; db += 6) {
    gridLines.push(db);
  }

  const freqLabels = [20, 30, 50, 80, 100, 150, 200, 300, 500, 800, 1000, 1500, 2000, 3000, 5000, 8000, 10000, 15000, 20000].filter(f => f >= fMin && f <= fMax);
  // Thin vertical freq grid
  const freqGrid = [50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000].filter(f => f >= fMin && f <= fMax);

  return (
    <div style={{ background: "#080812", borderRadius: 7, padding: "8px 8px 4px", marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <span style={{ fontSize: 8, color: THEME.dim, fontFamily: THEME.mono, letterSpacing: 1.5 }}>
          SPECTRUM {genre && <span style={{ color: genreColor, letterSpacing: 0.5 }}>· {genre}</span>}
        </span>
        <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
          {pointsS && (
            <button onClick={() => setMsMode(m => !m)} style={{
              padding: "1px 6px", fontSize: 7, fontFamily: THEME.mono,
              background: msMode ? "#ff883322" : "transparent",
              color: msMode ? "#ff8833" : THEME.dim,
              border: `1px solid ${msMode ? "#ff883344" : THEME.border}`,
              borderRadius: 2, cursor: "pointer",
            }}>M/S</button>
          )}
          <span style={{ fontSize: 7, color: THEME.dim, fontFamily: THEME.mono }}>
            1/6 oct · slope {slope}dB/oct · {dbMin}→{dbMax}dB
          </span>
        </div>
      </div>
      <svg viewBox={`0 0 ${W + 30} ${H + 18}`} width="100%" style={{ display: "block" }}>
        <g>
          {/* dB grid — higher contrast */}
          {gridLines.map(db => {
            const y = dbToY(db);
            const isMajor = db % 12 === 0;
            return (
              <g key={db}>
                <line x1="0" y1={y} x2={W} y2={y} stroke={isMajor ? "#222240" : "#141428"} strokeWidth={isMajor ? "1" : ".5"} />
                <text x={W + 3} y={y + 3} fill={isMajor ? "#4a4a65" : "#2a2a44"} fontSize="7" fontFamily={THEME.mono}>{db}</text>
              </g>
            );
          })}
          {/* Freq grid — higher contrast */}
          {freqGrid.map(f => {
            const x = fToX(f);
            const isMajor = [100, 1000, 10000].includes(f);
            return <line key={f} x1={x} y1={0} x2={x} y2={H} stroke={isMajor ? "#1a1a30" : "#111125"} strokeWidth={isMajor ? ".6" : ".4"} />;
          })}
          {/* Band-colored fills */}
          {bandFills.map((bf, i) => (
            <path key={i} d={bf.d} fill={bf.color} opacity=".12" />
          ))}
          {/* Main curve — thicker, with glow */}
          <path d={pathD} fill="none" stroke="#33aaff" strokeWidth="2.2" opacity=".3" />
          <path d={pathD} fill="none" stroke="#55ccff" strokeWidth="1.3" />
          {/* Fill under curve */}
          <path d={pathD + ` L${W},${H} L0,${H} Z`} fill="url(#specGrad)" opacity=".25" />
          {/* M/S: Side curve overlay */}
          {msMode && compensatedS && (() => {
            const pathS = compensatedS.map((p, i) => {
              const x = (i / (compensatedS.length - 1)) * W;
              const y = Math.max(0, Math.min(H, dbToY(p.db)));
              return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
            }).join(" ");
            return (
              <g>
                <path d={pathS + ` L${W},${H} L0,${H} Z`} fill="#ff8833" opacity=".1" />
                <path d={pathS} fill="none" stroke="#ff8833" strokeWidth="2" opacity=".3" />
                <path d={pathS} fill="none" stroke="#ffaa55" strokeWidth="1.2" />
              </g>
            );
          })()}
          {/* M/S legend */}
          {msMode && (
            <g>
              <text x="6" y="14" fill="#55ccff" fontSize="8" fontFamily={THEME.mono}>MID</text>
              <text x="36" y="14" fill="#ffaa55" fontSize="8" fontFamily={THEME.mono}>SIDE</text>
            </g>
          )}
          {/* Reference spectrum overlay — LUFS-normalized, gold dashed */}
          {compensatedRef && (() => {
            const refPath = compensatedRef.map((p, i) => {
              const x = (i / (compensatedRef.length - 1)) * W;
              const y = Math.max(0, Math.min(H, dbToY(p.db)));
              return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
            }).join(" ");
            return (
              <g>
                <path d={refPath + ` L${W},${H} L0,${H} Z`} fill="#ffc844" opacity=".07" />
                <path d={refPath} fill="none" stroke="#ffc844" strokeWidth="2" opacity=".25" />
                <path d={refPath} fill="none" stroke="#ffc844" strokeWidth="1.2" strokeDasharray="5,3" opacity=".8" />
                <text x={W - 6} y="14" fill="#ffc844" fontSize="8" fontFamily={THEME.mono} textAnchor="end" opacity=".9">REF</text>
              </g>
            );
          })()}
          {/* Genre target curve with per-point tolerance band */}
          {genre && GENRE_CURVES[genre] && (() => {
            const curve = GENRE_CURVES[genre];

            // Anchor: align target curve to the analyzed spectrum at 1kHz
            const around1k = compensated.filter(p => p.freq > 800 && p.freq < 1200);
            const anchor = around1k.length > 0
              ? around1k.reduce((s, p) => s + p.db, 0) / around1k.length
              : (dataMax + dataMin) / 2;

            // Build center, upper, lower paths using per-point tolerance
            const centerPts = [], upperPts = [], lowerPts = [];
            for (let i = 0; i < compensated.length; i++) {
              const x = (i / (compensated.length - 1)) * W;
              const { db: targetRel, range: tol } = interpolateTargetCurve(curve.points, compensated[i].freq);
              const targetDb = targetRel + anchor;

              const yC = Math.max(0, Math.min(H, dbToY(targetDb)));
              const yU = Math.max(0, Math.min(H, dbToY(targetDb + tol)));
              const yL = Math.max(0, Math.min(H, dbToY(targetDb - tol)));
              centerPts.push(`${x.toFixed(1)},${yC.toFixed(1)}`);
              upperPts.push(`${x.toFixed(1)},${yU.toFixed(1)}`);
              lowerPts.push(`${x.toFixed(1)},${yL.toFixed(1)}`);
            }

            const centerPath = "M" + centerPts.join(" L");
            const upperPath = "M" + upperPts.join(" L");
            const lowerPath = "M" + lowerPts.join(" L");
            const bandPath = `M${upperPts.join(" L")} L${[...lowerPts].reverse().join(" L")} Z`;

            return (
              <g>
                <path d={bandPath} fill={genreColor} opacity=".12" />
                <path d={upperPath} fill="none" stroke={genreColor} strokeWidth=".5" opacity=".3" strokeDasharray="3,3" />
                <path d={lowerPath} fill="none" stroke={genreColor} strokeWidth=".5" opacity=".3" strokeDasharray="3,3" />
                <path d={centerPath} fill="none" stroke={genreColor} strokeWidth="1.8" opacity=".7" />
                {curve.points.filter((_, i) => i % 4 === 0).map(([f, db], i) => {
                  const x = fToX(f);
                  const y = dbToY(db + anchor);
                  if (x < 0 || x > W || y < 0 || y > H) return null;
                  return <circle key={i} cx={x} cy={y} r="2" fill={genreColor} opacity=".5" />;
                })}
              </g>
            );
          })()}
          {/* Freq labels */}
          {freqLabels.map(f => {
            const x = fToX(f);
            const label = f >= 1000 ? `${f/1000}k` : f;
            const isMain = [100, 1000, 10000].includes(f);
            return <text key={f} x={x} y={H + 12} fill={isMain ? "#3a3a55" : "#222238"} fontSize={isMain ? "8" : "7"} fontFamily={THEME.mono} textAnchor="middle">{label}</text>;
          })}
        </g>
        <defs>
          <linearGradient id="specGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#33aaff" stopOpacity=".4" />
            <stop offset="100%" stopColor="#33aaff" stopOpacity=".02" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  );
}
