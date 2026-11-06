"use strict";

// TestAn .dat 포맷 파서 (원본 TestAn 1.0 매뉴얼 표 14 기준)
// control line: 1-3열 문항수(최대 200), 4-8열 공백, 9-10열 ID 캐릿수(최대 99)
// 둘째 줄: 각 문항의 정답 번호 (문항수 길이)
// 셋째 줄: 각 문항마다 답지의 수 (문항수 길이)
// 넷째 줄: 분석 포함 여부 y/n (문항수 길이)
// 이후: 학생 레코드 — 앞부분은 ID, 마지막 문항수 길이가 응답 (공백=무응답)
// 점수는 맞힌 문항 수(문항당 1점)

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
  if (nItems > 200) {
    throw new Error("문항수는 최대 200문항까지 지원됩니다.");
  }

  const keyLine = nonEmpty[1];
  const weightLine = nonEmpty[2];
  const flagLine = nonEmpty[3];

  const key = padTo(keyLine.trim(), nItems);
  const numOptions = padTo(weightLine.trim(), nItems).split("").map(c => {
    const n = parseInt(c, 10);
    return isFinite(n) ? n : 0;
  });
  const weights = new Array(nItems).fill(1);
  const scored = padTo(flagLine.trim(), nItems).toLowerCase().split("")
    .map(c => c !== "n");

  const students = [];
  for (let i = 4; i < nonEmpty.length; i++) {
    const raw = nonEmpty[i];
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
    if (!id) id = "S" + (students.length + 1);
    students.push({ id, resp: resp.split("") });
  }

  return { nItems, meta, key: key.split(""), weights, numOptions, scored, students };
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
