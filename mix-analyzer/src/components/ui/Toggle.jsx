import { THEME, withAlpha } from "../../theme.js";
import { injectUIStyles } from "./_inject.js";

injectUIStyles();

export function Toggle({ checked, onChange, disabled, ariaLabel, color }) {
  const tint = color || THEME.accent;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={!!checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => !disabled && onChange?.(!checked)}
      className="ma-toggle"
      style={{
        background: checked ? withAlpha(tint, 0.45) : withAlpha(THEME.border, 0.8),
        borderColor: checked ? withAlpha(tint, 0.6) : withAlpha(THEME.border, 0.4),
        color: checked ? tint : THEME.sub,
      }}
    />
  );
}
