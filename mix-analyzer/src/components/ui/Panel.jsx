import { THEME, withAlpha } from "../../theme.js";

export function Panel({ title, right, children, style, bodyStyle, padded = true }) {
  return (
    <div
      style={{
        background: THEME.card,
        border: `1px solid ${withAlpha(THEME.border, 0.9)}`,
        borderRadius: THEME.radius.md,
        boxShadow: THEME.shadow.sm,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        ...style,
      }}
    >
      {(title || right) && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: THEME.space[3],
            padding: `${THEME.space[2]}px ${THEME.space[3]}px`,
            borderBottom: `1px solid ${withAlpha(THEME.border, 0.6)}`,
            background: `linear-gradient(to bottom, ${withAlpha(THEME.accent, 0.04)}, transparent)`,
          }}
        >
          <div
            style={{
              fontFamily: THEME.mono,
              fontSize: THEME.type.xs,
              color: THEME.dim,
              letterSpacing: 1.2,
              textTransform: "uppercase",
              fontWeight: 600,
            }}
          >
            {title}
          </div>
          {right && <div style={{ display: "flex", gap: THEME.space[2], alignItems: "center" }}>{right}</div>}
        </div>
      )}
      <div style={{ padding: padded ? THEME.space[3] : 0, ...bodyStyle }}>{children}</div>
    </div>
  );
}
