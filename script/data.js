"use strict";
const parseCsv = (text) => {
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
const csvCell = (v) => {
  const s = String(v == null ? "" : v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
const toCsv = (rows) => {
  return rows.map(r => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
// 응답 CSV → 분석 데이터 모델
const parseDataCsv = (text) => {
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
const buildDataCsv = (data) => {
  const rows = [["id", ...Array.from({ length: data.nItems }, (_, i) => "q" + (i + 1))]];
  rows.push(["KEY", ...data.key.map(c => c === " " ? "" : c)]);
  rows.push(["OPTIONS", ...data.numOptions.map(o => o || "")]);
  rows.push(["INCLUDE", ...data.scored.map(s => s ? "y" : "n")]);
  data.students.forEach(s => rows.push([s.id, ...s.resp.map(c => c === " " ? "" : c)]));
  return toCsv(rows);
}
// 문항 수만으로 기본 골격 CSV 생성 (새 응답자료 만들기)
const buildScaffoldCsv = (nItems) => {
  const rows = [["id", ...Array.from({ length: nItems }, (_, i) => "q" + (i + 1))]];
  rows.push(["KEY", ...new Array(nItems).fill("1")]);
  rows.push(["OPTIONS", ...new Array(nItems).fill("4")]);
  rows.push(["INCLUDE", ...new Array(nItems).fill("y")]);
  return toCsv(rows);
}
const padCells = (cells, n) => {
  const out = new Array(n);
  for (let i = 0; i < n; i++) out[i] = cells[i] === undefined ? "" : String(cells[i]).trim();
  return out;
}
// ---------- 레거시 .dat 형식 입출력 (편집 화면·외부 파일용) ----------
// 내부 데이터 모델은 CSV와 동일하게 유지되며, .dat은 표현 형식으로만 사용된다.
// 형식: 첫 줄 = 문항수(1-3열) + ID 캐릿수(9-10열),
// 이후 정답키 / 답지 수 / 분석 포함(y/n) / 학생 레코드(ID + 응답, 공백=무응답)
const parseDatText = (text) => {
  const lines = text.replace(/\r\n?/g, "\n").split("\n").filter(l => l.trim().length > 0);
  if (lines.length < 4) throw new Error(".dat 형식이 올바르지 않습니다 (control line과 정답/답지수/포함 여부 줄이 필요).");
  const header = lines[0].trim().split(/\s+/).map(Number);
  if (!isFinite(header[0]) || header[0] < 1) throw new Error("첫 줄에 문항수가 있어야 합니다.");
  const nItems = header[0];
  if (nItems > 200) throw new Error("문항수는 최대 200문항까지 지원됩니다.");
  const idWidth = header.length > 1 && isFinite(header[1]) ? header[1] : null;
  const padTo = (s, len) => s.length >= len ? s.slice(0, len) : s + " ".repeat(len - s.length);
  const key = padTo(lines[1].trim(), nItems).split("");
  const numOptions = padTo(lines[2].trim(), nItems).split("").map(c => parseInt(c, 10) || 0);
  const scored = padTo(lines[3].trim(), nItems).toLowerCase().split("").map(c => c !== "n");
  const students = [];
  for (let i = 4; i < lines.length; i++) {
    const raw = lines[i];
    let id, resp;
    if (raw.length >= nItems && raw.slice(raw.length - nItems).trim() !== "") {
      resp = raw.slice(raw.length - nItems);
      id = raw.slice(0, raw.length - nItems).trim();
    } else {
      const t = raw.replace(/\s+$/, "");
      if (t.length >= nItems) {
        resp = padTo(t.slice(t.length - nItems), nItems);
        id = t.slice(0, t.length - nItems).trim();
      } else {
        resp = padTo(t, nItems);
        id = "";
      }
    }
    if (idWidth && id.length > idWidth) id = id.slice(id.length - idWidth);
    students.push({ id: id || ("S" + (students.length + 1)), resp: resp.split("") });
  }
  if (!students.length) throw new Error("학생 응답 레코드가 없습니다. 한 줄에 한 명씩(ID 뒤에 응답) 추가해 주세요.");
  return {
    nItems,
    key,
    numOptions,
    scored,
    weights: new Array(nItems).fill(1),
    students
  };
}
const buildDatText = (data) => {
  const n = data.nItems;
  let idWidth = 1;
  data.students.forEach(s => { if (s.id.length > idWidth) idWidth = s.id.length; });
  idWidth = Math.min(99, Math.max(1, idWidth));
  const pad = (s, w) => String(s).padStart(w, " ");
  const lines = [pad(n, 3) + "     " + pad(idWidth, 2)];
  lines.push(data.key.map(c => c === " " ? " " : c).join(""));
  lines.push(data.numOptions.map(o => o || " ").join(""));
  lines.push(data.scored.map(s => s ? "y" : "n").join(""));
  data.students.forEach(s => {
    lines.push(s.id + s.resp.map(c => c === " " ? " " : c).join(""));
  });
  return lines.join("\r\n") + "\r\n";
}
// 문항 수·ID 캐릿수·항목별 정보로 .dat 골격 생성 (새 응답자료 만들기)
const buildScaffoldDat = (nItems, idWidth, keys, options, flags) => {
  const pad = (s, w) => String(s).padStart(w, " ");
  const lines = [pad(nItems, 3) + "     " + pad(idWidth || 4, 2)];
  lines.push(keys.join(""));
  lines.push(options.join(""));
  lines.push(flags.join(""));
  return lines.join("\r\n") + "\r\n";
}

if (typeof module !== "undefined") {
}

if (typeof module !== "undefined") {
  module.exports = { parseDataCsv, buildDataCsv, buildScaffoldCsv, parseDatText, buildDatText, buildScaffoldDat };
}
