"use strict";

// 고전적 문항분석(CTT) — 매뉴얼(성태제, 2000) 1부의 공식을 그대로 구현.
//
//   문항 난이도    P  = R / N                                    (III-1)
//   문항 변별도    r  = (NΣXY − ΣXΣY) / (√(NΣX²−(ΣX)²) · √(NΣY²−(ΣY)²))   (III-2, 문항점수 X·총점 Y의 적률상관)
//   변별도 지수    D  = P_U − P_L                                 (III-2, Kelly의 상·하위 27% 집단)
//   오답지 매력도  P_o = (1 − P) / (Q − 1)                        (III-3)
//   Cronbach α     α  = (n/(n−1)) · [1 − Σs_i² / s_x²]           (IV-2)
//   측정 오차      SEM = s_x · √(1 − α)                           (IV-3)
//
// 최적화: 모든 통계를 학생 1회 순회로 집계(O(k·n)), 문항 제외 시 α는 합집계로 O(1).

function analyze(data) {
  const { nItems, key, weights, scored, students } = data;
  const N = students.length;
  if (!N) throw new Error("분석할 학생 데이터가 없습니다.");
  let k = 0;
  for (let j = 0; j < nItems; j++) if (scored[j]) k++;

  // 문항별 집계: R(정답자), 응답자, ΣX·ΣX²·ΣXY, 답지별 (도수, ΣY)
  const R = new Array(nItems).fill(0);
  const A = new Array(nItems).fill(0);
  const sX = new Float64Array(nItems), sX2 = new Float64Array(nItems), sXY = new Float64Array(nItems);
  const opts = Array.from({ length: nItems }, () => new Map());

  let maxScore = 0;
  for (let j = 0; j < nItems; j++) if (scored[j]) maxScore += weights[j];

  let sY = 0, sY2 = 0;
  for (const s of students) {
    let Y = 0;
    s.correct = new Array(nItems);
    for (let j = 0; j < nItems; j++) {
      const resp = s.resp[j];
      const X = scored[j] && resp !== " " && resp === key[j] ? weights[j] : 0;
      s.correct[j] = X > 0;
      if (scored[j]) {
        R[j] += X > 0 ? 1 : 0;
        A[j] += resp !== " " ? 1 : 0;
        sX[j] += X; sX2[j] += X * X;
      }
      const o = resp === " " ? "기타" : resp;
      let a = opts[j].get(o);
      if (!a) { a = { option: o, count: 0, sumY: 0, upper: 0, lower: 0 }; opts[j].set(o, a); }
      a.count++;
      Y += X;
    }
    s.raw = Y;
    s.max = maxScore;
    s.percent = maxScore ? Y / maxScore * 100 : 0;
    s.correctCount = 0;
    for (let j = 0; j < nItems; j++) if (s.correct[j]) s.correctCount++;
    sY += Y; sY2 += Y * Y;
    for (let j = 0; j < nItems; j++) {
      const o = s.resp[j] === " " ? "기타" : s.resp[j];
      opts[j].get(o).sumY += Y;
      if (s.correct[j]) sXY[j] += Y;
    }
  }

  // 순위(동점 처리)와 Kelly의 상·하위 27% 집단(경계 점수 동점자 포함)
  const sorted = [...students].sort((a, b) => b.raw - a.raw);
  sorted.forEach((s, i) => {
    s.rank = i > 0 && s.raw === sorted[i - 1].raw ? sorted[i - 1].rank : i + 1;
  });
  const cut = Math.max(1, Math.round(N * 0.27));
  const U = students.filter(s => s.raw >= sorted[Math.min(cut, N) - 1].raw);
  const L = students.filter(s => s.raw <= sorted[Math.max(0, N - cut)].raw);
  const inU = new Set(U), inL = new Set(L);
  const nU = U.length, nL = L.length;
  for (let j = 0; j < nItems; j++) {
    for (const s of students) {
      const o = opts[j].get(s.resp[j] === " " ? "기타" : s.resp[j]);
      if (inU.has(s)) o.upper++;
      if (inL.has(s)) o.lower++;
    }
  }

  // 총점 통계: 평균, 모집단 표준편차 s_x, 분산 s_x² (원본 .out과 동일)
  const meanY = sY / N;
  const s_x = Math.sqrt(Math.max(0, sY2 / N - meanY * meanY));
  const s_x2 = s_x * s_x;

  // 문항 통계 (III-1, III-2, III-3)
  const items = [];
  let sumSi2 = 0;
  for (let j = 0; j < nItems; j++) {
    const P = R[j] / N;
    const pU = nU ? U.filter(s => s.correct[j]).length / nU : 0;
    const pL = nL ? L.filter(s => s.correct[j]).length / nL : 0;
    const Q = data.numOptions[j] || 0;
    const it = {
      index: j + 1,
      key: key[j],
      scored: scored[j],
      correct: R[j],
      answered: A[j],
      blank: N - A[j],
      difficulty: P,                       // P = R/N
      discrimination: pU - pL,             // D = P_U − P_L
      pointBiserial: pearson(sX[j], sX2[j], sXY[j], sY, sY2, N),  // r
      pUpper: pU,
      pLower: pL,
      attractiveness: Q > 1 ? (1 - P) / (Q - 1) : 0,   // P_o = (1−P)/(Q−1)
      options: [...opts[j].values()].map(o => ({
        option: o.option,
        isKey: key[j] !== " " && o.option === key[j],
        propAll: o.count / N,
        propUpper: nU ? o.upper / nU : 0,
        propLower: nL ? o.lower / nL : 0,
        pbis: pearson(o.count, o.count, o.sumY, sY, sY2, N)   // 선택 여부(0/1)와 총점의 r
      })).sort((a, b) => b.propAll - a.propAll)
    };
    it.options.forEach(o => { o.attractive = !o.isKey && o.propAll > it.attractiveness; });
    items.push(it);
    if (scored[j]) {
      it.s_i2 = (sX2[j] - sX[j] * sX[j] / N) / N;   // s_i² = Σ(X−X̄)²/N
      sumSi2 += it.s_i2;
    }
  }

  // Cronbach α (IV-2) — 문항·총점 분산 모두 N 분모이므로 표본분산 비와 동일
  const sX2sample = N > 1 ? (sY2 - sY * sY / N) / (N - 1) : 0;
  const alpha = k >= 2 && sX2sample > 0
    ? k / (k - 1) * (1 - (sumSi2 * N / (N - 1)) / sX2sample) : 0;

  // 문항 제외 시 α: 제외 후 총점·문항분산 합을 O(1)로 갱신
  for (const it of items) {
    if (k < 3 || !it.scored) { it.alphaIfDeleted = 0; continue; }
    const j = it.index - 1;
    const sYx = sY - sX[j];
    const sY2x = sY2 - 2 * sXY[j] + sX2[j];
    const varX = N > 1 ? (sY2x - sYx * sYx / N) / (N - 1) : 0;
    const kk = k - 1;
    it.alphaIfDeleted = varX > 0
      ? kk / (kk - 1) * (1 - (sumSi2 - it.s_i2) * N / (N - 1) / varX) : 0;
    delete it.s_i2;
  }

  const scores = students.map(s => s.raw);
  return {
    students, items,
    upper: group(U), lower: group(L),
    stats: {
      n: N,
      mean: meanY,
      sd: s_x,
      variance: s_x2,
      max: maxScore,
      min: Math.min(...scores),
      high: Math.max(...scores),
      median: median(scores),
      skewness: moment(scores, meanY, s_x, 3),
      kurtosis: moment(scores, meanY, s_x, 4) - 3,
      meanDifficulty: items.length ? items.reduce((a, it) => a + it.difficulty, 0) / items.length : 0,
      meanDiscrimination: items.length ? items.reduce((a, it) => a + it.discrimination, 0) / items.length : 0,
      reliability: alpha,
      sem: s_x * Math.sqrt(Math.max(0, 1 - alpha))    // SEM = s_x·√(1−α)
    }
  };
}

// 적률상관 r = (NΣXY − ΣXΣY) / (√(NΣX²−(ΣX)²) · √(NΣY²−(ΣY)²))  (매뉴얼 III-2)
function pearson(sX, sX2, sXY, sY, sY2, N) {
  const num = N * sXY - sX * sY;
  const dX = N * sX2 - sX * sX;
  const dY = N * sY2 - sY * sY;
  return dX > 0 && dY > 0 ? num / (Math.sqrt(dX) * Math.sqrt(dY)) : 0;
}

function group(g) {
  return g.length
    ? { n: g.length, min: Math.min(...g.map(s => s.raw)), max: Math.max(...g.map(s => s.raw)) }
    : { n: 0, min: 0, max: 0 };
}

function median(a) {
  const s = [...a].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function moment(a, mean, sd, p) {
  if (a.length < p || sd === 0) return 0;
  return a.reduce((m, x) => m + (x - mean) ** p, 0) / a.length / sd ** p;
}

if (typeof module !== "undefined") {
  module.exports = { analyze };
}
