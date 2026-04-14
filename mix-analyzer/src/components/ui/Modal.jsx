import { useEffect } from "react";
import { THEME, withAlpha } from "../../theme.js";
import { injectUIStyles } from "./_inject.js";
import { Button } from "./Button.jsx";

injectUIStyles();

export function Modal({ open, onClose, title, children, width, footer }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="ma-modal-backdrop"
      onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className="ma-modal-panel"
        style={{
          width: width ? `min(92vw, ${width}px)` : undefined,
          background: THEME.card,
          border: `1px solid ${withAlpha(THEME.border, 0.9)}`,
          boxShadow: THEME.shadow.lg,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: THEME.space[3],
          }}
        >
          <div
            style={{
              fontFamily: THEME.mono,
              fontSize: THEME.type.sm,
              color: THEME.text,
              letterSpacing: 1.2,
              textTransform: "uppercase",
              fontWeight: 700,
            }}
          >
            {title}
          </div>
          <Button variant="tertiary" size="icon" ariaLabel="Close" onClick={onClose}>
            ×
          </Button>
        </div>
        <div>{children}</div>
        {footer && (
          <div
            style={{
              marginTop: THEME.space[4],
              paddingTop: THEME.space[3],
              borderTop: `1px solid ${withAlpha(THEME.border, 0.6)}`,
              display: "flex",
              gap: THEME.space[2],
              justifyContent: "flex-end",
            }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
