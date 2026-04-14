import { THEME, withAlpha } from '../theme.js';

export function FeedbackItem({ item }) {
  const colors = { error: THEME.error, warning: THEME.warn, info: THEME.info, good: THEME.good };
  const icons = { error: "✕", warning: "▲", info: "●", good: "✓" };
  return (
    <div style={{ display: "flex", gap: 6, padding: "6px 9px", background: colors[item.type] + "08", borderLeft: `3px solid ${colors[item.type]}`, borderRadius: "0 3px 3px 0", marginBottom: 3 }}>
      <span style={{ color: colors[item.type], fontWeight: 700, fontSize: 9, width: 12, textAlign: "center" }}>{icons[item.type]}</span>
      <div style={{ flex: 1 }}>
        <span style={{ fontSize: 7, color: colors[item.type], textTransform: "uppercase", letterSpacing: 1, fontFamily: THEME.mono, fontWeight: 600 }}>{item.category}</span>
        <div style={{ fontSize: 10, color: THEME.sub, marginTop: 1, lineHeight: 1.35 }}>{item.message}</div>
        {item.tip && <div style={{ fontSize: 8, color: THEME.dim, marginTop: 2, padding: "2px 6px", background: withAlpha(THEME.text, 0.02), borderRadius: 2, lineHeight: 1.35 }}>💡 {item.tip}</div>}
      </div>
    </div>
  );
}
