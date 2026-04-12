import { THEME } from '../theme.js';

export function MetricCard({ label, value, unit, sub, color }) {
  return (
    <div style={{ flex: "1 1 70px", minWidth: 70, padding: "7px 9px", background: THEME.card, borderRadius: 6, borderLeft: `3px solid ${color || THEME.border}` }}>
      <div style={{ fontSize: "clamp(6px, 0.55vw, 8px)", color: THEME.sub, textTransform: "uppercase", letterSpacing: 1.2, fontFamily: THEME.mono, marginBottom: 1 }}>{label}</div>
      <div style={{ fontSize: "clamp(12px, 1.3vw, 20px)", fontWeight: 700, color: THEME.text, fontFamily: THEME.mono, lineHeight: 1 }}>
        {value}<span style={{ fontSize: "clamp(6px, 0.6vw, 9px)", color: THEME.sub, marginLeft: 1 }}>{unit}</span>
      </div>
      {sub && <div style={{ fontSize: "clamp(6px, 0.55vw, 8px)", color: THEME.dim, marginTop: 1, fontFamily: THEME.mono }}>{sub}</div>}
    </div>
  );
}
