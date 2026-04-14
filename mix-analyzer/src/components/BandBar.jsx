import { THEME, withAlpha } from '../theme.js';

export function BandBar({ label, value, color, range, target }) {
  const pct = Math.round(value * 100);
  const tPct = target != null ? Math.round(target * 100) : null;
  return (
    <div style={{ marginBottom: 3 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 7, color: THEME.sub, marginBottom: 1 }}>
        <span style={{ fontFamily: THEME.mono }}>{label}</span>
        <span style={{ fontFamily: THEME.mono }}>{range}</span>
      </div>
      <div style={{ position: "relative", height: 10, background: THEME.waveBg, borderRadius: 2, overflow: "hidden" }}>
        <div style={{ width: `${Math.min(pct * 3.5, 100)}%`, height: "100%", background: `linear-gradient(90deg, ${color}44, ${color})`, borderRadius: 2 }} />
        {tPct != null && (
          <div style={{ position: "absolute", left: `${Math.min(tPct * 3.5, 100)}%`, top: 0, bottom: 0, width: 2, background: withAlpha(THEME.text, 0.33), zIndex: 2 }} />
        )}
        <span style={{ position: "absolute", right: 3, top: 0, fontSize: 7, color: withAlpha(THEME.text, 0.47), fontFamily: THEME.mono, lineHeight: "10px" }}>{pct}%</span>
      </div>
    </div>
  );
}
