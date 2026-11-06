"use strict";

// 데이터 모델 처리: JSON 단일 포맷
//
// { "items": [{"no":1,"key":"4","options":4,"include":true}],
//   "students": [{"id":"0001","responses":["2","3",...]}] }
// responses의 빈 문자열("")은 무응답이다.

function parseJson(text) {
  const raw = JSON.parse(text);
  const items = raw.items || [];
  const studentsRaw = raw.students || [];
  if (!studentsRaw.length) throw new Error("students 배열이 비어 있습니다.");
  const nItems = items.length || studentsRaw[0].responses.length;
  if (!nItems) throw new Error("문항 수를 알 수 없습니다.");

  const key = items.length ? items.map(it => cell(it.key)) : new Array(nItems).fill(" ");
  const numOptions = items.length ? items.map(it => it.options || 0) : new Array(nItems).fill(0);
  const scored = items.length ? items.map(it => it.include !== false) : new Array(nItems).fill(true);
  if (key.length < nItems) throw new Error("items 수가 문항 수보다 적습니다.");

  const students = studentsRaw.map((s, i) => {
    let resp = s.responses;
    if (!Array.isArray(resp)) resp = String(resp == null ? "" : resp).split("");
    const out = new Array(nItems);
    for (let j = 0; j < nItems; j++) {
      const c = j < resp.length ? cell(resp[j]) : "";
      out[j] = c === "" ? " " : c;
    }
    return { id: String(s.id != null ? s.id : "").trim() || ("S" + (i + 1)), resp: out };
  });

  return {
    nItems,
    key,
    numOptions,
    scored,
    weights: new Array(nItems).fill(1),
    students
  };
}

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

function cell(v) {
  if (v == null) return "";
  return String(v).trim();
}

if (typeof module !== "undefined") {
  module.exports = { parseJson, buildDataJson };
}
