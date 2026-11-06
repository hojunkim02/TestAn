"use strict";

/**
 * 매뉴얼(성태제, 2000)의 고전 문항분석(CTT) 공식을 그대로 구현한다.
 * 1차 순환에서 ΣX·ΣX²·ΣXY 등 집계계를 모두 모아 O(k·n)에 전체 통계를 계산한다.
 * @param {object} data - parseDataCsv/parseDatText가 만든 데이터 모델
 * @returns {object} 학생별 점수, 문항별 통계, 상·하위 집단, 전체 통계
 */
const analyze = (data) => {
  const { nItems, key, weights, scored, students, numOptions } = data;
  const N = students.length;
  if (!N) throw new Error("분석할 학생 데이터가 없습니다.");

  // 채점 문항 수와 만점
  let k = 0;
  let maxScore = 0;
  for (let j = 0; j < nItems; j++) {
    if (scored[j]) {
      k++;
      maxScore += weights[j];
    }
  }

  // 1차 순환: 학생별 채점 + 문항/답지별 집계계 누적
  const R = new Uint32Array(nItems); // 문항별 정답자 수
  const A = new Uint32Array(nItems); // 문항별 응답자 수
  const sX = new Float64Array(nItems); // ΣX (문항 점수)
  const sX2 = new Float64Array(nItems); // ΣX²
  const opts = Array.from({ length: nItems }, () => new Map());
  let sY = 0; // ΣY (총점)
  let sY2 = 0; // ΣY²
  let minS = Infinity;
  let maxS = -Infinity;

  for (const s of students) {
    let Y = 0;
    let nCorrect = 0;
    const resp = s.resp;
    const correct = (s.correct = new Uint8Array(nItems));
    for (let j = 0; j < nItems; j++) {
      const r = resp[j];
      const hit = scored[j] && r !== " " && r === key[j];
      if (hit) {
        Y += weights[j];
        nCorrect++;
        correct[j] = 1;
      }
      if (scored[j]) {
        if (hit) R[j]++;
        if (r !== " ") A[j]++;
        const x = hit ? weights[j] : 0;
        sX[j] += x;
        sX2[j] += x * x;
      }
      const o = r === " " ? "기타" : r;
      let a = opts[j].get(o);
      if (!a) {
        a = { option: o, count: 0, sumY: 0, upper: 0, lower: 0 };
        opts[j].set(o, a);
      }
      a.count++;
    }
    s.raw = Y;
    s.max = maxScore;
    s.percent = maxScore ? (Y / maxScore) * 100 : 0;
    s.correctCount = nCorrect;
    sY += Y;
    sY2 += Y * Y;
    if (Y < minS) minS = Y;
    if (Y > maxS) maxS = Y;
  }

  // 석차: 동점자는 같은 순위 (standard competition ranking)
  const sorted = [...students].sort((a, b) => b.raw - a.raw);
  sorted.forEach((s, i) => {
    s.rank = i > 0 && s.raw === sorted[i - 1].raw ? sorted[i - 1].rank : i + 1;
  });

  // 상·하위 27% 집단의 경계 점수 (원본과 동일한 내림차순 경계점)
  const cut = Math.max(1, Math.round(N * 0.27));
  const upperCut = sorted[Math.min(cut, N) - 1].raw;
  const lowerCut = sorted[Math.max(0, N - cut)].raw;

  // 2차 순환: ΣXY, 상·하위 정답 수, 답지별 총점 합, 왜도·첨도 모멘트
  const sXY = new Float64Array(nItems); // ΣXY
  const cU = new Uint32Array(nItems); // 상위 그룹 정답 수
  const cL = new Uint32Array(nItems); // 하위 그룹 정답 수
  const meanY = sY / N;
  let nU = 0;
  let nL = 0;
  let minU = Infinity;
  let maxU = -Infinity;
  let minL = Infinity;
  let maxL = -Infinity;
  let m3 = 0; // 3차 중심모멘트 (왜도용)
  let m4 = 0; // 4차 중심모멘트 (첨도용)

  for (const s of students) {
    const d = s.raw - meanY;
    m3 += d * d * d;
    m4 += d * d * d * d;
    const u = s.raw >= upperCut;
    const l = s.raw <= lowerCut;
    if (u) {
      nU++;
      if (s.raw < minU) minU = s.raw;
      if (s.raw > maxU) maxU = s.raw;
    }
    if (l) {
      nL++;
      if (s.raw < minL) minL = s.raw;
      if (s.raw > maxL) maxL = s.raw;
    }
    for (let j = 0; j < nItems; j++) {
      const r = s.resp[j];
      const o = opts[j].get(r === " " ? "기타" : r);
      o.sumY += s.raw;
      if (u) {
        o.upper++;
        cU[j] += s.correct[j];
      }
      if (l) {
        o.lower++;
        cL[j] += s.correct[j];
      }
      if (s.correct[j]) sXY[j] += s.raw;
    }
  }

  // 총점 통계: 모집단 sd, 표본분산 (α 계산용)
  const sd = Math.sqrt(Math.max(0, sY2 / N - meanY * meanY));
  const sX2sample = N > 1 ? (sY2 - (sY * sY) / N) / (N - 1) : 0;
  const scale = N / (N - 1 || 1);

  // 문항별 통계 계산
  const items = new Array(nItems);
  let sumSi2 = 0; // 채점 문항 분산의 합 (α용)
  for (let j = 0; j < nItems; j++) {
    const P = R[j] / N; // 난이도 p = R/N
    const Q = numOptions[j] || 0;
    const it = {
      index: j + 1,
      key: key[j],
      scored: scored[j],
      correct: R[j],
      answered: A[j],
      blank: N - A[j],
      difficulty: P,
      discrimination: (nU ? cU[j] / nU : 0) - (nL ? cL[j] / nL : 0), // D = P_U - P_L
      pointBiserial: pearson(sX[j], sX2[j], sXY[j], sY, sY2, N),
      pUpper: nU ? cU[j] / nU : 0,
      pLower: nL ? cL[j] / nL : 0,
      attractiveness: Q > 1 ? (1 - P) / (Q - 1) : 0, // 오답지 매력도 P_o
      options: [...opts[j].values()]
        .map((o) => ({
          option: o.option,
          isKey: key[j] !== " " && o.option === key[j],
          propAll: o.count / N,
          propUpper: nU ? o.upper / nU : 0,
          propLower: nL ? o.lower / nL : 0,
          pbis: pearson(o.count, o.count, o.sumY, sY, sY2, N),
        }))
        .sort((a, b) => b.propAll - a.propAll),
    };
    it.options.forEach((o) => {
      o.attractive = !o.isKey && o.propAll > it.attractiveness; // "◀ 더 매력적임"
    });
    if (scored[j]) {
      it.s_i2 = (sX2[j] - (sX[j] * sX[j]) / N) / N;
      sumSi2 += it.s_i2;
    }
    items[j] = it;
  }

  // Cronbach α = k/(k-1) · (1 - Σs_i²/s_x²)
  const alpha =
    k >= 2 && sX2sample > 0
      ? (k / (k - 1)) * (1 - (sumSi2 * scale) / sX2sample)
      : 0;

  // 문항 제외 시 α: 제외 후 집계계를 O(1)로 갱신해 전체 O(k·n) 유지
  for (const it of items) {
    if (k < 3 || !it.scored) {
      it.alphaIfDeleted = 0;
      continue;
    }
    const j = it.index - 1;
    const sYx = sY - sX[j];
    const sY2x = sY2 - 2 * sXY[j] + sX2[j];
    const varX = N > 1 ? (sY2x - (sYx * sYx) / N) / (N - 1) : 0;
    const kk = k - 1;
    it.alphaIfDeleted =
      varX > 0
        ? (kk / (kk - 1)) * (1 - ((sumSi2 - it.s_i2) * scale) / varX)
        : 0;
    delete it.s_i2;
  }

  // 중앙값, 왜도, 첨도
  const median =
    N % 2
      ? sorted[N >> 1].raw
      : (sorted[(N >> 1) - 1].raw + sorted[N >> 1].raw) / 2;
  const sdSafe = sd || 1;
  const skewness = m3 / N / sdSafe ** 3;
  const kurtosis = m4 / N / sdSafe ** 4 - 3;

  return {
    students,
    items,
    upper: { n: nU, min: nU ? minU : 0, max: nU ? maxU : 0 },
    lower: { n: nL, min: nL ? minL : 0, max: nL ? maxL : 0 },
    stats: {
      n: N,
      mean: meanY,
      sd,
      variance: sd * sd,
      max: maxScore,
      min: minS,
      high: maxS,
      median,
      skewness: sd ? skewness : 0,
      kurtosis: sd ? kurtosis : 0,
      meanDifficulty: nItems
        ? items.reduce((a, it) => a + it.difficulty, 0) / nItems
        : 0,
      meanDiscrimination: nItems
        ? items.reduce((a, it) => a + it.discrimination, 0) / nItems
        : 0,
      reliability: alpha,
      sem: sd * Math.sqrt(Math.max(0, 1 - alpha)), // 측정오차 SEM = s_x·√(1-α)
    },
  };
};

/** 집계계(ΣX, ΣX², ΣXY, ΣY, ΣY²)로부터 피어슨 상관계수를 계산한다. */
const pearson = (sX, sX2, sXY, sY, sY2, N) => {
  const dX = N * sX2 - sX * sX;
  const dY = N * sY2 - sY * sY;
  return dX > 0 && dY > 0
    ? (N * sXY - sX * sY) / (Math.sqrt(dX) * Math.sqrt(dY))
    : 0;
};

if (typeof module !== "undefined") {
  module.exports = { analyze };
}
