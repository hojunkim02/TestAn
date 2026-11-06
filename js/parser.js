"use strict";

// TestAn .dat 포맷 파서
// 첫 줄: 문항수 (그 외 부가 코드, 원본 프로그램의 내부 값)
// 둘째 줄: 정답키 (문항수 길이)
// 셋째 줄: 배점 (문항수 길이)
// 넷째 줄: 채점 여부 플래그 y/n (문항수 길이)
// 이후: 학생 레코드 — 줄에서 앞부분은 ID, 마지막 문항수 길이가 응답 (공백=무응답)

function parseDat(text) {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const nonEmpty = lines.filter(l => l.trim().length > 0);
  if (nonEmpty.length < 5) {
    throw new Error("데이터 형식이 올바르지 않습니다 (최소 5줄 필요).");
  }

  const header = nonEmpty[0].trim().split(/\s+/).map(Number);
  if (header.length < 1 || !isFinite(header[0]) || header[0] < 1) {
    throw new Error("첫 줄에 문항수가 있어야 합니다.");
  }
  const nItems = header[0];
  const meta = header.length > 1 ? header[1] : null;

  const keyLine = nonEmpty[1];
  const weightLine = nonEmpty[2];
  const flagLine = nonEmpty[3];

  const key = padTo(keyLine.trim(), nItems);
  const weights = padTo(weightLine.trim(), nItems).split("").map(c => {
    const n = parseInt(c, 10);
    return isFinite(n) ? n : 1;
  });
  const scored = padTo(flagLine.trim(), nItems).toLowerCase().split("")
    .map(c => c !== "n");

  const students = [];
  for (let i = 4; i < nonEmpty.length; i++) {
    const line = nonEmpty[i].replace(/\s+$/, "");
    if (line.length === 0) continue;
    let id, resp;
    if (line.length <= nItems) {
      id = "S" + (students.length + 1);
      resp = padTo(line.trim(), nItems);
    } else {
      resp = line.slice(line.length - nItems);
      id = line.slice(0, line.length - nItems).trim() || ("S" + (students.length + 1));
    }
    students.push({ id, resp: resp.split("") });
  }

  return { nItems, meta, key: key.split(""), weights, scored, students };
}

// 정답 데이터 파일에서 정답키/배점/플래그만 추출
function extractKey(text) {
  const parsed = parseDat(text);
  return {
    key: parsed.key,
    weights: parsed.weights,
    scored: parsed.scored,
    nItems: parsed.nItems
  };
}

function applyKey(data, keyData) {
  if (keyData.nItems !== data.nItems) {
    throw new Error("정답 데이터의 문항수가 응답 데이터와 일치하지 않습니다.");
  }
  data.key = keyData.key;
  data.weights = keyData.weights;
  data.scored = keyData.scored;
}

function padTo(s, len) {
  return s.length >= len ? s.slice(0, len) : s + " ".repeat(len - s.length);
}

if (typeof module !== "undefined") {
  module.exports = { parseDat, extractKey, applyKey };
}
