"use strict";

// 레거시 TestAn .dat → 현대 CSV 변환 도구
// 사용: node tools/convert-dat.js 입력.dat 출력.csv
// (앱 자체는 js/legacy-dat.js로 .dat을 직접 읽습니다)

const fs = require("fs");
const path = require("path");
const { parseDatText } = require("../js/legacy-dat.js");

function toCsvCell(v) {
  const s = String(v == null ? "" : v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function datToCsv(dat) {
  const header = ["id", ...Array.from({ length: dat.nItems }, (_, i) => "q" + (i + 1))];
  const lines = [header.map(toCsvCell).join(",")];
  lines.push(["KEY", ...dat.key.map(c => c === " " ? "" : c)].map(toCsvCell).join(","));
  lines.push(["OPTIONS", ...dat.numOptions.map(c => c || "")].map(toCsvCell).join(","));
  lines.push(["INCLUDE", ...dat.scored.map(c => c ? "y" : "n")].map(toCsvCell).join(","));
  dat.students.forEach(s => {
    lines.push([s.id, ...s.resp.map(c => c === " " ? "" : c)].map(toCsvCell).join(","));
  });
  return lines.join("\r\n") + "\r\n";
}

if (require.main === module) {
  const [inp, outp] = process.argv.slice(2);
  if (!inp || !outp) {
    console.error("사용: node tools/convert-dat.js <입력.dat> <출력.csv>");
    process.exit(1);
  }
  const dat = parseDatText(fs.readFileSync(inp, "latin1"));
  fs.mkdirSync(path.dirname(outp), { recursive: true });
  fs.writeFileSync(outp, datToCsv(dat), "utf8");
  console.log(`${inp} → ${outp}: 문항 ${dat.nItems}개, 학생 ${dat.students.length}명`);
}

module.exports = { datToCsv };
