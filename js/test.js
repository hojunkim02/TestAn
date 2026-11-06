"use strict";

const fs = require("fs");
const path = require("path");
const { parseDat, applyKey, extractKey } = require("./parser.js");
const { analyze } = require("./analysis.js");

const dir = path.join(__dirname, "..", "Orgin");
const files = fs.readdirSync(dir).filter(f => /^input_test\d+\.dat$/.test(f));

let pass = 0, fail = 0;

files.forEach(f => {
  const text = fs.readFileSync(path.join(dir, f), "latin1");
  try {
    const data = parseDat(text);
    const result = analyze(data);
    const n = result.students.length;
    const items = result.items.length;
    if (n === 0 || items === 0) throw new Error("빈 결과");
    const sum = result.students.reduce((a, s) => a + s.raw, 0);
    console.log(`OK  ${f}: 학생 ${n}명, 문항 ${items}개, 평균 ${(sum / n).toFixed(2)}, α ${result.stats.reliability.toFixed(3)}`);
    pass++;
  } catch (e) {
    console.log(`FAIL ${f}: ${e.message}`);
    fail++;
  }
});

const ansText = fs.readFileSync(path.join(dir, "answer.dat"), "latin1");
const keyData = extractKey(ansText);
const t2 = parseDat(fs.readFileSync(path.join(dir, "input_test2.dat"), "latin1"));
applyKey(t2, keyData);
const r2 = analyze(t2);
console.log(`OK  answer.dat 키 적용: 문항 ${r2.items.length}개, 평균 ${r2.stats.mean.toFixed(2)}`);
pass++;

if (fail > 0) { console.error(`${fail}개 실패`); process.exit(1); }
console.log(`\n모든 테스트 통과 (${pass}개 파일)`);
