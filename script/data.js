"use strict";

/** RFC 4180 형식의 CSV 텍스트를 2차원 문자열 배열로 파싱한다. 따옴표와 줄바꿈 이스케이프를 지원한다. */
const parseCsv = (text) => {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;
  const s = text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += c;
    }
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter(
    (r) => r.length > 1 || (r.length === 1 && r[0].trim() !== ""),
  );
};

/** CSV 셀 하나를 직렬화한다. 쉼표·따옴표·줄바꿈이 포함되면 따옴표로 감싼다. */
const csvCell = (v) => {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};

/** 2차원 배열을 CRLF 줄바꿈 CSV 텍스트로 직렬화한다. */
const toCsv = (rows) =>
  rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";

/** 셀 배열을 문항 수 n에 맞게 trim·채우기(padding)하여 정규화한다. */
const padCells = (cells, n) =>
  Array.from({ length: n }, (_, i) =>
    cells[i] === undefined ? "" : String(cells[i]).trim(),
  );

/** 응답 CSV(id,q1,q2,... + KEY/OPTIONS/INCLUDE 행)를 분석 데이터 모델로 파싱한다. */
const parseDataCsv = (text) => {
  const rows = parseCsv(text);
  if (rows.length < 2) {
    throw new Error(
      "데이터 행이 없습니다. 헤더 아래에 KEY/OPTIONS/INCLUDE와 학생 행이 필요합니다.",
    );
  }
  const header = rows[0].map((h) => h.trim());
  if (header[0].toLowerCase() !== "id") {
    throw new Error("첫 열은 'id'여야 합니다. (헤더: id,q1,q2,...)");
  }
  const nItems = header.length - 1;
  let key = null;
  let numOptions = null;
  let scored = null;
  const students = [];

  for (const r of rows.slice(1)) {
    const tag = (r[0] || "").trim().toUpperCase();
    const cells = r.slice(1);
    if (tag === "KEY") {
      key = padCells(cells, nItems);
      continue;
    }
    if (tag === "OPTIONS") {
      numOptions = padCells(cells, nItems);
      continue;
    }
    if (tag === "INCLUDE") {
      scored = padCells(cells, nItems);
      continue;
    }
    students.push({
      id: (r[0] || "").trim() || "S" + (students.length + 1),
      resp: padCells(cells, nItems),
    });
  }
  if (!students.length) {
    throw new Error("학생 응답 행이 없습니다. 한 줄에 한 명씩 추가해 주세요.");
  }
  const keyArr = key ?? new Array(nItems).fill(" ");
  if (keyArr.length < nItems) {
    throw new Error("정답(KEY) 행이 문항 수보다 짧습니다.");
  }
  return {
    nItems,
    key: keyArr,
    numOptions: (numOptions ?? new Array(nItems).fill("0")).map((c) =>
      c === "" ? 0 : Number.parseInt(c, 10) || 0,
    ),
    scored: (scored ?? new Array(nItems).fill("y")).map(
      (c) => String(c).trim().toLowerCase() !== "n",
    ),
    weights: new Array(nItems).fill(1),
    students: students.map((s) => ({
      id: s.id,
      resp: s.resp.map((c) => (c === "" ? " " : String(c))),
    })),
  };
};

/** 분석 데이터 모델을 응답 CSV 텍스트로 직렬화한다. */
const buildDataCsv = (data) => {
  const rows = [
    ["id", ...Array.from({ length: data.nItems }, (_, i) => "q" + (i + 1))],
    ["KEY", ...data.key.map((c) => (c === " " ? "" : c))],
    ["OPTIONS", ...data.numOptions.map((o) => o || "")],
    ["INCLUDE", ...data.scored.map((s) => (s ? "y" : "n"))],
  ];
  data.students.forEach((s) =>
    rows.push([s.id, ...s.resp.map((c) => (c === " " ? "" : c))]),
  );
  return toCsv(rows);
};

// ---------- 레거시 .dat 형식 입출력 (편집 화면·외부 파일용) ----------
// 내부 데이터 모델은 CSV와 동일하게 유지되며, .dat은 표현 형식으로만 사용된다.
// 형식: 첫 줄 = 문항수(1-3열) + ID 캐릿수(9-10열),
// 이후 정답키 / 답지 수 / 분석 포함(y/n) / 학생 레코드(ID + 응답, 공백=무응답)

/** 문자열을 len 길이로 자르거나 오른쪽 공백으로 채운다. */
const padTo = (s, len) => s.slice(0, len).padEnd(len, " ");

/** 레거시 .dat 텍스트를 분석 데이터 모델로 파싱한다. */
const parseDatText = (text) => {
  const lines = text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .filter((l) => l.trim().length > 0);
  if (lines.length < 4) {
    throw new Error(
      ".dat 형식이 올바르지 않습니다 (control line과 정답/답지수/포함 여부 줄이 필요).",
    );
  }
  const header = lines[0].trim().split(/\s+/).map(Number);
  if (!Number.isFinite(header[0]) || header[0] < 1) {
    throw new Error("첫 줄에 문항수가 있어야 합니다.");
  }
  const nItems = header[0];
  if (nItems > 200) {
    throw new Error("문항수는 최대 200문항까지 지원됩니다.");
  }
  const idWidth =
    header.length > 1 && Number.isFinite(header[1]) ? header[1] : null;
  const key = padTo(lines[1].trim(), nItems).split("");
  const numOptions = padTo(lines[2].trim(), nItems)
    .split("")
    .map((c) => Number.parseInt(c, 10) || 0);
  const scored = padTo(lines[3].trim(), nItems)
    .toLowerCase()
    .split("")
    .map((c) => c !== "n");

  const students = [];
  for (let i = 4; i < lines.length; i++) {
    const raw = lines[i];
    let id;
    let resp;
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
    if (idWidth && id.length > idWidth) {
      id = id.slice(id.length - idWidth);
    }
    students.push({
      id: id || "S" + (students.length + 1),
      resp: resp.split(""),
    });
  }
  if (!students.length) {
    throw new Error(
      "학생 응답 레코드가 없습니다. 한 줄에 한 명씩 (ID 뒤에 응답) 추가해 주세요.",
    );
  }
  return {
    nItems,
    key,
    numOptions,
    scored,
    weights: new Array(nItems).fill(1),
    students,
  };
};

/** 분석 데이터 모델을 레거시 .dat 텍스트로 직렬화한다. */
const buildDatText = (data) => {
  const n = data.nItems;
  const idWidth = Math.min(
    99,
    Math.max(1, ...data.students.map((s) => s.id.length)),
  );
  const pad = (s, w) => String(s).padStart(w, " ");
  const lines = [pad(n, 3) + "     " + pad(idWidth, 2)];
  lines.push(data.key.map((c) => (c === " " ? " " : c)).join(""));
  lines.push(data.numOptions.map((o) => o || " ").join(""));
  lines.push(data.scored.map((s) => (s ? "y" : "n")).join(""));
  data.students.forEach((s) =>
    lines.push(s.id + s.resp.map((c) => (c === " " ? " " : c)).join("")),
  );
  return lines.join("\r\n") + "\r\n";
};

if (typeof module !== "undefined") {
  module.exports = {
    parseDataCsv,
    buildDataCsv,
    parseDatText,
    buildDatText,
  };
}
