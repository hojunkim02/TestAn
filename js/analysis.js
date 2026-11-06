"use strict";

// 고전적 문항분석(CTT) 계산 코어
// 원본 TestAn 1.0 매뉴얼의 분석 결과(.out/.scr/.grp/.srt)에 맞춘 지표 구현

function analyze(data) {
  const { nItems, key, weights, scored, students } = data;
  const n = students.length;
  const scoredIdx = [];
  for (let j = 0; j < nItems; j++) if (scored[j]) scoredIdx.push(j);
  const k = scoredIdx.length;

  students.forEach(s => {
    let raw = 0, max = 0, correctCount = 0;
    s.correct = new Array(nItems);
    for (let j = 0; j < nItems; j++) {
      const resp = s.resp[j];
      const ok = scored[j] && resp !== " " && resp === key[j];
      s.correct[j] = ok;
      if (scored[j]) {
        max += weights[j];
        if (ok) { raw += weights[j]; correctCount++; }
      }
    }
    s.raw = raw;
    s.max = max;
    s.percent = max > 0 ? (raw / max) * 100 : 0;
    s.correctCount = correctCount;
  });

  const sorted = [...students].sort((a, b) => b.raw - a.raw);
  sorted.forEach((s, i) => {
    if (i > 0 && s.raw === sorted[i - 1].raw) s.rank = sorted[i - 1].rank;
    else s.rank = i + 1;
  });

  const totalMean = mean(students.map(s => s.raw));
  const totalSd = sdPop(students.map(s => s.raw));

  // 상·하위 27% 집단: 경계 점수의 동점자까지 포함 (원본 TestAn 1.0 방식)
  const descScores = [...students].sort((a, b) => b.raw - a.raw).map(s => s.raw);
  const cut = Math.max(1, Math.round(n * 0.27));
  const upperCut = descScores[Math.min(cut, n) - 1];
  const lowerCut = descScores[Math.max(0, n - cut)];
  const upper = students.filter(s => s.raw >= upperCut);
  const lower = students.filter(s => s.raw <= lowerCut);

  const items = [];
  for (let j = 0; j < nItems; j++) {
    const correct = students.filter(s => s.correct[j]).length;
    const answered = students.filter(s => s.resp[j] !== " ").length;
    const p = n > 0 ? correct / n : 0;
    const pU = upper.length ? upper.filter(s => s.correct[j]).length / upper.length : 0;
    const pL = lower.length ? lower.filter(s => s.correct[j]).length / lower.length : 0;
    const disc = pU - pL;
    const pbis = pointBiserial(students, s => s.correct[j], totalMean, totalSd);

    // 답지별 분석 (원본 .out의 답지 분석 블록)
    const optionMap = new Map();
    for (const s of students) {
      const opt = s.resp[j] === " " ? "기타" : s.resp[j];
      if (!optionMap.has(opt)) optionMap.set(opt, { option: opt, count: 0, upper: 0, lower: 0 });
      const o = optionMap.get(opt);
      o.count++;
      if (upper.includes(s)) o.upper++;
      if (lower.includes(s)) o.lower++;
    }
    const options = [...optionMap.values()].map(o => ({
      option: o.option,
      isKey: key[j] !== " " && o.option === key[j],
      propAll: n ? o.count / n : 0,
      propUpper: upper.length ? o.upper / upper.length : 0,
      propLower: lower.length ? o.lower / lower.length : 0,
      pbis: optionPbis(students, o.option, j, totalMean, totalSd)
    })).sort((a, b) => b.propAll - a.propAll);

    items.push({
      index: j + 1,
      key: key[j],
      weight: weights[j],
      scored: scored[j],
      correct,
      answered,
      blank: n - answered,
      difficulty: p,
      discrimination: disc,
      pointBiserial: pbis,
      pUpper: pU,
      pLower: pL,
      options
    });
  }

  // 문항 제외 시 신뢰도 (원본: 해당문항을 제외한 검사의 신뢰도)
  const alphaIfDeleted = j => {
    if (k < 3) return 0;
    const kk = k - 1;
    const totals = students.map(s => s.raw - (s.correct[j] ? weights[j] : 0));
    const varTotal = sdSample(totals) ** 2;
    if (varTotal === 0) return 0;
    let itemVarSum = 0;
    for (let jj = 0; jj < nItems; jj++) {
      if (jj === j || !scored[jj]) continue;
      const m = students.filter(s => s.correct[jj]).length / n * weights[jj];
      itemVarSum += students.reduce((b, s) => b + ((s.correct[jj] ? weights[jj] : 0) - m) ** 2, 0) / (n - 1);
    }
    return (kk / (kk - 1)) * (1 - itemVarSum / varTotal);
  };
  items.forEach(it => {
    it.alphaIfDeleted = alphaIfDeleted(it.index - 1);
  });

  const scores = students.map(s => s.raw);
  const maxScore = items.reduce((a, it) => a + (it.scored ? it.weight : 0), 0);
  const reliability = cronbachAlpha(students, items);

  return {
    students,
    items,
    upper: { n: upper.length, min: upper.length ? Math.min(...upper.map(s => s.raw)) : 0, max: upper.length ? Math.max(...upper.map(s => s.raw)) : 0 },
    lower: { n: lower.length, min: lower.length ? Math.min(...lower.map(s => s.raw)) : 0, max: lower.length ? Math.max(...lower.map(s => s.raw)) : 0 },
    stats: {
      n,
      mean: totalMean,
      sd: totalSd,
      variance: n > 1 ? totalSd * totalSd : 0,
      max: maxScore,
      min: scores.length ? Math.min(...scores) : 0,
      high: scores.length ? Math.max(...scores) : 0,
      median: median(scores),
      skewness: skewness(scores),
      kurtosis: kurtosis(scores),
      sdPop: totalSd,
      meanDifficulty: items.length ? items.reduce((a, it) => a + it.difficulty, 0) / items.length : 0,
      meanDiscrimination: items.length ? items.reduce((a, it) => a + it.discrimination, 0) / items.length : 0,
      reliability,
      sem: totalSd * Math.sqrt(Math.max(0, 1 - reliability))
    }
  };
}

function mean(a) { return a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0; }

function sdSample(a) {
  if (a.length < 2) return 0;
  const m = mean(a);
  return Math.sqrt(a.reduce((s, x) => s + (x - m) * (x - m), 0) / (a.length - 1));
}

function sdPop(a) {
  if (a.length < 1) return 0;
  const m = mean(a);
  return Math.sqrt(a.reduce((s, x) => s + (x - m) * (x - m), 0) / a.length);
}

function median(a) {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function skewness(a) {
  if (a.length < 3) return 0;
  const m = mean(a);
  const sd = sdPop(a);
  if (sd === 0) return 0;
  const m3 = a.reduce((s, x) => s + (x - m) ** 3, 0) / a.length;
  return m3 / (sd ** 3);
}

function kurtosis(a) {
  if (a.length < 4) return 0;
  const m = mean(a);
  const sd = sdPop(a);
  if (sd === 0) return 0;
  const m4 = a.reduce((s, x) => s + (x - m) ** 4, 0) / a.length;
  return m4 / (sd ** 4) - 3;
}

// 점수 이분 상관계수 (문항점수-총점 상관, 원본 .out의 문항상관계수)
function pointBiserial(students, isCorrect, totalMean, totalSd) {
  const n = students.length;
  if (n < 2 || totalSd === 0) return 0;
  const correct = students.filter(s => isCorrect(s));
  const p = correct.length / n;
  if (p === 0 || p === 1) return 0;
  const m1 = correct.length ? mean(correct.map(s => s.raw)) : 0;
  const m0 = mean(students.filter(s => !isCorrect(s)).map(s => s.raw));
  return (m1 - m0) / totalSd * Math.sqrt(p * (1 - p));
}

function optionPbis(students, option, j, totalMean, totalSd) {
  return pointBiserial(students, s => s.resp[j] === option, totalMean, totalSd);
}

function cronbachAlpha(students, items) {
  const n = students.length;
  const k = items.filter(it => it.scored).length;
  if (n < 2 || k < 2) return 0;
  const itemVar = items.reduce((a, it) => {
    if (!it.scored) return a;
    const m = it.correct / n;
    return a + students.reduce((b, s) => b + ((s.correct[it.index - 1] ? it.weight : 0) - m) ** 2, 0) / (n - 1);
  }, 0);
  const totalVar = sdSample(students.map(s => s.raw)) ** 2;
  if (totalVar === 0) return 0;
  return (k / (k - 1)) * (1 - itemVar / totalVar);
}

if (typeof module !== "undefined") {
  module.exports = { analyze };
}
