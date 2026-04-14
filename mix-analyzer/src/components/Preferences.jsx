import { THEME, THEMES, withAlpha } from '../theme.js';
import { DEFAULT_PREFS } from '../constants.js';
import { GENRE_TARGETS } from '../analysis/genres.js';

function PrefSlider({ label, k, min, max, step, unit, prefs, update }) {
  return (
    <div style={{ marginBottom: 9 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 8, color: THEME.sub, fontFamily: THEME.mono, marginBottom: 1 }}>
        <span>{label}</span><span>{prefs[k]}{unit}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={prefs[k]} onChange={e => update(k, +e.target.value)} style={{ width: "100%", accentColor: THEME.accent, height: 4 }} />
    </div>
  );
}

export function Preferences({ prefs, setPrefs, onClose }) {
  const update = (key, val) => setPrefs(p => ({ ...p, [key]: val }));
  const updateApiKey = (val) => {
    setPrefs(p => ({ ...p, apiKey: val }));
    if (val) localStorage.setItem('anthropicApiKey', val);
    else localStorage.removeItem('anthropicApiKey');
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: withAlpha(THEME.bg, 0.72), zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", zoom: 0.75 }} onClick={onClose}>
      <div style={{ background: THEME.bg, border: `1px solid ${THEME.border}`, borderRadius: 10, padding: 18, width: 340, maxHeight: "80vh", overflow: "auto" }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
          <h2 style={{ margin: 0, fontSize: 13, fontWeight: 700 }}>Settings</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", color: THEME.sub, fontSize: 14, cursor: "pointer" }}>✕</button>
        </div>

        {/* Genre */}
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 8, color: THEME.sub, fontFamily: THEME.mono, marginBottom: 2 }}>Genre Target</div>
          <select value={prefs.genre} onChange={e => update("genre", e.target.value)} style={{
            width: "100%", background: THEME.card, color: THEME.text, border: `1px solid ${THEME.border}`,
            borderRadius: 4, padding: "4px 8px", fontSize: 11, fontFamily: THEME.sans, cursor: "pointer", outline: "none",
          }}>
            <option value="">None</option>
            {Object.keys(GENRE_TARGETS).map(g => <option key={g} value={g}>{g}</option>)}
          </select>
        </div>

        <PrefSlider label="LUFS Target" k="lufsTarget" min={-16} max={-4} step={0.5} unit=" LUFS" prefs={prefs} update={update} />
        <PrefSlider label="True Peak Ceiling" k="truePeakCeiling" min={-3} max={0} step={0.1} unit=" dBTP" prefs={prefs} update={update} />
        <PrefSlider label="Mono Crossover" k="monoCrossover" min={60} max={200} step={10} unit=" Hz" prefs={prefs} update={update} />
        <PrefSlider label="Spectrum Slope" k="specSlope" min={0} max={6} step={0.1} unit=" dB/oct" prefs={prefs} update={update} />

        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          {[["showVectorscope", "Vectorscope"], ["showBandWidth", "Stereo Bands"]].map(([k, n]) => (
            <label key={k} style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 8, color: THEME.sub, fontFamily: THEME.mono, cursor: "pointer" }}>
              <input type="checkbox" checked={prefs[k]} onChange={e => update(k, e.target.checked)} style={{ accentColor: THEME.accent }} />{n}
            </label>
          ))}
        </div>

        {/* Visual */}
        <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px solid ${THEME.border}` }}>
          <div style={{ fontSize: 8, color: THEME.sub, fontFamily: THEME.mono, marginBottom: 4, letterSpacing: 1 }}>VISUAL</div>

          <div style={{ fontSize: 8, color: THEME.dim, fontFamily: THEME.mono, marginBottom: 3 }}>Color Theme</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 4, marginBottom: 8 }}>
            {Object.entries(THEMES).map(([key, t]) => {
              const active = (prefs.themePreset ?? "nebula") === key;
              return (
                <button key={key} onClick={() => update("themePreset", key)} style={{
                  padding: "5px 4px",
                  background: active ? THEME.accent : THEME.card,
                  color: active ? THEME.bg : THEME.sub,
                  border: `1px solid ${active ? THEME.accent : THEME.border}`,
                  borderRadius: 4, fontSize: 8, fontFamily: THEME.mono, fontWeight: 700,
                  cursor: "pointer", letterSpacing: 0.5, display: "flex",
                  alignItems: "center", justifyContent: "center", gap: 4,
                }}>
                  <span style={{
                    width: 7, height: 7, borderRadius: "50%",
                    background: t.accent, flexShrink: 0,
                    border: `1px solid ${t.border}`,
                  }} />
                  {t.name}
                </button>
              );
            })}
          </div>

          <div style={{ fontSize: 8, color: THEME.dim, fontFamily: THEME.mono, marginBottom: 3 }}>Vectorscope Style</div>
          <div style={{ display: "flex", gap: 4 }}>
            {[["dots", "Dots"], ["pixels", "Pixels"]].map(([val, label]) => {
              const active = (prefs.vectorscopeStyle ?? "dots") === val;
              return (
                <button key={val} onClick={() => update("vectorscopeStyle", val)} style={{
                  flex: 1, padding: "5px 6px",
                  background: active ? THEME.accent : THEME.card,
                  color: active ? THEME.bg : THEME.sub,
                  border: `1px solid ${active ? THEME.accent : THEME.border}`,
                  borderRadius: 4, fontSize: 8, fontFamily: THEME.mono, fontWeight: 700,
                  cursor: "pointer", letterSpacing: 0.5,
                }}>{label}</button>
              );
            })}
          </div>

          <div style={{ fontSize: 8, color: THEME.dim, fontFamily: THEME.mono, marginBottom: 3, marginTop: 8 }}>Spectral Waveform Blend</div>
          <div style={{ display: "flex", gap: 4 }}>
            {[["classic", "Classic"], ["layered", "Layered"]].map(([val, label]) => {
              const active = (prefs.spectralBlend ?? "layered") === val;
              return (
                <button key={val} onClick={() => update("spectralBlend", val)} style={{
                  flex: 1, padding: "5px 6px",
                  background: active ? THEME.accent : THEME.card,
                  color: active ? THEME.bg : THEME.sub,
                  border: `1px solid ${active ? THEME.accent : THEME.border}`,
                  borderRadius: 4, fontSize: 8, fontFamily: THEME.mono, fontWeight: 700,
                  cursor: "pointer", letterSpacing: 0.5,
                }}>{label}</button>
              );
            })}
          </div>
        </div>

        {/* Feedback engine */}
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 8, color: THEME.sub, fontFamily: THEME.mono, marginBottom: 3 }}>Feedback Engine</div>
          <div style={{ display: "flex", gap: 4 }}>
            {[[1, "OFFLINE"], [3, "CLOUD (AI)"]].map(([tier, label]) => {
              const active = prefs.feedbackTier === tier;
              return (
                <button key={tier} onClick={() => update("feedbackTier", tier)} style={{
                  flex: 1, padding: "5px 6px",
                  background: active ? THEME.accent : THEME.card,
                  color: active ? THEME.bg : THEME.sub,
                  border: `1px solid ${active ? THEME.accent : THEME.border}`,
                  borderRadius: 4, fontSize: 8, fontFamily: THEME.mono, fontWeight: 700,
                  cursor: "pointer", letterSpacing: 0.5,
                }}>{label}</button>
              );
            })}
          </div>
          {prefs.feedbackTier === 3 && (
            <>
              <div style={{ fontSize: 7, color: THEME.dim, fontFamily: THEME.mono, marginTop: 4, lineHeight: 1.4 }}>
                Backend at <code>{import.meta.env.VITE_API_URL || 'http://localhost:8000'}</code>. Key below overrides backend env. Falls back to OFFLINE on error.
              </div>
              <div style={{ marginTop: 6 }}>
                <div style={{ fontSize: 8, color: THEME.sub, fontFamily: THEME.mono, marginBottom: 2 }}>Anthropic API Key (optional)</div>
                <input
                  type="password"
                  value={prefs.apiKey || ''}
                  onChange={e => updateApiKey(e.target.value)}
                  placeholder="sk-ant-..."
                  autoComplete="off"
                  spellCheck={false}
                  style={{
                    width: "100%", background: THEME.card, color: THEME.text,
                    border: `1px solid ${THEME.border}`, borderRadius: 4,
                    padding: "5px 8px", fontSize: 10, fontFamily: THEME.mono,
                    outline: "none", boxSizing: "border-box",
                  }}
                />
                <div style={{ fontSize: 7, color: THEME.dim, fontFamily: THEME.mono, marginTop: 3, lineHeight: 1.4 }}>
                  Saved to browser localStorage. Leave blank to use the backend's ANTHROPIC_API_KEY.
                </div>
              </div>
            </>
          )}
        </div>

        <button onClick={() => setPrefs(DEFAULT_PREFS)} style={{
          marginTop: 10, width: "100%", padding: 6, background: THEME.card, color: THEME.sub,
          border: `1px solid ${THEME.border}`, borderRadius: 4, fontSize: 8, fontFamily: THEME.mono, cursor: "pointer",
        }}>Reset to Defaults</button>
      </div>
    </div>
  );
}
