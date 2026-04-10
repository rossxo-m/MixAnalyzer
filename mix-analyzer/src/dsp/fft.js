export function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    while (j & bit) { j ^= bit; bit >>= 1; }
    j ^= bit;
    if (i < j) {
      let t = re[i]; re[i] = re[j]; re[j] = t;
      t = im[i]; im[i] = im[j]; im[j] = t;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len;
    const wR = Math.cos(ang), wI = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cR = 1, cI = 0;
      for (let j = 0; j < len / 2; j++) {
        const idx = i + j + len / 2;
        const tR = cR * re[idx] - cI * im[idx];
        const tI = cR * im[idx] + cI * re[idx];
        re[idx] = re[i+j] - tR; im[idx] = im[i+j] - tI;
        re[i+j] += tR; im[i+j] += tI;
        const nr = cR * wR - cI * wI;
        cI = cR * wI + cI * wR; cR = nr;
      }
    }
  }
}
