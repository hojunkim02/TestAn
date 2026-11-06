"use strict";
const analyze = (data) => {
  const { nItems, key, weights, scored, students } = data;
  const N = students.length;
  if (!N) throw new Error("분석할 학생 데이터가 없습니다.");
  let k = 0, maxScore = 0;
  for (let j = 0; j < nItems; j++) if (scored[j]) { k++; maxScore += weights[j]; }
  const R = new Uint32Array(nItems), A = new Uint32Array(nItems);
  const sX = new Float64Array(nItems), sX2 = new Float64Array(nItems);
  const opts = Array.from({ length: nItems }, () => new Map());
  let sY = 0, sY2 = 0, minS = Infinity, maxS = -Infinity;
  for (const s of students) {
    let Y = 0, nCorrect = 0;
    s.correct = new Uint8Array(nItems);
    for (let j = 0; j < nItems; j++) {
      const resp = s.resp[j];
      const hit = scored[j] && resp !== " " && resp === key[j];
      if (hit) { Y += weights[j]; nCorrect++; s.correct[j] = 1; }
      if (scored[j]) {
        if (hit) R[j]++;
        if (resp !== " ") A[j]++;
        const x = hit ? weights[j] : 0;
        sX[j] += x; sX2[j] += x * x;
      }
      const o = resp === " " ? "기타" : resp;
      let a = opts[j].get(o);
      if (!a) { a = { option: o, count: 0, sumY: 0, upper: 0, lower: 0 }; opts[j].set(o, a); }
      a.count++;
    }
    s.raw = Y; s.max = maxScore;
    s.percent = maxScore ? Y / maxScore * 100 : 0;
    s.correctCount = nCorrect;
    sY += Y; sY2 += Y * Y;
    if (Y < minS) minS = Y;
    if (Y > maxS) maxS = Y;
  }
  const sorted = [...students].sort((a, b) => b.raw - a.raw);
  sorted.forEach((s, i) => {
    s.rank = i > 0 && s.raw === sorted[i - 1].raw ? sorted[i - 1].rank : i + 1;
  });
  const cut = Math.max(1, Math.round(N * 0.27));
  const upperCut = sorted[Math.min(cut, N) - 1].raw;
  const lowerCut = sorted[Math.max(0, N - cut)].raw;
  const sXY = new Float64Array(nItems);
  const cU = new Uint32Array(nItems), cL = new Uint32Array(nItems);
  const meanY = sY / N;
  let nU = 0, nL = 0, minU = Infinity, maxU = -Infinity, minL = Infinity, maxL = -Infinity;
  let m3 = 0, m4 = 0;
  for (const s of students) {
    const d = s.raw - meanY;
    m3 += d * d * d;
    m4 += d * d * d * d;
    const u = s.raw >= upperCut, l = s.raw <= lowerCut;
    if (u) { nU++; if (s.raw < minU) minU = s.raw; if (s.raw > maxU) maxU = s.raw; }
    if (l) { nL++; if (s.raw < minL) minL = s.raw; if (s.raw > maxL) maxL = s.raw; }
    for (let j = 0; j < nItems; j++) {
      const o = opts[j].get(s.resp[j] === " " ? "기타" : s.resp[j]);
      o.sumY += s.raw;
      if (u) { o.upper++; cU[j] += s.correct[j]; }
      if (l) { o.lower++; cL[j] += s.correct[j]; }
      if (s.correct[j]) sXY[j] += s.raw;
    }
  }
  const s_x = Math.sqrt(Math.max(0, sY2 / N - meanY * meanY));
  const sX2sample = N > 1 ? (sY2 - sY * sY / N) / (N - 1) : 0;
  const items = new Array(nItems);
  let sumSi2 = 0;
  const scale = N / (N - 1 || 1);
  for (let j = 0; j < nItems; j++) {
    const P = R[j] / N;
    const Q = data.numOptions[j] || 0;
    const it = {
      index: j + 1,
      key: key[j],
      scored: scored[j],
      correct: R[j],
      answered: A[j],
      blank: N - A[j],
      difficulty: P,
      discrimination: (nU ? cU[j] / nU : 0) - (nL ? cL[j] / nL : 0),
      pointBiserial: pearson(sX[j], sX2[j], sXY[j], sY, sY2, N),
      pUpper: nU ? cU[j] / nU : 0,
      pLower: nL ? cL[j] / nL : 0,
      attractiveness: Q > 1 ? (1 - P) / (Q - 1) : 0,
      options: [...opts[j].values()].map(o => ({
        option: o.option,
        isKey: key[j] !== " " && o.option === key[j],
        propAll: o.count / N,
        propUpper: nU ? o.upper / nU : 0,
        propLower: nL ? o.lower / nL : 0,
        pbis: pearson(o.count, o.count, o.sumY, sY, sY2, N)
      })).sort((a, b) => b.propAll - a.propAll)
    };
    it.options.forEach(o => { o.attractive = !o.isKey && o.propAll > it.attractiveness; });
    if (scored[j]) { it.s_i2 = (sX2[j] - sX[j] * sX[j] / N) / N; sumSi2 += it.s_i2; }
    items[j] = it;
  }
  const alpha = k >= 2 && sX2sample > 0
    ? k / (k - 1) * (1 - sumSi2 * scale / sX2sample) : 0;
  for (const it of items) {
    if (k < 3 || !it.scored) { it.alphaIfDeleted = 0; continue; }
    const j = it.index - 1;
    const sYx = sY - sX[j];
    const sY2x = sY2 - 2 * sXY[j] + sX2[j];
    const varX = N > 1 ? (sY2x - sYx * sYx / N) / (N - 1) : 0;
    const kk = k - 1;
    it.alphaIfDeleted = varX > 0
      ? kk / (kk - 1) * (1 - (sumSi2 - it.s_i2) * scale / varX) : 0;
    delete it.s_i2;
  }
  const med = N % 2 ? sorted[N >> 1].raw : (sorted[(N >> 1) - 1].raw + sorted[N >> 1].raw) / 2;
  const m = [m3 / N / (s_x || 1) ** 3, m4 / N / (s_x || 1) ** 4 - 3];
  return {
    students, items,
    upper: { n: nU, min: nU ? minU : 0, max: nU ? maxU : 0 },
    lower: { n: nL, min: nL ? minL : 0, max: nL ? maxL : 0 },
    stats: {
      n: N,
      mean: meanY,
      sd: s_x,
      variance: s_x * s_x,
      max: maxScore,
      min: minS,
      high: maxS,
      median: med,
      skewness: s_x ? m[0] : 0,
      kurtosis: s_x ? m[1] : 0,
      meanDifficulty: nItems ? items.reduce((a, it) => a + it.difficulty, 0) / nItems : 0,
      meanDiscrimination: nItems ? items.reduce((a, it) => a + it.discrimination, 0) / nItems : 0,
      reliability: alpha,
      sem: s_x * Math.sqrt(Math.max(0, 1 - alpha))
    }
  };
}
const pearson = (sX, sX2, sXY, sY, sY2, N) => {
  const dX = N * sX2 - sX * sX, dY = N * sY2 - sY * sY;
  return dX > 0 && dY > 0 ? (N * sXY - sX * sY) / (Math.sqrt(dX) * Math.sqrt(dY)) : 0;
}
if (typeof module !== "undefined") {
  module.exports = { analyze };
}
