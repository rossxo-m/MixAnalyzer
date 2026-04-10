import { THEME } from '../theme.js';
import { DEFAULT_PREFS, GENRE_COLORS } from '../constants.js';
import { GENRE_TARGETS } from '../analysis/genres.js';

export function Preferences({ prefs, setPrefs, onClose }) {
  const update = (key, val) => setPrefs(p => ({ ...p, [key]: val }));
  const Slider = ({ label, k, min, max, step, unit }) => (
    <div style={{ marginBottom: 9 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 8, color: THEME.sub, fontFamily: THEME.mono, marginBottom: 1 }}>
        <span>{label}</span><span>{prefs[k]}{unit}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={prefs[k]} onChange={e => update(k, +e.target.value)} style={{ width: "100%", accentColor: THEME.accent, height: 4 }} />
    </div>
  );

  return (
    <div style={{ position: "fixed", inset: 0, background: "#000a", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={onClose}>
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

        <Slider label="LUFS Target" k="lufsTarget" min={-16} max={-4} step={0.5} unit=" LUFS" />
        <Slider label="True Peak Ceiling" k="truePeakCeiling" min={-3} max={0} step={0.1} unit=" dBTP" />
        <Slider label="Mono Crossover" k="monoCrossover" min={60} max={200} step={10} unit=" Hz" />
        <Slider label="Spectrum Slope" k="specSlope" min={0} max={4.5} step={1.5} unit=" dB/oct" />

        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          {[["showVectorscope", "Vectorscope"], ["showBandWidth", "Stereo Bands"]].map(([k, n]) => (
            <label key={k} style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 8, color: THEME.sub, fontFamily: THEME.mono, cursor: "pointer" }}>
              <input type="checkbox" checked={prefs[k]} onChange={e => update(k, e.target.checked)} style={{ accentColor: THEME.accent }} />{n}
            </label>
          ))}
        </div>

        <button onClick={() => setPrefs(DEFAULT_PREFS)} style={{
          marginTop: 10, width: "100%", padding: 6, background: THEME.card, color: THEME.sub,
          border: `1px solid ${THEME.border}`, borderRadius: 4, fontSize: 8, fontFamily: THEME.mono, cursor: "pointer",
        }}>Reset to Defaults</button>
      </div>
    </div>
  );
}
