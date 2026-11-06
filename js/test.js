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

// 골든 테스트: 원본 TestAn 1.0 매뉴얼(그림 14~16)의 answer.dat 분석 수치와 일치 검증
const ansData = parseDat(fs.readFileSync(path.join(dir, "answer.dat"), "latin1"));
const ansResult = analyze(ansData);
const st = ansResult.stats;
const golden = [
  ["피험자수", st.n, 119],
  ["평균", round(st.mean, 3), 45.059],
  ["표준편차", round(st.sd, 3), 5.282],
  ["분산", round(st.variance, 3), 27.904],
  ["최저", st.min, 31],
  ["최고", st.high, 57],
  ["중앙값", st.median, 45],
  ["왜도", round(st.skewness, 3), -0.342],
  ["첨도", round(st.kurtosis, 3), -0.144],
  ["평균난이도", round(st.meanDifficulty, 3), 0.644],
  ["평균변별도", round(st.meanDiscrimination, 3), 0.180],
  ["Alpha", round(st.reliability, 3), 0.633],
  ["측정오차", round(st.sem, 3), 3.201],
  ["상위27% 수", ansResult.upper.n, 36],
  ["상위 최저", ansResult.upper.min, 49],
  ["하위27% 수", ansResult.lower.n, 32],
  ["하위 최고", ansResult.lower.max, 41],
  ["문항1 난이도", round(ansResult.items[0].difficulty, 2), 0.25],
  ["문항1 상관계수", round(ansResult.items[0].pointBiserial, 2), 0.02],
  ["문항1 변별도차", round(ansResult.items[0].pUpper - ansResult.items[0].pLower, 2), 0.06],
  ["제외시α 문항1", round(ansResult.items[0].alphaIfDeleted, 3), 0.641],
  ["제외시α 문항2", round(ansResult.items[1].alphaIfDeleted, 3), 0.626],
  ["제외시α 문항29", round(ansResult.items[28].alphaIfDeleted, 3), 0.645],
  ["제외시α 문항50", round(ansResult.items[49].alphaIfDeleted, 3), 0.614],
  ["제외시α 문항56", round(ansResult.items[55].alphaIfDeleted, 3), 0.609]
];
function round(x, d) { const p = Math.pow(10, d); return Math.round(x * p) / p; }
let goldenFail = 0;
golden.forEach(([name, val, exp]) => {
  if (Math.abs(val - exp) < 0.0005) { console.log(`OK  골든 ${name}: ${val}`); pass++; }
  else { console.log(`FAIL 골든 ${name}: ${val} (기대 ${exp})`); goldenFail++; fail++; }
});
if (goldenFail > 0) { console.error(`골든 테스트 ${goldenFail}개 실패`); process.exit(1); }
console.log(`\n골든 테스트 전부 통과 (원본 매뉴얼 수치와 일치)`);
