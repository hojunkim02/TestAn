"use strict";

// 고전적 문항분석(CTT) 계산 코어

function analyze(data) {
  const { nItems, key, weights, scored, students } = data;

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

  const n = students.length;
  const upper = students.filter(s => s.rank <= Math.max(1, Math.round(n * 0.27)));
  const lower = students.filter(s => s.rank > n - Math.max(1, Math.round(n * 0.27)));

  const items = [];
  for (let j = 0; j < nItems; j++) {
    const correct = students.filter(s => s.correct[j]).length;
    const answered = students.filter(s => s.resp[j] !== " ").length;
    const p = n > 0 ? correct / n : 0;
    const pU = upper.length ? upper.filter(s => s.correct[j]).length / upper.length : 0;
    const pL = lower.length ? lower.filter(s => s.correct[j]).length / lower.length : 0;
    const disc = pU - pL;

  let mean = 0, variance = 0;
    students.forEach(s => { mean += s.correct[j] ? weights[j] : 0; });
    mean /= n || 1;
    students.forEach(s => { const d = (s.correct[j] ? weights[j] : 0) - mean; variance += d * d; });

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
      pUpper: pU,
      pLower: pL
    });
  }

  const total = meanTotal(students);
  const sd = sdTotal(students);
  const maxScore = items.reduce((a, it) => a + (it.scored ? it.weight : 0), 0);
  const reliability = cronbachAlpha(students, items);

  return {
    students,
    items,
    stats: {
      n: students.length,
      mean: total,
      sd,
      max: maxScore,
      min: students.length ? Math.min(...students.map(s => s.raw)) : 0,
      reliability
    }
  };
}

function meanTotal(students) {
  if (!students.length) return 0;
  return students.reduce((a, s) => a + s.raw, 0) / students.length;
}

function sdTotal(students) {
  const n = students.length;
  if (n < 2) return 0;
  const m = meanTotal(students);
  const v = students.reduce((a, s) => a + (s.raw - m) * (s.raw - m), 0) / (n - 1);
  return Math.sqrt(v);
}

function cronbachAlpha(students, items) {
  const n = students.length;
  const k = items.filter(it => it.scored).length;
  if (n < 2 || k < 2) return 0;
  const itemVar = items.reduce((a, it) => {
    const m = it.correct / n;
    return a + students.reduce((b, s) => b + ((s.correct[it.index - 1] ? it.weight : 0) - m) ** 2, 0) / (n - 1);
  }, 0);
  const totalVar = sdTotal(students) ** 2;
  if (totalVar === 0) return 0;
  return (k / (k - 1)) * (1 - itemVar / totalVar);
}

if (typeof module !== "undefined") {
  module.exports = { analyze };
}
