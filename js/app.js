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
$("downloadSrt").addEventListener("click", () => download("result_diff.srt", buildSrt("diff")));
$("downloadSrtDisc").addEventListener("click", () => download("result_disc.srt", buildSrt("disc")));

document.querySelectorAll("#tabs button").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll("#tabs button").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    ["input", "score", "item", "option", "graph"].forEach(t => {
      $("tab-" + t).hidden = t !== btn.dataset.tab;
    });
  });
});

$("optionItem").addEventListener("change", renderOptions);

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
  renderOptionSelect();
  renderOptions();
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
  const r = currentResult;
  $("scoreSummary").innerHTML =
    `피험자 ${st.n}명 · 평균 ${st.mean.toFixed(2)} · 표준편차 ${st.sd.toFixed(2)} · 분산 ${st.variance.toFixed(2)} · ` +
    `최저 ${st.min} · 최고 ${st.high} · 중앙값 ${st.median} · 왜도 ${st.skewness.toFixed(3)} · 첨도 ${st.kurtosis.toFixed(3)}<br>` +
    `평균난이도 ${st.meanDifficulty.toFixed(3)} · 평균변별도 ${st.meanDiscrimination.toFixed(3)} · ` +
    `Cronbach α ${st.reliability.toFixed(3)} · 측정오차 ${st.sem.toFixed(3)} · ` +
    `상위 27% ${r.upper.n}명(${r.upper.min}~${r.upper.max}점) · 하위 27% ${r.lower.n}명(${r.lower.min}~${r.lower.max}점)`;

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
    "<th>난이도(p)</th><th>문항상관계수</th><th>상위 정답률</th><th>하위 정답률</th><th>변별도(D)</th><th>제외 시 α</th></tr>";
  items.forEach(it => {
    const negFlag = it.pointBiserial < 0 ? " ◀부정 변별문항" : "";
    html += `<tr><td>${it.index}</td><td>${it.key === " " ? "-" : it.key}</td><td>${it.weight}</td>` +
      `<td>${it.correct}</td><td>${it.blank}</td><td>${(it.difficulty * 100).toFixed(1)}%</td>` +
      `<td>${it.pointBiserial.toFixed(2)}${negFlag}</td>` +
      `<td>${(it.pUpper * 100).toFixed(1)}%</td><td>${(it.pLower * 100).toFixed(1)}%</td>` +
      `<td>${it.discrimination.toFixed(2)}</td><td>${it.alphaIfDeleted.toFixed(3)}</td></tr>`;
  });
  $("itemTable").innerHTML = html;
}

function renderOptionSelect() {
  const sel = $("optionItem");
  sel.innerHTML = currentResult.items.map(it =>
    `<option value="${it.index - 1}">${it.index}번</option>`).join("");
}

function renderOptions() {
  const idx = Number($("optionItem").value) || 0;
  const it = currentResult.items[idx];
  if (!it) return;
  const keyProp = it.options.find(o => o.isKey);
  $("optionSummary").textContent =
    `${it.index}번 문항 · 정답 ${it.key} · 난이도 ${(it.difficulty * 100).toFixed(1)}% · 변별도 ${it.discrimination.toFixed(2)}`;

  let html = "<tr><th>답지</th><th>정답</th><th>응답비율 전체</th><th>상위 27%</th>" +
    "<th>하위 27%</th><th>답지-총점 상관계수</th><th>비고</th></tr>";
  it.options.forEach(o => {
    let note = "";
    if (o.isKey) note = "*";
    else if (keyProp && o.propAll > keyProp.propAll) note = "◀ 더 매력적임";
    html += `<tr><td>${o.option}</td><td>${o.isKey ? "*" : ""}</td>` +
      `<td>${(o.propAll * 100).toFixed(1)}%</td>` +
      `<td>${(o.propUpper * 100).toFixed(1)}%</td><td>${(o.propLower * 100).toFixed(1)}%</td>` +
      `<td>${o.pbis.toFixed(2)}</td><td>${note}</td></tr>`;
  });
  $("optionTable").innerHTML = html;
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
  const r = currentResult;
  let out = "검사 분석 프로그램 : TestAn Web\n";
  out += `파일성격 : 검사 분석 결과 파일\n\n`;
  out += `문항 수 : ${currentData.nItems} 개\n피험자 수 : ${st.n} 명\n\n`;
  out += "문항번호,문항난이도,문항상관계수,변별도,정답비율차,정답,무응답\n";
  r.items.forEach(it => {
    out += `${it.index},${it.difficulty.toFixed(2)},${it.pointBiserial.toFixed(2)},` +
      `${it.discrimination.toFixed(2)},${(it.pUpper - it.pLower).toFixed(2)},` +
      `${it.correct},${it.blank}\n`;
  });
  out += "\n[문항분석 결과]\n";
  out += `문항 수 : ${currentData.nItems}\n`;
  out += `평균난이도 : ${st.meanDifficulty.toFixed(3)}\n`;
  out += `평균변별도 : ${st.meanDiscrimination.toFixed(3)}\n`;
  out += `Alpha 값 : ${st.reliability.toFixed(3)}\n`;
  out += `측정 오차 : ${st.sem.toFixed(3)}\n\n`;
  out += "[검사점수 분석 결과]\n";
  out += `피험자수 : ${st.n}\n평 균 : ${st.mean.toFixed(3)}\n`;
  out += `표준편차 : ${st.sd.toFixed(3)}\n분 산 : ${st.variance.toFixed(3)}\n`;
  out += `최저점수 : ${st.min}\n최고점수 : ${st.high}\n중앙값 : ${st.median}\n`;
  out += `왜 도 : ${st.skewness.toFixed(3)}\n첨 도 : ${st.kurtosis.toFixed(3)}\n\n`;
  out += `[상위 27% 집단] 피험자수 : ${r.upper.n}, 최저점수 : ${r.upper.min}\n`;
  out += `[하위 27% 집단] 피험자수 : ${r.lower.n}, 최고점수 : ${r.lower.max}\n\n`;
  out += "[해당문항을 제외한 검사의 신뢰도]\n";
  r.items.forEach(it => {
    out += `${it.index} ${it.alphaIfDeleted.toFixed(3)}\n`;
  });
  return out;
}

function buildScr() {
  let out = `TestAn Web - 피험자별 득점표 파일\n\n【문항 수】${currentData.nItems} 개\n【피험자 수】${currentResult.stats.n} 명\n\n`;
  out += "ID 번호  점수\n";
  currentResult.students.forEach(s => {
    out += `${s.id} ${s.raw}\n`;
  });
  return out;
}

function buildSrt(mode) {
  const byDiff = mode !== "disc";
  let out = byDiff ? "문항번호,문항난이도,변별도 (난이도 내림차순)\n"
                   : "문항번호,변별도,난이도 (변별도 내림차순)\n";
  const items = [...currentResult.items];
  if (byDiff) items.sort((a, b) => b.difficulty - a.difficulty);
  else items.sort((a, b) => b.discrimination - a.discrimination);
  items.forEach(it => {
    out += `${it.index},${byDiff ? it.difficulty.toFixed(2) : it.discrimination.toFixed(2)},` +
      `${byDiff ? it.discrimination.toFixed(2) : it.difficulty.toFixed(2)}\n`;
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
