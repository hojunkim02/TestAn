"use strict";

let currentData = null;
let currentResult = null;

const $ = id => document.getElementById(id);

$("loadDemo").addEventListener("click", loadDemo);
$("newData").addEventListener("click", openNewModal);
$("newBuild").addEventListener("click", buildNewItemTable);
$("newGenerate").addEventListener("click", generateScaffold);
$("importDat").addEventListener("click", () => $("datFile").click());
$("datFile").addEventListener("change", e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      currentData = parseDatText(reader.result);
      run();
    } catch (err) {
      setStatus(".dat 파일을 읽을 수 없습니다: " + err.message, "error");
    }
  };
  reader.onerror = () => setStatus(".dat 파일을 읽을 수 없습니다.", "error");
  reader.readAsText(file, "latin1");
  e.target.value = "";
});
$("exportDat").addEventListener("click", () => {
  if (!currentData) { setStatus("내보낼 데이터가 없습니다.", "error"); return; }
  downloadDat("responses.dat", buildDatText(currentData));
});
$("newCancel").addEventListener("click", () => $("newModal").hidden = true);
$("editData").addEventListener("click", openEditModal);
$("editApply").addEventListener("click", applyEdit);
$("editCancel").addEventListener("click", () => $("editModal").hidden = true);
$("aboutBtn").addEventListener("click", () => $("aboutModal").hidden = false);
$("aboutClose").addEventListener("click", () => $("aboutModal").hidden = true);
$("itemSort").addEventListener("change", () => renderItems());
$("graphMode").addEventListener("change", () => { renderChart(); renderGraphTable(); });
$("optionItem").addEventListener("change", renderOptions);

document.querySelectorAll("#tabs button").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll("#tabs button").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    ["input", "score", "item", "option", "graph"].forEach(t => {
      $("tab-" + t).hidden = t !== btn.dataset.tab;
    });
    if (btn.dataset.tab === "graph") { renderChart(); renderGraphTable(); }
  });
});

function setStatus(msg, cls) {
  const el = $("status");
  el.textContent = msg;
  el.className = "status " + (cls || "");
}

function loadDemo() {
  fetch("sample-data/answer.csv")
    .then(r => { if (!r.ok) throw new Error("샘플 파일을 불러올 수 없습니다."); return r.text(); })
    .then(text => {
      currentData = parseDataCsv(text);
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
  renderGraphTable();
}

// 새 응답자료 만들기 — 원본 프로그램과 동일한 방식:
// 문항 수·ID 캐릿수 입력 → 문항별 정답/답지수/분석 포함 여부 표 → .dat 골격 생성 → 편집 화면
function openNewModal() {
  $("newModal").hidden = false;
  buildNewItemTable();
}

function buildNewItemTable() {
  const n = Math.max(1, Math.min(200, Number($("newItems").value) || 1));
  $("newItems").value = n;
  const idw = Math.max(1, Math.min(99, Number($("newIdw").value) || 4));
  $("newIdw").value = idw;
  let html = "<tr><th>문항 번호</th><th>정답</th><th>답지 수</th><th>분석 포함 (y/n)</th></tr>";
  for (let i = 1; i <= n; i++) {
    html += `<tr><td>${i}</td>` +
      `<td><input type="text" maxlength="1" value="1" data-col="key" data-idx="${i}" class="cell-input"></td>` +
      `<td><input type="number" min="2" max="9" value="4" data-col="opt" data-idx="${i}" class="cell-input"></td>` +
      `<td><input type="text" maxlength="1" value="y" data-col="flag" data-idx="${i}" class="cell-input"></td></tr>`;
  }
  $("newTable").innerHTML = html;
}

function generateScaffold() {
  const n = Math.max(1, Math.min(200, Number($("newItems").value) || 1));
  const idw = Math.max(1, Math.min(99, Number($("newIdw").value) || 4));
  const cells = $("newTable").querySelectorAll(".cell-input");
  if (cells.length < n * 3) { alert("먼저 '항목 표 만들기'를 눌러주세요."); return; }
  const keys = new Array(n).fill("1"), opts = new Array(n).fill("4"), flags = new Array(n).fill("y");
  cells.forEach(c => {
    const i = Number(c.dataset.idx) - 1;
    if (c.dataset.col === "key") keys[i] = (c.value.trim() || "1").slice(0, 1);
    if (c.dataset.col === "opt") opts[i] = String(c.value.trim() || "4");
    if (c.dataset.col === "flag") flags[i] = (c.value.trim() || "y").toLowerCase().slice(0, 1) === "n" ? "n" : "y";
  });
  $("newModal").hidden = true;
  $("editArea").value = buildScaffoldDat(n, idw, keys, opts, flags);
  $("editModal").hidden = false;
  setStatus("골격이 생성되었습니다. 학생 응답(ID 뒤에 응답)을 채운 뒤 적용하세요.", "");
}

function openEditModal() {
  if (!currentData) { setStatus("먼저 데이터를 불러오세요.", "error"); return; }
  $("editArea").value = buildDatText(currentData);
  $("editModal").hidden = false;
}

function applyEdit() {
  try {
    currentData = parseDatText($("editArea").value);
    $("editModal").hidden = true;
    run();
  } catch (err) {
    alert("편집 내용을 적용할 수 없습니다:\n" + err.message);
  }
}

function downloadDat(name, content) {
  const blob = new Blob([content], { type: "text/plain;charset=latin1" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

function renderInput() {
  const d = currentData;
  const included = d.scored.filter(Boolean).length;
  $("inputSummary").textContent =
    `학생 ${d.students.length}명 · 문항 ${d.nItems}개 · 분석 포함 ${included}문항 · 총점 만점 ${included}점`;

  let html = "<tr><th>No</th><th>ID</th>";
  for (let j = 0; j < d.nItems; j++) html += `<th>${j + 1}</th>`;
  html += "</tr>";
  html += "<tr><td></td><td class=\"left\">정답 (KEY)</td>" +
    d.key.map(k => `<td>${k === " " ? "-" : k}</td>`).join("") + "</tr>";
  html += "<tr><td></td><td class=\"left\">답지 수</td>" +
    d.numOptions.map(o => `<td>${o || "-"}</td>`).join("") + "</tr>";
  html += "<tr><td></td><td class=\"left\">분석 포함</td>" +
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

  let html = "<tr><th>순위</th><th>ID</th><th>점수</th><th>백분율(%)</th><th>정답 문항수</th></tr>";
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

  let html = "<tr><th>문항</th><th>정답</th><th>정답자</th><th>무응답</th>" +
    "<th>난이도(p)</th><th>문항상관계수</th><th>상위 정답률</th><th>하위 정답률</th><th>변별도(D)</th><th>제외 시 α</th></tr>";
  items.forEach(it => {
    const negFlag = it.pointBiserial < 0 ? " ◀부정 변별문항" : "";
    html += `<tr><td>${it.index}</td><td>${it.key === " " ? "-" : it.key}</td>` +
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
  // 고해상도 렌더링: CSS 크기 × devicePixelRatio로 백퍼픽셀 확보
  const canvas = $("chart");
  const dpr = window.devicePixelRatio || 1;
  const w = Math.max(320, canvas.getBoundingClientRect().width || 900);
  const h = 400;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  canvas.style.height = h + "px";
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  ctx.lineWidth = 1;
  const mode = $("graphMode").value;

  let labels, values;
  if (mode === "score" || mode === "cum") {
    const st = currentResult.stats;
    const counts = {};
    currentResult.students.forEach(s => { counts[s.raw] = (counts[s.raw] || 0) + 1; });
    labels = [];
    for (let sc = st.min; sc <= st.high; sc++) labels.push(sc);
    if (mode === "score") {
      values = labels.map(l => counts[l] || 0);
    } else {
      let cum = 0;
      values = labels.map(l => { cum += counts[l] || 0; return st.n ? cum / st.n * 100 : 0; });
    }
  } else {
    labels = currentResult.items.map(it => it.index);
    values = currentResult.items.map(it =>
      mode === "diff" ? it.difficulty * 100 : it.discrimination);
  }

  const pad = 50, bw = Math.max(2, (w - pad * 2) / values.length - 4);
  const maxV = Math.max(...values, 0.001);
  const title = mode === "diff" ? "문항 난이도 (정답률 %)" :
    mode === "disc" ? "문항 변별도 (D)" :
    mode === "score" ? "검사점수의 도수 (선 그래프)" : "검사점수의 누가 백분율 (선 그래프)";
  const asLine = mode === "score" || mode === "cum";

  ctx.fillStyle = "#1f2937";
  ctx.font = "13px sans-serif";
  ctx.fillText(title, pad, 20);

  if (asLine) {
    ctx.strokeStyle = "#2563eb";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    values.forEach((v, i) => {
      const x = pad + i * ((w - pad * 2) / Math.max(1, values.length - 1));
      const y = h - pad - (h - pad * 2) * (v / maxV);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.fillStyle = "#6b7280";
    ctx.font = "10px sans-serif";
    const step = Math.max(1, Math.ceil(values.length / 25));
    values.forEach((v, i) => {
      if (i % step === 0) {
        const x = pad + i * ((w - pad * 2) / Math.max(1, values.length - 1));
        ctx.fillText(labels[i], x - 6, h - pad + 14);
      }
    });
  } else {
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
  }

  ctx.strokeStyle = "#d9dde3";
  ctx.beginPath();
  ctx.moveTo(pad, h - pad);
  ctx.lineTo(w - pad / 2, h - pad);
  ctx.stroke();
}

function renderGraphTable() {
  if (!currentResult) { $("graphTable").innerHTML = ""; return; }
  const st = currentResult.stats;
  const counts = {};
  currentResult.students.forEach(s => { counts[s.raw] = (counts[s.raw] || 0) + 1; });
  let html = "<tr><th>점수</th><th>피험자 수</th><th>백분율(x)</th><th>누가 피험자 수</th><th>누가 백분율(x)</th></tr>";
  let cum = 0;
  for (let sc = st.min; sc <= st.high; sc++) {
    const c = counts[sc] || 0;
    cum += c;
    html += `<tr><td>${sc}</td><td>${c}</td><td>${(st.n ? c / st.n * 100 : 0).toFixed(2)}</td>` +
      `<td>${cum}</td><td>${(st.n ? cum / st.n * 100 : 0).toFixed(2)}</td></tr>`;
  }
  $("graphTable").innerHTML = html;
}
