import { THEME, withAlpha } from "../../theme.js";
import { Button } from "./Button.jsx";

export function Tabs({ items, value, onChange, size = "sm", style }) {
  return (
    <div
      role="tablist"
      style={{
        display: "flex",
        gap: THEME.space[1],
        padding: 2,
        borderRadius: THEME.radius.md,
        background: withAlpha(THEME.card, 0.6),
        border: `1px solid ${withAlpha(THEME.border, 0.8)}`,
        ...style,
      }}
    >
      {items.map((it) => {
        const active = it.value === value;
        return (
          <Button
            key={it.value}
            variant="tab"
            size={size}
            pressed={active}
            onClick={() => onChange?.(it.value)}
            title={it.title}
            style={{ flex: it.flex || "initial" }}
          >
            {it.label}
          </Button>
        );
      })}
    </div>
  );
}
