"use strict";

// 고전적 문항분석(CTT) 계산 코어 — 원본 TestAn 1.0 매뉴얼의 분석 결과와 동일한 지표
// 최적화: 모든 문항 통계를 학생 1회 순회로 집계 O(k·n),
// 문항 제외 시 α는 사전 집계합으로 O(1) 산출 (기존 O(k²·n) → O(k·n))

function analyze(data) {
  const { nItems, key, weights, scored, students } = data;
  const n = students.length;
  if (!n) throw new Error("분석할 학생 데이터가 없습니다.");
  let k = 0;
  for (let j = 0; j < nItems; j++) if (scored[j]) k++;

  // --- 1회 순회: 채점, 총점, 문항별 집계 ---
  // per item j: nc(정답자), na(응답자), sumX/sumX2/sumXT (제외α·상관용),
  // 답지별: count/sumT/inUpper/inLower
  const nc = new Array(nItems).fill(0);
  const na = new Array(nItems).fill(0);
  const sumX = new Float64Array(nItems);
  const sumX2 = new Float64Array(nItems);
  const sumXT = new Float64Array(nItems);
  const optAgg = new Array(nItems);
  for (let j = 0; j < nItems; j++) optAgg[j] = new Map();

  let sumT = 0, sumT2 = 0;
  let maxScore = 0;
  for (let j = 0; j < nItems; j++) if (scored[j]) maxScore += weights[j];

  for (const s of students) {
    let raw = 0, correctCount = 0;
    s.correct = new Array(nItems);
    for (let j = 0; j < nItems; j++) {
      const resp = s.resp[j];
      const ok = scored[j] && resp !== " " && resp === key[j];
      s.correct[j] = ok;
      if (scored[j]) {
        if (ok) { raw += weights[j]; correctCount++; }
        const x = ok ? weights[j] : 0;
        nc[j] += ok ? 1 : 0;
        na[j] += resp !== " " ? 1 : 0;
        sumX[j] += x;
        sumX2[j] += x * x;
      }
      const opt = resp === " " ? "기타" : resp;
      let a = optAgg[j].get(opt);
      if (!a) { a = { option: opt, count: 0, sumT: 0, upper: 0, lower: 0 }; optAgg[j].set(opt, a); }
      a.count++;
    }
    s.raw = raw;
    s.max = maxScore;
    s.percent = maxScore > 0 ? (raw / maxScore) * 100 : 0;
    s.correctCount = correctCount;
    sumT += raw;
    sumT2 += raw * raw;
    for (let j = 0; j < nItems; j++) {
      const resp = s.resp[j];
      optAgg[j].get(resp === " " ? "기타" : resp).sumT += raw;
    }
  }

  // 순위 (동점 처리)
  const sorted = [...students].sort((a, b) => b.raw - a.raw);
  sorted.forEach((s, i) => {
    if (i > 0 && s.raw === sorted[i - 1].raw) s.rank = sorted[i - 1].rank;
    else s.rank = i + 1;
  });

  // 상·하위 27%: 경계 점수의 동점자까지 포함 (원본 방식)
  const cut = Math.max(1, Math.round(n * 0.27));
  const upperCut = sorted[Math.min(cut, n) - 1].raw;
  const lowerCut = sorted[Math.max(0, n - cut)].raw;
  const upper = students.filter(s => s.raw >= upperCut);
  const lower = students.filter(s => s.raw <= lowerCut);
  const nU = upper.length, nL = lower.length;
  // 집단 소속 플래그 + 답지별 집단 집계는 아래 문항 루프에서 한 번에
  const inU = new Map(), inL = new Map();
  for (const s of upper) inU.set(s, true);
  for (const s of lower) inL.set(s, true);

  // 총점 통계 (모집단 표준편차 — 원본과 동일)
  const totalMean = sumT / n;
  const totalSd = Math.sqrt(Math.max(0, sumT2 / n - totalMean * totalMean));
  const totalSampleVar = n > 1 ? (sumT2 - sumT * sumT / n) / (n - 1) : 0;

  // 문항별 통계 (학생 순회 1회로 답지 집단 집계까지)
  const items = new Array(nItems);
  let sumVarSample = 0;
  for (let j = 0; j < nItems; j++) {
    for (const s of students) {
      const resp = s.resp[j];
      const a = optAgg[j].get(resp === " " ? "기타" : resp);
      if (inU.has(s)) a.upper++;
      if (inL.has(s)) a.lower++;
      if (s.correct[j]) sumXT[j] += s.raw;
    }
    const p = nc[j] / n;
    const pU = nU ? upper.filter(s => s.correct[j]).length / nU : 0;
    const pL = nL ? lower.filter(s => s.correct[j]).length / nL : 0;
    const pbis = pointBiserialFrom(nc[j], sumXT[j], sumT, n, totalSd);

    const options = [...optAgg[j].values()].map(a => ({
      option: a.option,
      isKey: key[j] !== " " && a.option === key[j],
      propAll: a.count / n,
      propUpper: nU ? a.upper / nU : 0,
      propLower: nL ? a.lower / nL : 0,
      pbis: pointBiserialFrom(a.count, a.sumT, sumT, n, totalSd)
    })).sort((a, b) => b.propAll - a.propAll);

    items[j] = {
      index: j + 1,
      key: key[j],
      weight: weights[j],
      scored: scored[j],
      correct: nc[j],
      answered: na[j],
      blank: n - na[j],
      difficulty: p,
      discrimination: pU - pL,
      pointBiserial: pbis,
      pUpper: pU,
      pLower: pL,
      options,
      _varSample: (sumX2[j] - sumX[j] * sumX[j] / n) / (n > 1 ? n - 1 : 1),
      _sumX: sumX[j], _sumX2: sumX2[j], _sumXT: sumXT[j]
    };
    if (scored[j]) sumVarSample += items[j]._varSample;
  }

  const reliability = (k >= 2 && totalSampleVar > 0)
    ? (k / (k - 1)) * (1 - sumVarSample / totalSampleVar) : 0;

  // 문항 제외 시 α: 합집계에서 O(1) 계산
  // 총점-문항점수 제외합: ΣT'² = ΣT² - 2·ΣXT_j + ΣX2_j, ΣT' = ΣT - ΣX_j
  for (const it of items) {
    if (k < 3 || !it.scored) { it.alphaIfDeleted = 0; continue; }
    const sT = sumT - it._sumX;
    const sT2 = sumT2 - 2 * it._sumXT + it._sumX2;
    const varTotal = n > 1 ? (sT2 - sT * sT / n) / (n - 1) : 0;
    if (varTotal <= 0) { it.alphaIfDeleted = 0; continue; }
    const kk = k - 1;
    it.alphaIfDeleted = (kk / (kk - 1)) * (1 - (sumVarSample - it._varSample) / varTotal);
  }
  items.forEach(it => {
    delete it._varSample; delete it._sumX; delete it._sumX2; delete it._sumXT;
  });

  // 점수 분포 통계
  const scores = students.map(s => s.raw);
  const st = {
    n,
    mean: totalMean,
    sd: totalSd,
    variance: totalSd * totalSd,
    max: maxScore,
    min: Math.min(...scores),
    high: Math.max(...scores),
    median: median(scores),
    skewness: centralMoment(scores, totalMean, totalSd, 3),
    kurtosis: centralMoment(scores, totalMean, totalSd, 4) - 3,
    meanDifficulty: items.length ? items.reduce((a, it) => a + it.difficulty, 0) / items.length : 0,
    meanDiscrimination: items.length ? items.reduce((a, it) => a + it.discrimination, 0) / items.length : 0,
    reliability,
    sem: totalSd * Math.sqrt(Math.max(0, 1 - reliability))
  };

  return {
    students,
    items,
    upper: { n: nU, min: nU ? Math.min(...upper.map(s => s.raw)) : 0, max: nU ? Math.max(...upper.map(s => s.raw)) : 0 },
    lower: { n: nL, min: nL ? Math.min(...lower.map(s => s.raw)) : 0, max: nL ? Math.max(...lower.map(s => s.raw)) : 0 },
    stats: st
  };
}

// 점수이분상관: (M1 - M0)/SD * sqrt(p(1-p)) — 집계합으로 계산
function pointBiserialFrom(count, sumSel, sumTotal, n, sd) {
  if (n < 2 || sd === 0 || count === 0 || count === n) return 0;
  const p = count / n;
  const m1 = sumSel / count;
  const m0 = (sumTotal - sumSel) / (n - count);
  return (m1 - m0) / sd * Math.sqrt(p * (1 - p));
}

function median(a) {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function centralMoment(a, mean, sd, power) {
  if (a.length < power || sd === 0) return 0;
  let m = 0;
  for (const x of a) m += (x - mean) ** power;
  return m / a.length / sd ** power;
}

if (typeof module !== "undefined") {
  module.exports = { analyze };
}
