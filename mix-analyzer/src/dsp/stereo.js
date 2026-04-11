import { BANDS_3, BANDS_7 } from '../constants.js';

/**
 * Derives stereo band outputs from the shared FFT result (P5.3).
 * Band accumulators were computed in sharedFFT.js via the M/S identity:
 *   L[k] = mid[k] + side[k],  R[k] = mid[k] - side[k]
 * All downstream math (width, correlation) is identical to the original.
 */
export function computeStereo(shared) {
  if (!shared.isStereo) {
    return {
      bands7: BANDS_7.map(() => ({ width: 0, corr: 1 })),
      bands3: BANDS_3.map(() => ({ width: 0, corr: 1 })),
    };
  }

  const { stereoAccum } = shared;

  const bands7 = stereoAccum.map(a => ({
    width: a.sM + a.sS > 0 ? +((a.sS / (a.sM + a.sS)) * 100).toFixed(1) : 0,
    corr: +(a.sLR / (Math.sqrt(a.sLL * a.sRR) + 1e-20)).toFixed(3),
  }));

  const bands3 = BANDS_3.map(b3 => {
    let sM = 0, sS = 0, sLR = 0, sLL = 0, sRR = 0;
    for (const idx of b3.bandIndices) {
      const a = stereoAccum[idx];
      sM += a.sM; sS += a.sS; sLR += a.sLR; sLL += a.sLL; sRR += a.sRR;
    }
    return {
      width: sM + sS > 0 ? +((sS / (sM + sS)) * 100).toFixed(1) : 0,
      corr: +(sLR / (Math.sqrt(sLL * sRR) + 1e-20)).toFixed(3),
    };
  });

  return { bands7, bands3 };
}
