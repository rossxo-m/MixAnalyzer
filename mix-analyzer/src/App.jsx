import { useState, useRef, useCallback, useMemo, useEffect } from "react";
import { THEME } from './theme.js';
import { BANDS_7, DEFAULT_PREFS } from './constants.js';
import { GENRE_TARGETS } from './analysis/genres.js';
import { analyzeAsync, analyzeBPM } from './analysis/analyze.js';
import { generateFeedback } from './api/client.js';
import { PlaybackWaveform } from './components/PlaybackWaveform.jsx';
import { SpectrumDisplay } from './components/SpectrumDisplay.jsx';
import { StereoDisplay3Band } from './components/StereoDisplay3Band.jsx';
import { MetricCard } from './components/MetricCard.jsx';
import { FeedbackItem } from './components/FeedbackItem.jsx';
import { BandBar } from './components/BandBar.jsx';
import { Preferences } from './components/Preferences.jsx';

function Vectorscope({ data, size = 190 }) {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);

    const c = size / 2, scale = c * 0.85;

    ctx.fillStyle = "#080812";
    ctx.fillRect(0, 0, size, size);

    // Axes
    ctx.strokeStyle = "#151525"; ctx.lineWidth = 0.5;
    ctx.beginPath(); ctx.moveTo(c, 0); ctx.lineTo(c, size); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, c); ctx.lineTo(size, c); ctx.stroke();

    // Diagonal lines
    ctx.strokeStyle = "#12122a"; ctx.lineWidth = 0.3;
    ctx.beginPath(); ctx.moveTo(0, size); ctx.lineTo(size, 0); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(size, size); ctx.stroke();

    // Reference circles
    ctx.strokeStyle = "#151525"; ctx.lineWidth = 0.5;
    ctx.beginPath(); ctx.arc(c, c, scale * 0.5, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(c, c, scale, 0, Math.PI * 2); ctx.stroke();

    // Labels
    ctx.font = `6px '${THEME.mono}', monospace`;
    ctx.fillStyle = THEME.dim;
    ctx.textAlign = "center"; ctx.fillText("M", c + 2, 9);
    ctx.textAlign = "right";  ctx.fillText("R", size - 2, c - 2);
    ctx.textAlign = "left";   ctx.fillText("L", 2, c - 2);

    // Points
    if (data.length) {
      ctx.fillStyle = "rgba(51,170,255,0.1)";
      for (const p of data) {
        const px = c + p.x * scale, py = c - p.y * scale;
        if (px >= 0 && px <= size && py >= 0 && py <= size) {
          ctx.fillRect(px - 0.6, py - 0.6, 1.2, 1.2);
        }
      }
    }
  }, [data, size]);

  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      style={{ borderRadius: 7, display: "block" }}
    />
  );
}

function Chromagram({ chroma, root, mode }) {
  if (!chroma?.length) return null;
  const notes = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
  // Major/minor scale degrees (intervals from root)
  const majorScale = new Set([0, 2, 4, 5, 7, 9, 11]);
  const minorScale = new Set([0, 2, 3, 5, 7, 8, 10]);
  const scale = mode === "minor" ? minorScale : majorScale;
  const keyColor = mode === "minor" ? "#aa66ff" : "#33ccaa";

  return (
    <div style={{ background: THEME.card, borderRadius: 6, padding: "8px 10px", marginBottom: 12 }}>
      <div style={{ fontSize: 7, color: THEME.sub, fontFamily: THEME.mono, letterSpacing: 1.2, marginBottom: 6 }}>CHROMAGRAM</div>
      <div style={{ display: "flex", gap: 2, alignItems: "flex-end", height: 48 }}>
        {notes.map((note, i) => {
          const pc = (i - root + 12) % 12; // interval from root
          const inScale = scale.has(pc);
          const isRoot = pc === 0;
          const barH = Math.max(3, Math.round(chroma[i] * 44));
          const color = isRoot ? keyColor : inScale ? keyColor + "88" : "#2a2a44";
          return (
            <div key={note} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
              <div style={{ width: "100%", height: barH, background: color, borderRadius: "2px 2px 0 0", transition: "height 0.2s" }} />
              <span style={{ fontSize: 6, color: isRoot ? keyColor : inScale ? THEME.sub : THEME.dim, fontFamily: THEME.mono }}>{note}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════
   MAIN APPLICATION
   ════════════════════════════════════════════════════ */

export default function MixAnalyzer() {
  const [stems, setStems] = useState([]);
  const [buffers, setBuffers] = useState([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [progress, setProgress] = useState("");
  const [activeTab, setActiveTab] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const [prefs, setPrefs] = useState(DEFAULT_PREFS);
  const [showPrefs, setShowPrefs] = useState(false);
  const [view, setView] = useState("analysis");
  const ZOOM_STEPS = [1, 1.5, 2, 2.5];
  const [uiZoom, setUiZoom] = useState(() => parseFloat(localStorage.getItem('uiZoom') || '1'));
  const cycleZoom = () => setUiZoom(z => {
    const next = ZOOM_STEPS[(ZOOM_STEPS.indexOf(z) + 1) % ZOOM_STEPS.length];
    localStorage.setItem('uiZoom', next);
    return next;
  });
  const [refStem, setRefStem] = useState(null);
  const fileRef = useRef();
  const refFileRef = useRef();
  const audioCtxRef = useRef(null);

  const getAudioContext = () => {
    if (!audioCtxRef.current) audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
    return audioCtxRef.current;
  };

  const processFiles = useCallback(async (files) => {
    setAnalyzing(true);
    const ctx = getAudioContext();
    const results = [], bufs = [];
    for (let i = 0; i < files.length; i++) {
      setProgress(`${i + 1}/${files.length}: ${files[i].name}`);
      try {
        const arrayBuf = await files[i].arrayBuffer();
        const audioBuf = await ctx.decodeAudioData(arrayBuf);
        setProgress(`${i + 1}/${files.length}: analyzing ${files[i].name}...`);
        const analysis = await analyzeAsync(audioBuf);
        const feedback = await generateFeedback(analysis, prefs);
        results.push({ name: files[i].name, analysis, feedback });
        bufs.push(audioBuf);

        // BPM runs in a Worker — kick it off now, patch state when it arrives.
        // The stem index is captured at the time of the Promise so multi-file
        // drops patch the right stem even if they resolve out of order.
        const stemIdx = stems.length + results.length - 1;
        analyzeBPM(audioBuf).then(bpm => {
          setStems(prev => {
            if (!prev[stemIdx]) return prev;
            const next = [...prev];
            next[stemIdx] = { ...next[stemIdx], analysis: { ...next[stemIdx].analysis, bpm } };
            return next;
          });
        }).catch(() => {}); // BPM failure is non-fatal; metric card stays blank
      } catch (e) {
        results.push({ name: files[i].name, error: e.message });
        bufs.push(null);
      }
    }
    setStems(prev => [...prev, ...results]);
    setBuffers(prev => [...prev, ...bufs]);
    setActiveTab(stems.length);
    setAnalyzing(false);
    setProgress("");
  }, [prefs, stems.length]);

  const loadReference = useCallback(async (file) => {
    const ctx = getAudioContext();
    try {
      const arrayBuf = await file.arrayBuffer();
      const audioBuf = await ctx.decodeAudioData(arrayBuf);
      const analysis = await analyzeAsync(audioBuf);
      setRefStem({ name: file.name, analysis });
    } catch {
      // ref load failure is non-fatal
    }
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault(); setDragOver(false);
    const files = Array.from(e.dataTransfer.files).filter(f =>
      f.type.startsWith("audio/") || f.name.match(/\.(wav|mp3|flac|ogg|aac|m4a)$/i));
    if (files.length) processFiles(files);
  }, [processFiles]);

  const current = activeTab >= 0 ? stems[activeTab] : null;
  const currentBuffer = activeTab >= 0 ? buffers[activeTab] : null;
  const genreTarget = prefs.genre ? GENRE_TARGETS[prefs.genre] : null;

  const maskingWarnings = useMemo(() => {
    const warnings = [];
    if (stems.length < 2) return warnings;
    for (let i = 0; i < stems.length; i++) {
      for (let j = i + 1; j < stems.length; j++) {
        if (stems[i].error || stems[j].error) continue;
        for (let k = 0; k < BANDS_7.length; k++) {
          if (stems[i].analysis.bandDistribution[k] > 0.18 && stems[j].analysis.bandDistribution[k] > 0.18)
            warnings.push({ a: stems[i].name, b: stems[j].name, band: BANDS_7[k].name, range: `${BANDS_7[k].min}-${BANDS_7[k].max}Hz` });
        }
      }
    }
    return warnings;
  }, [stems]);

  const T = THEME;

  return (
    <div style={{ minHeight: "100vh", background: T.bg, color: T.text, fontFamily: T.sans, zoom: uiZoom }}>
      <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600;700&family=Instrument+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />
      {showPrefs && <Preferences prefs={prefs} setPrefs={setPrefs} onClose={() => setShowPrefs(false)} />}

      {/* Header */}
      <div style={{ padding: "14px 18px 10px", borderBottom: `1px solid ${T.border}`, display: "flex", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <div style={{ width: 24, height: 24, borderRadius: 5, background: "linear-gradient(135deg, #ff3366, #6644ff)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12 }}>◉</div>
          <div>
            <h1 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>MIX ANALYZER</h1>
            <div style={{ fontSize: 7, color: T.sub, fontFamily: T.mono, letterSpacing: 1 }}>
              BS.1770 · TRUE PEAK · FFT · 3-BAND STEREO · {prefs.genre || "GENERAL"}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
          <button onClick={cycleZoom} style={{ background: T.card, color: T.sub, border: `1px solid ${T.border}`, borderRadius: 4, padding: "4px 9px", fontSize: 8, cursor: "pointer", fontFamily: T.mono }}>{uiZoom}×</button>
          <button onClick={() => setShowPrefs(true)} style={{ background: T.card, color: T.sub, border: `1px solid ${T.border}`, borderRadius: 4, padding: "4px 9px", fontSize: 8, cursor: "pointer", fontFamily: T.mono }}>⚙</button>
        </div>
      </div>

      {/* Drop zone */}
      {!stems.length && !analyzing && (
        <div onDragOver={e => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)} onDrop={handleDrop} onClick={() => fileRef.current?.click()}
          style={{ margin: 18, padding: "36px 18px", border: `2px dashed ${dragOver ? T.accent : "#1a1a30"}`, borderRadius: 10, textAlign: "center", cursor: "pointer", background: dragOver ? "#6644ff06" : T.card }}>
          <div style={{ fontSize: 26, marginBottom: 5 }}>🎚️</div>
          <div style={{ fontSize: 12, fontWeight: 600 }}>Drop audio files</div>
          <div style={{ fontSize: 9, color: T.sub, marginTop: 3 }}>WAV · MP3 · FLAC · OGG</div>
          <input ref={fileRef} type="file" multiple accept="audio/*,.wav,.mp3,.flac,.ogg,.aac,.m4a" onChange={e => { const f = Array.from(e.target.files); if (f.length) processFiles(f); }} style={{ display: "none" }} />
        </div>
      )}

      {analyzing && (
        <div style={{ textAlign: "center", padding: 24 }}>
          <div style={{ fontSize: 14, color: T.accent, animation: "pulse 1.5s infinite" }}>◉</div>
          <div style={{ fontFamily: T.mono, fontSize: 8, color: T.sub, marginTop: 3 }}>{progress}</div>
          <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}`}</style>
        </div>
      )}

      {stems.length > 0 && !analyzing && (
        <div style={{ padding: "0 18px 18px" }}>
          {/* Toolbar */}
          <div style={{ display: "flex", gap: 4, padding: "7px 0", flexWrap: "wrap", alignItems: "center" }}>
            <button onClick={() => fileRef.current?.click()} style={{ background: T.card, color: "#7766bb", border: `1px solid ${T.border}`, borderRadius: 3, padding: "3px 7px", fontSize: 8, cursor: "pointer", fontFamily: T.mono }}>+ Add</button>
            <input ref={fileRef} type="file" multiple accept="audio/*,.wav,.mp3,.flac,.ogg,.aac,.m4a" onChange={e => { const f = Array.from(e.target.files); if (f.length) processFiles(f); }} style={{ display: "none" }} />
            <button onClick={() => refFileRef.current?.click()} style={{ background: refStem ? "#ffc84418" : T.card, color: refStem ? "#ffc844" : T.sub, border: `1px solid ${refStem ? "#ffc84440" : T.border}`, borderRadius: 3, padding: "3px 7px", fontSize: 8, cursor: "pointer", fontFamily: T.mono }}>+ REF</button>
            <input ref={refFileRef} type="file" accept="audio/*,.wav,.mp3,.flac,.ogg,.aac,.m4a" onChange={e => { const f = e.target.files[0]; if (f) loadReference(f); e.target.value = ""; }} style={{ display: "none" }} />
            {refStem && (
              <div style={{ display: "flex", alignItems: "center", gap: 3, padding: "2px 6px", background: "#ffc84410", border: "1px solid #ffc84430", borderRadius: 3 }}>
                <span style={{ fontSize: 7, color: "#ffc844", fontFamily: T.mono, maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>REF: {refStem.name.replace(/\.[^.]+$/, "")}</span>
                <button onClick={() => setRefStem(null)} style={{ background: "none", border: "none", color: "#ffc84480", cursor: "pointer", fontSize: 9, padding: 0, lineHeight: 1 }}>×</button>
              </div>
            )}
            <div style={{ marginLeft: "auto", display: "flex", gap: 2 }}>
              {["analysis", "stereo", "feedback"].map(v => (
                <button key={v} onClick={() => setView(v)} style={{
                  padding: "3px 7px", fontSize: 7, fontFamily: T.mono, textTransform: "uppercase", letterSpacing: 1,
                  background: view === v ? T.accent + "18" : T.card, color: view === v ? "#bb99ff" : T.sub,
                  border: `1px solid ${view === v ? T.accent + "33" : T.border}`, borderRadius: 3, cursor: "pointer",
                }}>{v}</button>
              ))}
            </div>
            <button onClick={() => { setStems([]); setBuffers([]); setActiveTab(0); }} style={{
              background: "#ff335512", color: "#ff6688", border: "1px solid #ff335528", borderRadius: 3, padding: "3px 7px", fontSize: 8, cursor: "pointer", fontFamily: T.mono,
            }}>Clear</button>
          </div>

          {/* Tabs */}
          <div style={{ display: "flex", gap: 2, marginBottom: 10, flexWrap: "wrap" }}>
            {stems.map((s, i) => (
              <button key={i} onClick={() => setActiveTab(i)} style={{
                background: activeTab === i ? T.accent + "18" : T.card, color: activeTab === i ? "#bb99ff" : T.sub,
                border: `1px solid ${activeTab === i ? T.accent + "33" : T.border}`, borderRadius: 3,
                padding: "3px 7px", fontSize: 8, cursor: "pointer", fontFamily: T.mono,
                maxWidth: 130, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>{s.name.replace(/\.[^.]+$/, "")}</button>
            ))}
            {stems.length > 1 && (
              <button onClick={() => setActiveTab(-1)} style={{
                background: activeTab === -1 ? "#ff335512" : T.card, color: activeTab === -1 ? "#ff6688" : T.sub,
                border: `1px solid ${activeTab === -1 ? "#ff335528" : T.border}`, borderRadius: 3,
                padding: "3px 7px", fontSize: 8, cursor: "pointer", fontFamily: T.mono,
              }}>⚡Mask</button>
            )}
          </div>

          {/* Masking */}
          {activeTab === -1 && (
            <div>
              <h2 style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>Masking</h2>
              {!maskingWarnings.length
                ? <div style={{ padding: 8, background: T.good + "08", borderLeft: `3px solid ${T.good}`, borderRadius: "0 3px 3px 0", fontSize: 10, color: "#88ddaa" }}>No significant masking detected.</div>
                : maskingWarnings.map((m, i) => (
                  <div key={i} style={{ padding: "6px 9px", background: T.warn + "08", borderLeft: `3px solid ${T.warn}`, borderRadius: "0 3px 3px 0", marginBottom: 3 }}>
                    <div style={{ fontSize: 8, fontWeight: 600, color: "#ff9966" }}>{m.a.replace(/\.[^.]+$/, "")} × {m.b.replace(/\.[^.]+$/, "")}</div>
                    <div style={{ fontSize: 9, color: "#9a9ab0", marginTop: 1 }}>Competing: <strong>{m.band}</strong> ({m.range})</div>
                  </div>
                ))}
            </div>
          )}

          {/* Stem detail */}
          {activeTab >= 0 && current && !current.error && (
            <div>
              <PlaybackWaveform
                buffer={currentBuffer} audioCtx={audioCtxRef.current /* eslint-disable-line react-hooks/refs -- stable singleton AudioContext, set once on first gesture, never reassigned */}
                waveData={current.analysis.spectralWaveform}
                duration={current.analysis.duration} prefs={prefs} setPrefs={setPrefs}
                bpm={current.analysis.bpm}
              keyData={{ key: current.analysis.key, mode: current.analysis.keyMode }}
              />

              {view === "analysis" && (<>
                <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 12 }}>
                  <MetricCard label="INT LUFS" value={current.analysis.lufs} unit="dB" color={T.info} sub={`ST: ${current.analysis.lufsShortTerm}`} />
                  <MetricCard label="TRUE PEAK" value={current.analysis.truePeak} unit="dBTP" color={current.analysis.truePeak > 0 ? T.error : current.analysis.truePeak > -1 ? T.warn : T.good} sub={`Sample: ${current.analysis.samplePeak}`} />
                  <MetricCard label="DR" value={current.analysis.dynamicRange} unit="dB" color="#ffaa00" sub={`LRA: ${current.analysis.lra} LU`} />
                  <MetricCard label="CREST" value={current.analysis.crestFactor} unit="dB" color="#cc44ff" />
                  <MetricCard label="WIDTH" value={current.analysis.stereoWidth} unit="%" color={T.accent} sub={`r: ${current.analysis.correlation}`} />
                  <MetricCard label="BPM" value={current.analysis.bpm} unit="" color="#ff8833" />
                  <MetricCard label="KEY" value={current.analysis.key} unit="" color={current.analysis.keyMode === "minor" ? "#aa66ff" : "#33ccaa"} sub={`conf: ${current.analysis.keyConfidence}`} />
                </div>

                <div style={{ display: "flex", gap: 8, padding: "3px 8px", background: T.card, borderRadius: 3, marginBottom: 12, fontSize: 7, color: T.dim, fontFamily: T.mono, flexWrap: "wrap" }}>
                  <span>{current.analysis.duration}s</span>
                  <span>{current.analysis.sampleRate}Hz</span>
                  <span>{current.analysis.numChannels === 1 ? "Mono" : "Stereo"}</span>
                  <span>RMS: {current.analysis.rmsDb}dB</span>
                  {current.analysis.clippingMs > 0 && <span style={{ color: T.warn }}>Clip: {current.analysis.clippingMs}ms</span>}
                  {prefs.genre && <span style={{ color: T.accent }}>Target: {prefs.genre}</span>}
                </div>

                <SpectrumDisplay
                  points={current.analysis.spectrumPoints}
                  pointsS={current.analysis.spectrumPointsS}
                  slope={prefs.specSlope}
                  genre={prefs.genre}
                  refPoints={refStem?.analysis.spectrumPoints?.map(p => ({
                    freq: p.freq,
                    db: p.db + (current.analysis.lufs - refStem.analysis.lufs),
                  }))}
                />

                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 7, color: T.dim, fontFamily: T.mono, letterSpacing: 1.5, marginBottom: 3 }}>
                    BAND DISTRIBUTION {prefs.genre && `vs ${prefs.genre}`}
                  </div>
                  {BANDS_7.map((band, i) => (
                    <BandBar key={band.name} label={band.name} value={current.analysis.bandDistribution[i]}
                      color={band.color} range={`${band.min}-${band.max}Hz`}
                      target={genreTarget ? genreTarget.bands[i] : null} />
                  ))}
                  {genreTarget && <div style={{ fontSize: 7, color: T.dim, fontFamily: T.mono, marginTop: 2 }}>White markers = {prefs.genre} target</div>}
                </div>

                <Chromagram chroma={current.analysis.chroma} root={current.analysis.keyRoot} mode={current.analysis.keyMode} />
              </>)}

              {view === "stereo" && (<>
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
                  {prefs.showVectorscope && (
                    <div>
                      <div style={{ fontSize: 7, color: T.dim, fontFamily: T.mono, letterSpacing: 1.5, marginBottom: 3 }}>VECTORSCOPE</div>
                      <Vectorscope data={current.analysis.vectorscope} size={190} />
                    </div>
                  )}
                  {prefs.showBandWidth && (
                    <div style={{ flex: 1, minWidth: 240 }}>
                      <div style={{ fontSize: 7, color: T.dim, fontFamily: T.mono, letterSpacing: 1.5, marginBottom: 3 }}>3-BAND STEREO</div>
                      <StereoDisplay3Band bands={current.analysis.stereoBands3} crossover={prefs.monoCrossover} />
                    </div>
                  )}
                </div>
                <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                  <MetricCard label="Width" value={current.analysis.stereoWidth} unit="%" color={T.accent} />
                  <MetricCard label="Corr" value={current.analysis.correlation} unit="" color={current.analysis.correlation < 0 ? T.error : current.analysis.correlation < 0.3 ? T.warn : T.good} />
                  <MetricCard label="Low W" value={current.analysis.stereoBands3?.[0]?.width || 0} unit="%" color={current.analysis.stereoBands3?.[0]?.width > 10 ? T.error : T.good} sub="Target: <10%" />
                  <MetricCard label="Mid W" value={current.analysis.stereoBands3?.[1]?.width || 0} unit="%" color={T.info} />
                  <MetricCard label="High W" value={current.analysis.stereoBands3?.[2]?.width || 0} unit="%" color="#cc44ff" />
                </div>
              </>)}

              {view === "feedback" && (<>
                <div style={{ fontSize: 7, color: T.dim, fontFamily: T.mono, letterSpacing: 1.5, marginBottom: 4 }}>
                  {prefs.genre || "GENERAL"} MIXING FEEDBACK
                </div>
                <div style={{ display: "flex", gap: 3, marginBottom: 8, flexWrap: "wrap" }}>
                  {[["Errors", "error", T.error], ["Warnings", "warning", T.warn], ["Info", "info", T.info], ["Good", "good", T.good]].map(([label, type, color]) => (
                    <div key={type} style={{ padding: "2px 7px", background: color + "08", borderRadius: 3, fontSize: 8, color, fontFamily: T.mono }}>
                      {current.feedback.filter(f => f.type === type).length} {label}
                    </div>
                  ))}
                </div>
                {current.feedback.map((f, i) => <FeedbackItem key={i} item={f} />)}
              </>)}
            </div>
          )}

          {activeTab >= 0 && current && current.error && (
            <div style={{ padding: 10, background: T.error + "08", borderLeft: `3px solid ${T.error}`, borderRadius: "0 3px 3px 0" }}>
              <div style={{ color: "#ff6688", fontWeight: 600, fontSize: 10 }}>{current.name}</div>
              <div style={{ color: "#8a8a9a", marginTop: 2, fontSize: 9 }}>{current.error}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
