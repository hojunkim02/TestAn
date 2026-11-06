"use strict";

// 데이터 모델 처리: CSV 단일 포맷
//
// id,q1,q2,...,qN          ← 헤더 (q 열 수 = 문항 수)
// KEY,4,3,...              ← 정답 행
// OPTIONS,4,4,...           ← 답지 수 행
// INCLUDE,y,y,...           ← 분석 포함 여부 행
// 0001,2,3,...              ← 학생 행 (빈 칸 = 무응답)

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
function parseDataCsv(text) {
  const rows = parseCsv(text);
  if (rows.length < 2) throw new Error("데이터 행이 없습니다. 헤더 아래에 KEY/OPTIONS/INCLUDE와 학생 행이 필요합니다.");
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
  if (!students.length) throw new Error("학생 응답 행이 없습니다. 한 줄에 한 명씩 추가해 주세요.");
  const keyArr = key || new Array(nItems).fill(" ");
  if (keyArr.length < nItems) throw new Error("정답(KEY) 행이 문항 수보다 짧습니다.");
  return {
    nItems,
    key: keyArr,
    numOptions: (numOptions || new Array(nItems).fill("0"))
      .map(c => c === "" ? 0 : (parseInt(c, 10) || 0)),
    scored: (scored || new Array(nItems).fill("y"))
      .map(c => String(c).trim().toLowerCase() !== "n"),
    weights: new Array(nItems).fill(1),
    students: students.map(s => ({
      id: s.id,
      resp: s.resp.map(c => c === "" ? " " : String(c))
    }))
  };
}

// 분석 데이터 모델 → 응답 CSV
function buildDataCsv(data) {
  const rows = [["id", ...Array.from({ length: data.nItems }, (_, i) => "q" + (i + 1))]];
  rows.push(["KEY", ...data.key.map(c => c === " " ? "" : c)]);
  rows.push(["OPTIONS", ...data.numOptions.map(o => o || "")]);
  rows.push(["INCLUDE", ...data.scored.map(s => s ? "y" : "n")]);
  data.students.forEach(s => rows.push([s.id, ...s.resp.map(c => c === " " ? "" : c)]));
  return toCsv(rows);
}

// 문항 수만으로 기본 골격 CSV 생성 (새 응답자료 만들기)
function buildScaffoldCsv(nItems) {
  const rows = [["id", ...Array.from({ length: nItems }, (_, i) => "q" + (i + 1))]];
  rows.push(["KEY", ...new Array(nItems).fill("1")]);
  rows.push(["OPTIONS", ...new Array(nItems).fill("4")]);
  rows.push(["INCLUDE", ...new Array(nItems).fill("y")]);
  return toCsv(rows);
}

function padCells(cells, n) {
  const out = new Array(n);
  for (let i = 0; i < n; i++) out[i] = cells[i] === undefined ? "" : String(cells[i]).trim();
  return out;
}

if (typeof module !== "undefined") {
  module.exports = { parseDataCsv, buildDataCsv, buildScaffoldCsv };
}
