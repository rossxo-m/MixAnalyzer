import { fft } from './fft.js';
import { BANDS_7, BANDS_3 } from '../constants.js';

export function computeStereo(buffer) {
  if (buffer.numberOfChannels < 2) return { bands7: BANDS_7.map(() => ({ width: 0, corr: 1 })), bands3: BANDS_3.map(() => ({ width: 0, corr: 1 })) };

  const sr = buffer.sampleRate, len = buffer.length;
  const L = buffer.getChannelData(0), R = buffer.getChannelData(1);
  const N = 8192, half = N / 2, freqRes = sr / N;

  const win = new Float32Array(N);
  for (let i = 0; i < N; i++) win[i] = 0.5 * (1 - Math.cos(2 * Math.PI * i / (N - 1)));

  const accum = BANDS_7.map(() => ({ sLL: 0, sRR: 0, sLR: 0, sM: 0, sS: 0 }));
  const numH = Math.floor((len - N) / (N / 2));
  const maxH = Math.min(numH, 24);
  const hStep = Math.max(1, Math.floor(numH / maxH));

  for (let h = 0; h < numH; h += hStep) {
    const off = h * (N / 2);
    if (off + N > len) break;
    const reL = new Float64Array(N), imL = new Float64Array(N);
    const reR = new Float64Array(N), imR = new Float64Array(N);
    for (let i = 0; i < N; i++) { reL[i] = L[off+i] * win[i]; reR[i] = R[off+i] * win[i]; }
    fft(reL, imL); fft(reR, imR);

    for (let b = 0; b < BANDS_7.length; b++) {
      const lo = Math.max(1, Math.floor(BANDS_7[b].min / freqRes));
      const hi = Math.min(half - 1, Math.ceil(BANDS_7[b].max / freqRes));
      const acc = accum[b];
      for (let k = lo; k <= hi; k++) {
        acc.sLL += reL[k]*reL[k] + imL[k]*imL[k];
        acc.sRR += reR[k]*reR[k] + imR[k]*imR[k];
        acc.sLR += reL[k]*reR[k] + imL[k]*imR[k];
        const mR = (reL[k]+reR[k])/2, mI = (imL[k]+imR[k])/2;
        const sR = (reL[k]-reR[k])/2, sI = (imL[k]-imR[k])/2;
        acc.sM += mR*mR + mI*mI;
        acc.sS += sR*sR + sI*sI;
      }
    }
  }

  const bands7 = accum.map(a => ({
    width: a.sM + a.sS > 0 ? +((a.sS / (a.sM + a.sS)) * 100).toFixed(1) : 0,
    corr: +(a.sLR / (Math.sqrt(a.sLL * a.sRR) + 1e-20)).toFixed(3),
  }));

  // Group into 3-band
  const bands3 = BANDS_3.map(b3 => {
    let sM = 0, sS = 0, sLR = 0, sLL = 0, sRR = 0;
    for (const idx of b3.bandIndices) {
      const a = accum[idx];
      sM += a.sM; sS += a.sS; sLR += a.sLR; sLL += a.sLL; sRR += a.sRR;
    }
    return {
      width: sM + sS > 0 ? +((sS / (sM + sS)) * 100).toFixed(1) : 0,
      corr: +(sLR / (Math.sqrt(sLL * sRR) + 1e-20)).toFixed(3),
    };
  });

  return { bands7, bands3 };
}
