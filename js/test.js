"use strict";

// 테스트: sample-data CSV 전체 분석 + 원본 매뉴얼 골든 수치 + JSON 왕복 + 레거시 .dat 읽기
const fs = require("fs");
const path = require("path");
const { parseResponsesCsv, parseJson, buildDataJson } = require("./format.js");
const { parseDatText } = require("./legacy-dat.js");
const { analyze } = require("./analysis.js");

const dir = path.join(__dirname, "..", "sample-data");
const files = fs.readdirSync(dir).filter(f => f.endsWith(".csv")).sort();

let pass = 0, fail = 0;

files.forEach(f => {
  const text = fs.readFileSync(path.join(dir, f), "utf8");
  try {
    const data = parseResponsesCsv(text);
    const result = analyze(data);
    if (!result.students.length || !result.items.length) throw new Error("빈 결과");
    console.log(`OK  ${f}: 학생 ${result.students.length}명, 문항 ${data.nItems}개, ` +
      `평균 ${result.stats.mean.toFixed(2)}, α ${result.stats.reliability.toFixed(3)}`);
    pass++;
  } catch (e) {
    console.log(`FAIL ${f}: ${e.message}`);
    fail++;
  }
});

// 골든 테스트: 원본 매뉴얼(그림 14~16)의 answer 자료 분석 수치와 일치 검증
const ansData = parseResponsesCsv(fs.readFileSync(path.join(dir, "answer.csv"), "utf8"));
const ansResult = analyze(ansData);
const st = ansResult.stats;
function round(x, d) { const p = Math.pow(10, d); return Math.round(x * p) / p; }
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
let goldenFail = 0;
golden.forEach(([name, val, exp]) => {
  if (Math.abs(val - exp) < 0.0005) { console.log(`OK  골든 ${name}: ${val}`); pass++; }
  else { console.log(`FAIL 골든 ${name}: ${val} (기대 ${exp})`); goldenFail++; fail++; }
});

// JSON 왕복: data → JSON → parse → 같은 통계
const jsonText = buildDataJson(ansData);
const reData = parseJson(jsonText);
const reResult = analyze(reData);
const same = Math.abs(reResult.stats.mean - st.mean) < 1e-9 &&
  Math.abs(reResult.stats.reliability - st.reliability) < 1e-9 &&
  reResult.students.length === st.n;
if (same) { console.log(`OK  JSON 왕복: 평균 ${reResult.stats.mean.toFixed(3)}, α ${reResult.stats.reliability.toFixed(3)} 동일`); pass++; }
else { console.log("FAIL JSON 왕복 불일치"); fail++; }

// 레거시 .dat 읽기: answer 데이터를 .dat 텍스트로 재구성해 파싱 → 골든 수치 재현
const nItems = ansData.nItems;
const pad = (s, w) => String(s).padStart(w, " ");
let datText = pad(nItems, 3) + "     " + pad(4, 2) + "\n";
datText += ansData.key.map(c => c === " " ? " " : c).join("") + "\n";
datText += ansData.numOptions.map(o => o || " ").join("") + "\n";
datText += ansData.scored.map(s => s ? "y" : "n").join("") + "\n";
ansData.students.forEach(s => {
  datText += s.id + s.resp.map(c => c === " " ? " " : c).join("") + "\n";
});
const datData = parseDatText(datText);
const datResult = analyze(datData);
const datOk = datResult.stats.n === 119 &&
  Math.abs(round(datResult.stats.mean, 3) - 45.059) < 0.0005 &&
  Math.abs(round(datResult.stats.reliability, 3) - 0.633) < 0.0005 &&
  Math.abs(round(datResult.items[0].alphaIfDeleted, 3) - 0.641) < 0.0005 &&
  datResult.items[0].options.find(o => o.option === "2").propAll > 0.5;
if (datOk) {
  console.log(`OK  레거시 .dat 읽기: 평균 ${datResult.stats.mean.toFixed(3)}, α ${datResult.stats.reliability.toFixed(3)} (골든 일치)`);
  pass++;
} else { console.log("FAIL 레거시 .dat 읽기 불일치"); fail++; }

if (fail > 0) { console.error(`\n${fail}개 실패`); process.exit(1); }
console.log(`\n모든 테스트 통과 (${pass}개, 골든 ${golden.length - goldenFail}/${golden.length})`);
