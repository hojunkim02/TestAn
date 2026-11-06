"use strict";

// 레거시 TestAn .dat → 현대 CSV 변환 도구 (원본 파일은 Orgin/ 에 보관용으로만 남음)
// 사용: node tools/convert-dat.js Orgin/input_test1.dat sample-data/input_test1.csv

const fs = require("fs");
const path = require("path");

function parseDat(text) {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const nonEmpty = lines.filter(l => l.trim().length > 0);
  const header = nonEmpty[0].trim().split(/\s+/).map(Number);
  const nItems = header[0];
  const padTo = (s, len) => s.length >= len ? s.slice(0, len) : s + " ".repeat(len - s.length);
  const key = padTo(nonEmpty[1].trim(), nItems);
  const opts = padTo(nonEmpty[2].trim(), nItems);
  const flags = padTo(nonEmpty[3].trim(), nItems);
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
    students.push({ id: id || ("S" + (students.length + 1)), resp: resp.split("") });
  }
  return { nItems, key: key.split(""), numOptions: opts.split(""), flags: flags.split(""), students };
}

function toCsvCell(v) {
  const s = String(v == null ? "" : v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function datToCsv(dat) {
  const header = ["id", ...Array.from({ length: dat.nItems }, (_, i) => "q" + (i + 1))];
  const lines = [header.map(toCsvCell).join(",")];
  lines.push(["KEY", ...dat.key.map(c => c === " " ? "" : c)].map(toCsvCell).join(","));
  lines.push(["OPTIONS", ...dat.numOptions.map(c => c === " " ? "" : c)].map(toCsvCell).join(","));
  lines.push(["INCLUDE", ...dat.flags.map(c => c === " " ? "y" : c)].map(toCsvCell).join(","));
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
  const dat = parseDat(fs.readFileSync(inp, "latin1"));
  fs.mkdirSync(path.dirname(outp), { recursive: true });
  fs.writeFileSync(outp, datToCsv(dat), "utf8");
  console.log(`${inp} → ${outp}: 문항 ${dat.nItems}개, 학생 ${dat.students.length}명`);
}

module.exports = { parseDat, datToCsv, toCsvCell };
