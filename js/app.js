"use strict";

let currentData = null;
let currentResult = null;

const $ = id => document.getElementById(id);

$("inputFile").addEventListener("change", e => handleFile(e, "input"));
$("answerFile").addEventListener("change", e => handleFile(e, "answer"));
$("loadDemo").addEventListener("click", loadDemo);
$("itemSort").addEventListener("change", () => renderItems());
$("graphMode").addEventListener("change", () => renderChart());
$("downloadOut").addEventListener("click", () => download("result.out", buildOut()));
$("downloadScr").addEventListener("click", () => download("result.scr", buildScr()));
$("downloadSrt").addEventListener("click", () => download("result.srt", buildSrt()));

document.querySelectorAll("#tabs button").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll("#tabs button").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    ["input", "score", "item", "graph"].forEach(t => {
      $("tab-" + t).hidden = t !== btn.dataset.tab;
    });
  });
});

function setStatus(msg, cls) {
  const el = $("status");
  el.textContent = msg;
  el.className = "status " + (cls || "");
}

function handleFile(e, kind) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      if (kind === "input") {
        $("inputFileName").textContent = file.name;
        currentData = parseDat(reader.result);
        const ansFile = $("answerFile").files[0];
        if (ansFile) {
          const r2 = new FileReader();
          r2.onload = () => { try { applyKey(currentData, extractKey(r2.result)); run(); }
            catch (err) { setStatus(err.message, "error"); } };
          r2.readAsText(ansFile);
        } else run();
      } else {
        $("answerFileName").textContent = file.name;
        if (currentData) { applyKey(currentData, extractKey(reader.result)); run(); }
        else setStatus("응답 데이터를 먼저 선택하세요.", "error");
      }
    } catch (err) {
      setStatus(err.message, "error");
    }
  };
  reader.readAsText(file, "utf-8");
}

function loadDemo() {
  fetch("Orgin/input_test6.dat")
    .then(r => { if (!r.ok) throw new Error("샘플 파일을 불러올 수 없습니다."); return r.text(); })
    .then(text => {
      $("inputFileName").textContent = "input_test6.dat (샘플)";
      $("answerFileName").textContent = "없으면 데이터 파일의 정답키 사용";
      currentData = parseDat(text);
      run();
    })
    .catch(err => setStatus(err.message, "error"));
}

function run() {
  currentResult = analyze(currentData);
  $("tabs").hidden = false;
  setStatus(`분석 완료: 학생 ${currentResult.stats.n}명, 문항 ${currentData.nItems}개`, "ok");
  renderInput();
  renderScores();
  renderItems();
  renderChart();
}

function renderInput() {
  const d = currentData;
  $("inputSummary").textContent =
    `학생 ${d.students.length}명 · 문항 ${d.nItems}개 · ` +
    `채점 문항 ${d.scored.filter(Boolean).length}개 · 만점 ` +
    d.weights.reduce((a, w, j) => a + (d.scored[j] ? w : 0), 0) + "점";

  let html = "<tr><th>No</th><th>ID</th>";
  for (let j = 0; j < d.nItems; j++) html += `<th>${j + 1}</th>`;
  html += "</tr>";
  html += "<tr><td></td><td class=\"left\">정답키</td>" +
    d.key.map(k => `<td>${k === " " ? "-" : k}</td>`).join("") + "</tr>";
  html += "<tr><td></td><td class=\"left\">배점</td>" +
    d.weights.map(w => `<td>${w}</td>`).join("") + "</tr>";
  html += "<tr><td></td><td class=\"left\">채점</td>" +
    d.scored.map(s => `<td>${s ? "y" : "n"}</td>`).join("") + "</tr>";
  d.students.forEach((s, i) => {
    html += `<tr><td>${i + 1}</td><td class="left">${s.id}</td>` +
      s.resp.map(r => `<td>${r === " " ? "-" : r}</td>`).join("") + "</tr>";
  });
  $("inputTable").innerHTML = html;
}

function renderScores() {
  const st = currentResult.stats;
  $("scoreSummary").textContent =
    `평균 ${st.mean.toFixed(2)} · 표준편차 ${st.sd.toFixed(2)} · ` +
    `최고 ${st.max} · 최저 ${st.min} · Cronbach α ${st.reliability.toFixed(3)}`;

  let html = "<tr><th>순위</th><th>ID</th><th>점수</th><th>만점 대비(%)</th><th>정답 문항수</th></tr>";
  [...currentResult.students].sort((a, b) => a.rank - b.rank).forEach(s => {
    html += `<tr><td>${s.rank}</td><td class="left">${s.id}</td><td>${s.raw}</td>` +
      `<td>${s.percent.toFixed(1)}</td><td>${s.correctCount}</td></tr>`;
  });
  $("scoreTable").innerHTML = html;
}

function renderItems() {
  const mode = $("itemSort").value;
  let items = [...currentResult.items];
  if (mode === "diffAsc") items.sort((a, b) => a.difficulty - b.difficulty);
  else if (mode === "diffDesc") items.sort((a, b) => b.difficulty - a.difficulty);
  else if (mode === "discDesc") items.sort((a, b) => b.discrimination - a.discrimination);

  let html = "<tr><th>문항</th><th>정답</th><th>배점</th><th>정답자</th><th>무응답</th>" +
    "<th>난이도(p)</th><th>상위 정답률</th><th>하위 정답률</th><th>변별도(D)</th></tr>";
  items.forEach(it => {
    html += `<tr><td>${it.index}</td><td>${it.key === " " ? "-" : it.key}</td><td>${it.weight}</td>` +
      `<td>${it.correct}</td><td>${it.blank}</td><td>${(it.difficulty * 100).toFixed(1)}%</td>` +
      `<td>${(it.pUpper * 100).toFixed(1)}%</td><td>${(it.pLower * 100).toFixed(1)}%</td>` +
      `<td>${it.discrimination.toFixed(2)}</td></tr>`;
  });
  $("itemTable").innerHTML = html;
}

function renderChart() {
  const canvas = $("chart");
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const mode = $("graphMode").value;

  let labels, values;
  if (mode === "score") {
    const counts = {};
    currentResult.students.forEach(s => { counts[s.raw] = (counts[s.raw] || 0) + 1; });
    labels = Object.keys(counts).map(Number).sort((a, b) => a - b);
    values = labels.map(l => counts[l]);
  } else {
    labels = currentResult.items.map(it => it.index);
    values = currentResult.items.map(it =>
      mode === "diff" ? it.difficulty * 100 : it.discrimination);
  }

  const w = canvas.width, h = canvas.height;
  const pad = 50, bw = Math.max(2, (w - pad * 2) / values.length - 4);
  const maxV = Math.max(...values, 0.001);
  const title = mode === "diff" ? "문항 난이도 (정답률 %)" :
    mode === "disc" ? "문항 변별도 (D)" : "점수 분포 (인원)";

  ctx.fillStyle = "#1f2937";
  ctx.font = "13px sans-serif";
  ctx.fillText(title, pad, 20);

  values.forEach((v, i) => {
    const x = pad + i * ((w - pad * 2) / values.length) + 2;
    const bh = (h - pad * 2) * (v / maxV);
    ctx.fillStyle = mode === "disc" ? (v < 0 ? "#dc2626" : "#2563eb") : "#2563eb";
    ctx.fillRect(x, h - pad - bh, bw, bh);
    if (values.length <= 40) {
      ctx.fillStyle = "#6b7280";
      ctx.font = "10px sans-serif";
      ctx.fillText(labels[i], x, h - pad + 14);
    }
  });

  ctx.strokeStyle = "#d9dde3";
  ctx.beginPath();
  ctx.moveTo(pad, h - pad);
  ctx.lineTo(w - pad / 2, h - pad);
  ctx.stroke();
}

function buildOut() {
  const st = currentResult.stats;
  let out = `TestAn Web 분석 결과\n학생 ${st.n}명, 평균 ${st.mean.toFixed(2)}, 표준편차 ${st.sd.toFixed(2)}, Cronbach α ${st.reliability.toFixed(3)}\n\n`;
  out += "문항,정답,배점,정답자,난이도,변별도\n";
  currentResult.items.forEach(it => {
    out += `${it.index},${it.key},${it.weight},${it.correct},${(it.difficulty * 100).toFixed(1)}%,${it.discrimination.toFixed(2)}\n`;
  });
  return out;
}

function buildScr() {
  let out = "순위,ID,점수,백분율,정답문항수\n";
  [...currentResult.students].sort((a, b) => a.rank - b.rank).forEach(s => {
    out += `${s.rank},${s.id},${s.raw},${s.percent.toFixed(1)},${s.correctCount}\n`;
  });
  return out;
}

function buildSrt() {
  let out = "문항,난이도,변별도\n";
  [...currentResult.items]
    .sort((a, b) => a.difficulty - b.difficulty)
    .forEach(it => {
      out += `${it.index},${(it.difficulty * 100).toFixed(1)}%,${it.discrimination.toFixed(2)}\n`;
    });
  return out;
}

function download(name, content) {
  const blob = new Blob(["\uFEFF" + content], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}
