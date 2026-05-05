import { THEME, withAlpha } from "../../theme.js";
import { injectUIStyles } from "./_inject.js";

injectUIStyles();

function sizeStyle(size) {
  const sp = THEME.space, t = THEME.type, r = THEME.radius;
  if (size === "md") {
    return { padding: `${sp[2] + 2}px ${sp[4]}px`, fontSize: t.sm, borderRadius: r.sm, minHeight: 26 };
  }
  if (size === "icon") {
    return { padding: `${sp[2]}px ${sp[2] + 1}px`, fontSize: t.sm, borderRadius: r.sm, minWidth: 24, minHeight: 24 };
  }
  return { padding: `${sp[2]}px ${sp[3]}px`, fontSize: t.xs, borderRadius: r.sm, minHeight: 22 };
}

function variantStyle(variant, pressed) {
  switch (variant) {
    case "primary":
      return {
        background: THEME.accent,
        color: "#fff",
        borderColor: "transparent",
        fontWeight: 600,
      };
    case "tertiary":
      return {
        background: "transparent",
        color: pressed ? THEME.text : THEME.sub,
        borderColor: "transparent",
      };
    case "tab":
      return pressed
        ? {
            background: withAlpha(THEME.accent, 0.18),
            color: THEME.accent,
            borderColor: withAlpha(THEME.accent, 0.45),
            fontWeight: 600,
          }
        : {
            background: "transparent",
            color: THEME.sub,
            borderColor: withAlpha(THEME.border, 0.8),
          };
    case "icon":
      return {
        background: withAlpha(THEME.card, 0.7),
        color: pressed ? THEME.accent : THEME.sub,
        borderColor: pressed ? withAlpha(THEME.accent, 0.5) : withAlpha(THEME.border, 0.6),
      };
    case "danger":
      return {
        background: withAlpha(THEME.error, 0.15),
        color: THEME.error,
        borderColor: withAlpha(THEME.error, 0.4),
      };
    case "secondary":
    default:
      return pressed
        ? {
            background: withAlpha(THEME.accent, 0.18),
            color: THEME.accent,
            borderColor: withAlpha(THEME.accent, 0.5),
            fontWeight: 600,
          }
        : {
            background: withAlpha(THEME.card, 0.8),
            color: THEME.text,
            borderColor: withAlpha(THEME.border, 0.9),
          };
  }
}

export function Button({
  variant = "secondary",
  size = "sm",
  pressed = false,
  disabled = false,
  type = "button",
  children,
  style,
  title,
  ariaLabel,
  ...rest
}) {
  const merged = {
    fontFamily: THEME.mono,
    letterSpacing: 0.3,
    textTransform: variant === "tab" ? "uppercase" : undefined,
    ...sizeStyle(size),
    ...variantStyle(variant, pressed),
    ...style,
  };
  return (
    <button
      {...rest}
      type={type}
      className="ma-btn"
      aria-pressed={variant === "tab" || pressed ? pressed : undefined}
      aria-label={ariaLabel}
      title={title}
      disabled={disabled}
      style={merged}
    >
      {children}
    </button>
  );
}
