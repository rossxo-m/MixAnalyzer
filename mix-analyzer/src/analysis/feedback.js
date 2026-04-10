import { GENRE_TARGETS } from './genres.js';
import { BANDS_7, BANDS_3 } from '../constants.js';

export function generateFeedback(analysis, prefs) {
  const fb = [];
  const P = (type, category, message, tip) => fb.push({ type, category, message, tip });
  const genre = prefs.genre;
  const target = GENRE_TARGETS[genre];

  // True Peak
  if (analysis.truePeak > 0) P("error", "True Peak", `+${analysis.truePeak} dBTP — intersample clipping.`, "Set limiter ceiling to -1.0 dBTP.");
  else if (analysis.truePeak > prefs.truePeakCeiling) P("warning", "True Peak", `${analysis.truePeak} dBTP — above ${prefs.truePeakCeiling} target.`, "Lower limiter ceiling.");
  else P("good", "True Peak", `${analysis.truePeak} dBTP — safe headroom.`);

  // LUFS
  const lufsTarget = target ? target.lufs : prefs.lufsTarget;
  const lufsDelta = analysis.lufs - lufsTarget;
  if (analysis.lufs > -6) P("error", "Loudness", `INT ${analysis.lufs} LUFS — extremely loud.`, "Streaming normalization will heavily penalize this.");
  else if (lufsDelta > 3) P("warning", "Loudness", `INT ${analysis.lufs} LUFS — ${Math.abs(lufsDelta).toFixed(1)}dB above ${genre} target.`, `${genre} typical: ${lufsTarget} LUFS.`);
  else if (lufsDelta < -4) P("info", "Loudness", `INT ${analysis.lufs} LUFS — ${Math.abs(lufsDelta).toFixed(1)}dB below target.`, "May sound weak vs reference tracks.");
  else P("good", "Loudness", `INT ${analysis.lufs} LUFS — within ${genre} range.`);

  // Dynamics
  if (analysis.lra < 3) P("warning", "Dynamics", `LRA ${analysis.lra} LU — almost no dynamic movement.`, "Drop should hit harder than breakdown. Ease off master compression.");
  else if (analysis.dynamicRange < 4) P("warning", "Dynamics", `DR ${analysis.dynamicRange} dB — over-compressed.`, "Raise limiter threshold.");
  else P("good", "Dynamics", `LRA ${analysis.lra} LU, DR ${analysis.dynamicRange} dB — healthy.`);

  if (analysis.crestFactor < 4) P("warning", "Transients", `Crest ${analysis.crestFactor} dB — transients squashed.`, "Try a clipper before the limiter to shave peaks more transparently.");

  // 3-band stereo
  if (analysis.numChannels > 1 && analysis.stereoBands3[0]) {
    const lowW = analysis.stereoBands3[0].width;
    if (lowW > 10) P("error", "Sub Mono", `Low band width ${lowW}% — should be mono.`, `Collapse everything below ~${prefs.monoCrossover}Hz with M/S EQ.`);
    else P("good", "Sub Mono", `Low band ${lowW}% — properly mono.`);

    const midW = analysis.stereoBands3[1].width;
    if (midW > 45) P("warning", "Mid Stereo", `Mid band width ${midW}% — very wide.`, "May lose focus in clubs. Consider narrowing lead elements.");

    const hiW = analysis.stereoBands3[2].width;
    if (hiW < 5) P("info", "High Stereo", `High band width ${hiW}% — narrow.`, "Highs can usually be wider. Try stereo widening on reverb/delay returns.");
  }

  // Phase
  if (analysis.correlation < 0) P("error", "Phase", `Correlation ${analysis.correlation} — destructive cancellation.`, "Check bass layers for phase issues. Flip polarity on one layer.");
  else if (analysis.correlation < 0.3) P("warning", "Phase", `Correlation ${analysis.correlation} — low.`, "May collapse badly in mono. Test with mono preview.");

  // Spectral balance vs genre target
  if (target) {
    const d = analysis.bandDistribution;
    const t = target.bands;
    for (let i = 0; i < BANDS_7.length; i++) {
      const diff = d[i] - t[i];
      if (Math.abs(diff) > 0.06) {
        const direction = diff > 0 ? "heavy" : "light";
        const pct = Math.round(Math.abs(diff) * 100);
        P(diff > 0 ? "warning" : "info", "Spectrum",
          `${BANDS_7[i].name} (${BANDS_7[i].min}-${BANDS_7[i].max}Hz) is ${pct}% ${direction} vs ${genre}.`,
          diff > 0 ? `Consider cutting in this range.` : `Consider boosting in this range.`);
      }
    }
  }

  if (analysis.clippingMs > 0) P("warning", "Clipping", `${analysis.clippingMs}ms of sample-level clipping.`, "Use a clipper or limiter.");

  return fb;
}
