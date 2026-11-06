"use strict";

// 현대 데이터 포맷 처리: CSV / JSON
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

// JSON → 분석 데이터 모델
function parseJson(text) {
  const raw = JSON.parse(text);
  const items = raw.items || [];
  const studentsRaw = raw.students || [];
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
  const out = new Array(n);
  for (let i = 0; i < n; i++) out[i] = cells[i] === undefined ? "" : String(cells[i]).trim();
  return out;
}

function normCell(v) {
  if (v == null) return "";
  return String(v).trim();
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

if (typeof module !== "undefined") {
  module.exports = { parseResponsesCsv, parseJson, buildDataJson };
}
