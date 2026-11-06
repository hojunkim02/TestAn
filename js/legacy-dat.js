"use strict";

// 레거시 TestAn 1.0 .dat 읽기 (기존 사용자 자료 호환용)
// 첫 줄: 문항수(1-3열) + ID 캐릿수(9-10열)
// 이후: 정답키 / 답지 수 / 분석 포함 y/n / 학생 레코드(ID + 응답, 공백=무응답)

function parseDatText(text) {
  const lines = text.replace(/\r\n?/g, "\n").split("\n").filter(l => l.trim().length > 0);
  if (lines.length < 5) throw new Error(".dat 형식이 올바르지 않습니다 (최소 5줄 필요).");
  const header = lines[0].trim().split(/\s+/).map(Number);
  if (!isFinite(header[0]) || header[0] < 1) throw new Error("첫 줄에 문항수가 있어야 합니다.");
  const nItems = header[0];
  if (nItems > 200) throw new Error("문항수는 최대 200문항까지 지원됩니다.");
  const idWidth = header.length > 1 ? header[1] : null;

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
  if (!students.length) throw new Error(".dat에 학생 레코드가 없습니다.");
  return {
    nItems,
    key,
    numOptions,
    scored,
    weights: new Array(nItems).fill(1),
    students
  };
}

if (typeof module !== "undefined") {
  module.exports = { parseDatText };
}
