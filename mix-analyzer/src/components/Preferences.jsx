import { THEME, THEMES } from '../theme.js';
import { DEFAULT_PREFS } from '../constants.js';
import { GENRE_TARGETS } from '../analysis/genres.js';
import { Button } from './ui/Button.jsx';
import { Modal } from './ui/Modal.jsx';
import { Tabs } from './ui/Tabs.jsx';

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
    <Modal open={true} onClose={onClose} title="Settings" width={340}>
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
            {Object.entries(THEMES).map(([key, t]) => (
              <Button
                key={key}
                variant="tab"
                pressed={(prefs.themePreset ?? "nebula") === key}
                onClick={() => update("themePreset", key)}
                style={{ padding: "5px 4px", textTransform: "none", letterSpacing: 0.5 }}
              >
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: t.accent, flexShrink: 0, border: `1px solid ${t.border}`, display: "inline-block" }} />
                <span style={{ marginLeft: 4 }}>{t.name}</span>
              </Button>
            ))}
          </div>

          <div style={{ fontSize: 8, color: THEME.dim, fontFamily: THEME.mono, marginBottom: 3 }}>Vectorscope Style</div>
          <Tabs
            items={[{ value: "dots", label: "Dots", flex: 1 }, { value: "pixels", label: "Pixels", flex: 1 }]}
            value={prefs.vectorscopeStyle ?? "dots"}
            onChange={v => update("vectorscopeStyle", v)}
          />

          <div style={{ fontSize: 8, color: THEME.dim, fontFamily: THEME.mono, marginBottom: 3, marginTop: 8 }}>Spectral Waveform Blend</div>
          <Tabs
            items={[{ value: "classic", label: "Classic", flex: 1 }, { value: "layered", label: "Layered", flex: 1 }]}
            value={prefs.spectralBlend ?? "layered"}
            onChange={v => update("spectralBlend", v)}
          />
        </div>

        {/* Feedback engine */}
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 8, color: THEME.sub, fontFamily: THEME.mono, marginBottom: 3 }}>Feedback Engine</div>
          <Tabs
            items={[{ value: 1, label: "Offline", flex: 1 }, { value: 3, label: "Cloud (AI)", flex: 1 }]}
            value={prefs.feedbackTier}
            onChange={v => update("feedbackTier", v)}
          />
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

        <Button
          onClick={() => setPrefs(DEFAULT_PREFS)}
          style={{ marginTop: 10, width: "100%" }}
        >Reset to Defaults</Button>
    </Modal>
  );
}
