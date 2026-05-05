// One-shot style tag for ma-ui primitives. Imported by each primitive;
// CSS rules handle hover/active/focus-visible/aria-pressed transitions so
// inline React styles stay palette-driven and theme-swap friendly.
let injected = false;

export function injectUIStyles() {
  if (injected || typeof document === "undefined") return;
  injected = true;
  const css = `
.ma-btn {
  font-family: 'JetBrains Mono', monospace;
  cursor: pointer;
  user-select: none;
  -webkit-tap-highlight-color: transparent;
  transition: background 120ms ease, border-color 120ms ease, color 120ms ease, transform 80ms ease, box-shadow 120ms ease, filter 120ms ease;
  border: 1px solid transparent;
  display: inline-flex; align-items: center; justify-content: center;
  gap: 4px; white-space: nowrap; outline: none;
  line-height: 1;
}
.ma-btn:disabled { cursor: not-allowed; opacity: 0.4; }
.ma-btn:not(:disabled):hover { filter: brightness(1.15); }
.ma-btn:not(:disabled):active { transform: translateY(1px) scale(0.98); filter: brightness(0.92); }
.ma-btn:focus-visible { box-shadow: 0 0 0 2px currentColor; }
@media (hover: none) { .ma-btn:not(:disabled):hover { filter: none; } }
@media (prefers-reduced-motion: reduce) {
  .ma-btn, .ma-toggle, .ma-toggle::before { transition: none !important; }
}

.ma-toggle {
  appearance: none; -webkit-appearance: none; padding: 0; margin: 0;
  cursor: pointer; position: relative;
  width: 28px; height: 16px; border-radius: 999px;
  border: 1px solid transparent;
  transition: background 180ms ease, border-color 180ms ease;
  -webkit-tap-highlight-color: transparent;
  flex-shrink: 0;
}
.ma-toggle::before {
  content: ""; position: absolute; top: 1px; left: 1px;
  width: 12px; height: 12px; border-radius: 999px;
  background: currentColor;
  transition: transform 180ms cubic-bezier(.2,.6,.2,1);
}
.ma-toggle[aria-checked="true"]::before { transform: translateX(12px); }
.ma-toggle:focus-visible { box-shadow: 0 0 0 2px currentColor; outline: none; }
.ma-toggle:disabled { cursor: not-allowed; opacity: 0.4; }

.ma-modal-backdrop {
  position: fixed; inset: 0; z-index: 100;
  background: rgba(0,0,0,0.55);
  display: flex; align-items: center; justify-content: center;
  padding: 16px;
  animation: ma-fade 120ms ease;
}
.ma-modal-panel {
  width: min(92vw, 340px);
  max-height: 85vh; overflow: auto;
  border-radius: 8px; padding: 14px;
  animation: ma-pop 180ms cubic-bezier(.2,.6,.2,1);
}
@keyframes ma-fade { from { opacity: 0 } to { opacity: 1 } }
@keyframes ma-pop { from { opacity: 0; transform: translateY(6px) scale(0.98) } to { opacity: 1; transform: translateY(0) scale(1) } }
@media (prefers-reduced-motion: reduce) {
  .ma-modal-backdrop, .ma-modal-panel { animation: none !important; }
}
`;
  const tag = document.createElement("style");
  tag.id = "ma-ui-styles";
  tag.textContent = css;
  document.head.appendChild(tag);
}
