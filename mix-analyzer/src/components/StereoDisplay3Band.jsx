import { THEME } from '../theme.js';
import { BANDS_3 } from '../constants.js';

export function StereoDisplay3Band({ bands, crossover }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {BANDS_3.map((band, i) => {
        const w = bands[i]?.width || 0;
        const r = bands[i]?.corr || 0;
        const isBad = band.name === "Low" && w > 10;
        const barColor = isBad ? THEME.error : w > 40 ? THEME.warn : band.color;
        return (
          <div key={band.name}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
              <span style={{ width: 32, fontSize: 10, color: THEME.sub, fontFamily: THEME.mono, fontWeight: 600 }}>{band.name}</span>
              <div style={{ flex: 1, position: "relative", height: 14, background: "#080812", borderRadius: 3, overflow: "hidden" }}>
                <div style={{ position: "absolute", left: "50%", top: 0, bottom: 0, width: 1, background: "#1a1a30" }} />
                <div style={{
                  position: "absolute", left: `${50 - w/2}%`, width: `${Math.max(w, 0.5)}%`,
                  top: 0, bottom: 0, background: barColor, opacity: 0.6, borderRadius: 3,
                }} />
              </div>
              <span style={{ width: 36, fontSize: 9, color: isBad ? THEME.error : THEME.dim, fontFamily: THEME.mono, textAlign: "right" }}>{w}%</span>
              <span style={{ width: 38, fontSize: 8, color: r < 0 ? THEME.error : THEME.dim, fontFamily: THEME.mono }}>r: {r}</span>
            </div>
          </div>
        );
      })}
      <div style={{ fontSize: 7, color: THEME.dim, fontFamily: THEME.mono, marginTop: 2 }}>
        ← Mono | Stereo → | Low should be ≈ 0% (mono below {crossover}Hz)
      </div>
    </div>
  );
}
