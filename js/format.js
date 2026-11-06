"use strict";

// 현대 데이터 포맷 처리: CSV / JSON (Excel은 sheet_to_csv 결과를 CSV 경로로 처리)
//
// 응답 CSV 형식:
//   id,q1,q2,...,qN
//   KEY,4,3,...        (선택: 정답 행)
//   OPTIONS,4,4,...    (선택: 답지 수 행)
//   INCLUDE,y,y,...    (선택: 분석 포함 여부 행)
//   0001,2,3,...       (학생 행, 빈 칸 = 무응답)
//
// JSON 형식:
//   { "items": [{"no":1,"key":"4","options":4,"include":true}],
//     "students": [{"id":"0001","responses":["2","3",...]}] }

function parseCsv(text) {
  const rows = [];
  let row = [], cell = "", inQ = false;
  const s = text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQ) {
      if (c === '"') {
        if (s[i + 1] === '"') { cell += '"'; i++; }
        else inQ = false;
      } else cell += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += c;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.length > 1 || (r.length === 1 && r[0].trim() !== ""));
}

function csvCell(v) {
  const s = String(v == null ? "" : v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function toCsv(rows) {
  return rows.map(r => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

// 응답 CSV → 분석 데이터 모델
function parseResponsesCsv(text) {
  const rows = parseCsv(text);
  if (rows.length < 2) throw new Error("CSV에 헤더와 데이터 행이 부족합니다.");
  const header = rows[0].map(h => h.trim());
  if (header[0].toLowerCase() !== "id") {
    throw new Error("첫 열은 'id'여야 합니다. (헤더: id,q1,q2,...)");
  }
  const nItems = header.length - 1;

  let key = null, numOptions = null, scored = null;
  const students = [];
  for (const r of rows.slice(1)) {
    const tag = (r[0] || "").trim().toUpperCase();
    const cells = r.slice(1);
    if (tag === "KEY") { key = padCells(cells, nItems); continue; }
    if (tag === "OPTIONS") { numOptions = padCells(cells, nItems); continue; }
    if (tag === "INCLUDE") { scored = padCells(cells, nItems); continue; }
    students.push({
      id: (r[0] || "").trim() || ("S" + (students.length + 1)),
      resp: padCells(cells, nItems)
    });
  }
  if (!students.length) throw new Error("학생 응답 행이 없습니다.");
  return buildData({ nItems, key, numOptions, scored, students });
}

// 정답 CSV (no,key,options,include) → 항목 메타데이터
function parseKeyCsv(text) {
  const rows = parseCsv(text);
  if (rows.length < 2) throw new Error("정답 CSV에 데이터가 부족합니다.");
  const header = rows[0].map(h => h.trim().toLowerCase());
  const col = name => header.indexOf(name);
  const ci = { no: col("no"), key: col("key"), options: col("options"), include: col("include") };
  if (ci.key < 0) throw new Error("정답 CSV에는 key 열이 필요합니다.");
  const items = rows.slice(1).map(r => ({
    key: (r[ci.key] || "").trim(),
    options: ci.options >= 0 ? parseInt(r[ci.options], 10) || 0 : 0,
    include: ci.include >= 0 ? (r[ci.include] || "").trim().toLowerCase() !== "n" : true
  }));
  return items;
}

// JSON → 분석 데이터 모델
function parseJson(text) {
  const raw = JSON.parse(text);
  const items = raw.items || raw.meta || [];
  const studentsRaw = raw.students || raw.responses || [];
  if (!studentsRaw.length) throw new Error("JSON에 students 배열이 없습니다.");
  const nItems = items.length || (studentsRaw[0].responses || "").length;
  const key = items.length ? items.map(it => normCell(it.key)) : null;
  const numOptions = items.length ? items.map(it => String(it.options || 0)) : null;
  const scored = items.length ? items.map(it => it.include === false ? "n" : "y") : null;
  const students = studentsRaw.map((s, i) => {
    let resp = s.responses;
    if (!Array.isArray(resp)) resp = String(resp == null ? "" : resp).split("");
    return {
      id: String(s.id != null ? s.id : "").trim() || ("S" + (i + 1)),
      resp: padCells(resp.map(c => normCell(c)), nItems)
    };
  });
  return buildData({ nItems, key, numOptions, scored, students });
}

function buildData({ nItems, key, numOptions, scored, students }) {
  const keyArr = key || new Array(nItems).fill(" ");
  const optArr = numOptions || new Array(nItems).fill("0");
  const scoredArr = scored || new Array(nItems).fill("y");
  if (keyArr.length < nItems) throw new Error("정답(KEY) 행이 문항 수보다 짧습니다.");
  return {
    nItems,
    key: keyArr,
    numOptions: optArr.map(c => c === "" ? 0 : (parseInt(c, 10) || 0)),
    scored: scoredArr.map(c => String(c).trim().toLowerCase() !== "n"),
    weights: new Array(nItems).fill(1),
    students: students.map(s => ({ id: s.id, resp: s.resp.map(c => c === "" ? " " : String(c)) }))
  };
}

function padCells(cells, n) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(cells[i] === undefined ? "" : String(cells[i]).trim());
  return out;
}

function normCell(v) {
  if (v == null) return "";
  return String(v).trim();
}

// 외부 정답 데이터(JSON 또는 정답 CSV) 적용
function applyKeyData(data, keyText) {
  const trimmed = keyText.trim();
  let items;
  if (trimmed.startsWith("{")) {
    const raw = JSON.parse(trimmed);
    items = (raw.items || []).map(it => ({
      key: normCell(it.key), options: it.options || 0, include: it.include !== false
    }));
  } else {
    items = parseKeyCsv(keyText);
  }
  if (items.length !== data.nItems) {
    throw new Error(`정답 데이터의 문항 수(${items.length})가 응답 데이터(${data.nItems})와 일치하지 않습니다.`);
  }
  data.key = items.map(it => it.key);
  data.numOptions = items.map(it => it.options || 0);
  data.scored = items.map(it => it.include);
}

// 직렬화: 편집용 JSON
function buildDataJson(data) {
  return JSON.stringify({
    items: Array.from({ length: data.nItems }, (_, j) => ({
      no: j + 1,
      key: data.key[j] === " " ? "" : data.key[j],
      options: data.numOptions[j] || 0,
      include: data.scored[j]
    })),
    students: data.students.map(s => ({
      id: s.id,
      responses: s.resp.map(c => c === " " ? "" : c)
    }))
  }, null, 2);
}

// 직렬화: 점수 CSV (순위,ID,점수,백분율,정답문항수)
function buildScoresCsv(result) {
  const rows = [["rank", "id", "score", "percent", "correctCount"]];
  [...result.students].sort((a, b) => a.rank - b.rank).forEach(s => {
    rows.push([s.rank, s.id, s.raw, s.percent.toFixed(1), s.correctCount]);
  });
  return toCsv(rows);
}

// 직렬화: 문항 분석 CSV
function buildItemsCsv(result) {
  const rows = [["item", "key", "correct", "blank", "difficulty",
    "pointBiserial", "pUpper", "pLower", "discrimination", "alphaIfDeleted"]];
  result.items.forEach(it => {
    rows.push([it.index, it.key === " " ? "" : it.key, it.correct, it.blank,
      it.difficulty.toFixed(3), it.pointBiserial.toFixed(3),
      it.pUpper.toFixed(3), it.pLower.toFixed(3),
      it.discrimination.toFixed(3), it.alphaIfDeleted.toFixed(3)]);
  });
  return toCsv(rows);
}

// 직렬화: 전체 리포트 JSON
function buildReportJson(data, result) {
  const st = result.stats;
  return JSON.stringify({
    meta: {
      program: "TestAn Web",
      generatedAt: new Date().toISOString(),
      nItems: data.nItems,
      nStudents: st.n
    },
    testStatistics: {
      mean: round(st.mean), sd: round(st.sd), variance: round(st.variance),
      min: st.min, max: st.high, median: st.median,
      skewness: round(st.skewness), kurtosis: round(st.kurtosis),
      meanDifficulty: round(st.meanDifficulty), meanDiscrimination: round(st.meanDiscrimination),
      cronbachAlpha: round(st.reliability), sem: round(st.sem)
    },
    groups: {
      upper27: { n: result.upper.n, min: result.upper.min, max: result.upper.max },
      lower27: { n: result.lower.n, min: result.lower.min, max: result.lower.max }
    },
    items: result.items.map(it => ({
      no: it.index, key: it.key === " " ? "" : it.key,
      correct: it.correct, blank: it.blank,
      difficulty: round(it.difficulty), pointBiserial: round(it.pointBiserial),
      discrimination: round(it.discrimination),
      alphaIfDeleted: round(it.alphaIfDeleted),
      options: it.options.map(o => ({
        option: o.option, isKey: o.isKey,
        propAll: round(o.propAll), propUpper: round(o.propUpper),
        propLower: round(o.propLower), pbis: round(o.pbis)
      }))
    })),
    students: [...result.students].sort((a, b) => a.rank - b.rank).map(s => ({
      rank: s.rank, id: s.id, score: s.raw,
      percent: round(s.percent), correctCount: s.correctCount
    }))
  }, null, 2);
}

function round(x) { return Math.round(x * 1000) / 1000; }

if (typeof module !== "undefined") {
  module.exports = {
    parseCsv, toCsv, parseResponsesCsv, parseKeyCsv, parseJson,
    applyKeyData, buildDataJson, buildScoresCsv, buildItemsCsv, buildReportJson
  };
}
