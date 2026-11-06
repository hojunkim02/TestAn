"use strict";

let currentData = null;
let currentResult = null;

/** id로 DOM 요소를 가져온다. */
const $ = (id) => document.getElementById(id);

/** 상태 메시지를 화면에 표시한다 (cls: "ok" | "error" | ""). */
const setStatus = (msg, cls = "") => {
  const el = $("status");
  el.textContent = msg;
  el.className = "status " + cls;
};

/** 샘플 데이터를 불러와 즉시 분석을 실행한다. */
const loadDemo = () => {
  fetch("sample-data/answer.csv")
    .then((r) => {
      if (!r.ok) throw new Error("샘플 파일을 불러올 수 없습니다.");
      return r.text();
    })
    .then((text) => {
      currentData = parseDataCsv(text);
      run();
    })
    .catch((err) => setStatus(err.message, "error"));
};

/** 현재 데이터로 분석을 실행하고 모든 탭을 다시 그린다. */
const run = () => {
  currentResult = analyze(currentData);
  $("tabs").hidden = false;
  setStatus(
    `분석 완료: 학생 ${currentResult.stats.n}명, 문항 ${currentData.nItems}개`,
    "ok",
  );
  renderInput();
  renderScores();
  renderItems();
  renderOptionSelect();
  renderOptions();
  renderChart();
  renderGraphTable();
};

// ---------- 새 응답자료 만들기 마법사 ----------

let wiz = null;

/** 새 응답자료 모달을 연다. */
const openNewModal = () => {
  $("newModal").hidden = false;
  $("wizBody").hidden = true;
};

/** 문항 수 / ID 캐릿수 입력을 검증·반영하고 문항 정보 표를 그린다. */
const wizApplyCount = () => {
  const n = Math.max(1, Math.min(200, Number($("newItems").value) || 1));
  const idw = Math.max(1, Math.min(99, Number($("newIdw").value) || 4));
  $("newItems").value = n;
  $("newIdw").value = idw;
  wiz = { n, idw };
  $("wizBody").hidden = false;
  renderWizTable();
};

/** 마법사의 문항 정보 입력 표(정답/답지 수/포함 여부)를 그린다. */
const renderWizTable = () => {
  let html =
    "<tr><th>문항 번호</th><th>정답</th><th>답지 수</th><th>분석 포함 여부 (y/n)</th></tr>";
  for (let i = 0; i < wiz.n; i++) {
    html +=
      `<tr><td>${i + 1}</td>` +
      `<td><input type="text" inputmode="numeric" maxlength="1" value="1" data-row="${i}" data-col="key" class="grid-input"></td>` +
      `<td><input type="number" min="2" max="9" value="5" data-row="${i}" data-col="opt" class="grid-input"></td>` +
      `<td><input type="text" maxlength="1" value="y" data-row="${i}" data-col="flag" class="grid-input"></td></tr>`;
  }
  $("newTable").innerHTML = html;
};

/** 마법사 입력을 확정해 편집 모달에 골격을 넘긴다. */
const wizConfirm = () => {
  const keys = [];
  const opts = [];
  const flags = [];
  for (let i = 0; i < wiz.n; i++) {
    const key = $(`newTable`).querySelector(
      `[data-row="${i}"][data-col="key"]`,
    );
    const opt = $(`newTable`).querySelector(
      `[data-row="${i}"][data-col="opt"]`,
    );
    const flag = $(`newTable`).querySelector(
      `[data-row="${i}"][data-col="flag"]`,
    );
    keys.push((key.value.trim() || "1").slice(0, 1));
    opts.push(Number.parseInt(opt.value, 10) || 5);
    flags.push(flag.value.trim().toLowerCase() === "n" ? "n" : "y");
  }
  openEditModal({
    nItems: wiz.n,
    key: keys,
    numOptions: opts,
    scored: flags.map((f) => f !== "n"),
    students: [],
  });
  $("newModal").hidden = true;
  setStatus(
    "문항 정보가 입력되었습니다. 학생 응답 행을 추가해 채운 뒤 적용하세요.",
  );
};

// ---------- 편집 그리드 ----------

let editModel = null;

/** Enter/↑/↓ 키로 데이터 그리드 셀 사이를 이동한다 (메타 행 ↔ 학생 행 연결 포함). */
const gridKeyNav = (e, tableId) => {
  if (!["Enter", "ArrowDown", "ArrowUp"].includes(e.key)) return;
  const input = e.target;
  if (input.tagName !== "INPUT") return;
  e.preventDefault();
  const down = e.key !== "ArrowUp";
  const col = input.dataset.col;
  const table = $(tableId);
  let target = null;
  if (input.dataset.mrow !== undefined) {
    const mrow = Number(input.dataset.mrow);
    if (down) {
      target =
        table.querySelector(
          `input[data-mrow="${mrow + 1}"][data-col="${col}"]`,
        ) || table.querySelector(`input[data-row="0"][data-col="${col}"]`);
    } else if (mrow > 0) {
      target = table.querySelector(
        `input[data-mrow="${mrow - 1}"][data-col="${col}"]`,
      );
    }
  } else if (input.dataset.row !== undefined) {
    const row = Number(input.dataset.row);
    if (down) {
      target = table.querySelector(
        `input[data-row="${row + 1}"][data-col="${col}"]`,
      );
    } else if (row > 0) {
      target = table.querySelector(
        `input[data-row="${row - 1}"][data-col="${col}"]`,
      );
    } else {
      const metas = table.querySelectorAll(
        `input[data-mrow][data-col="${col}"]`,
      );
      target = metas[metas.length - 1] ?? null;
    }
  }
  if (target) {
    target.focus();
    target.select();
  }
};

/** 편집 모델에서 숫자 ID의 다음 값을 결정한다 (자릿수는 기존 최대값에 맞춤). */
const nextStudentId = () => {
  const numeric = editModel.students.filter((s) => /^\d+$/.test(s.id));
  const width = Math.max(4, ...numeric.map((s) => s.id.length));
  const max = Math.max(0, ...numeric.map((s) => Number.parseInt(s.id, 10)));
  return String(max + 1).padStart(width, "0");
};

/** 편집 모달을 연다. pending이 있으면(마법사) 그 골격을, 없으면 현재 데이터를 불러온다. */
const openEditModal = (pending) => {
  if (pending) {
    editModel = {
      nItems: pending.nItems,
      key: [...pending.key],
      numOptions: [...pending.numOptions],
      scored: [...pending.scored],
      students: pending.students.map((s) => ({ id: s.id, resp: [...s.resp] })),
    };
  } else if (currentData) {
    editModel = {
      nItems: currentData.nItems,
      key: [...currentData.key],
      numOptions: [...currentData.numOptions],
      scored: [...currentData.scored],
      students: currentData.students.map((s) => ({
        id: s.id,
        resp: s.resp.map((c) => (c === " " ? "" : c)),
      })),
    };
  } else {
    setStatus("먼저 데이터를 불러오세요.", "error");
    return;
  }
  renderEditGrid();
  $("editModal").hidden = false;
};

/** 편집 모델의 메타 행(정답/답지 수/포함 여부) 하나를 HTML로 만든다. */
const metaRow = (label, values, idFn, mrowIdx) => {
  let html = `<tr><td class="left meta-label">${label}</td>`;
  values.forEach((v, j) => {
    html += `<td><input type="text" maxlength="2" class="grid-input" id="${idFn(j)}" data-mrow="${mrowIdx}" data-col="${j}" value="${escAttr(String(v))}"></td>`;
  });
  return html + "<td></td></tr>";
};

/** 편집 그리드(메타 행 + 학생 행 + 행 삭제 버튼)를 그린다. */
const renderEditGrid = () => {
  const m = editModel;
  $("editInfo").textContent =
    `문항 ${m.nItems}개 · 학생 ${m.students.length}명`;
  let html = "<tr><th>구분 / ID</th>";
  for (let j = 0; j < m.nItems; j++) html += `<th>${j + 1}</th>`;
  html += "<th></th></tr>";
  html += metaRow("정답", m.key, (j) => `editKey${j}`, 0);
  html += metaRow("답지 수", m.numOptions.map(String), (j) => `editOpt${j}`, 1);
  html += metaRow(
    "분석 포함",
    m.scored.map((s) => (s ? "y" : "n")),
    (j) => `editFlag${j}`,
    2,
  );
  m.students.forEach((s, i) => {
    html += `<tr><td class="left"><input type="text" class="grid-input grid-id" data-row="${i}" value="${escAttr(s.id)}"></td>`;
    for (let j = 0; j < m.nItems; j++) {
      html += `<td><input type="text" inputmode="numeric" maxlength="1" class="grid-input" data-row="${i}" data-col="${j}" value="${escAttr(s.resp[j])}"></td>`;
    }
    html += `<td><button class="btn row-del" data-row="${i}" title="행 삭제">✕</button></td></tr>`;
  });
  $("editTable").innerHTML = html;
  $("editTable")
    .querySelectorAll(".row-del")
    .forEach((b) =>
      b.addEventListener("click", () => {
        editModel.students.splice(Number(b.dataset.row), 1);
        renderEditGrid();
      }),
    );
};

/** 편집 그리드의 입력값을 편집 모델로 다시 읽어온다. */
const collectGrid = () => {
  const m = editModel;
  m.key = Array.from({ length: m.nItems }, (_, j) =>
    ($("editKey" + j).value.trim() || " ").slice(0, 1),
  );
  m.numOptions = Array.from(
    { length: m.nItems },
    (_, j) => Number.parseInt($("editOpt" + j).value, 10) || 0,
  );
  m.scored = Array.from(
    { length: m.nItems },
    (_, j) => ($("editFlag" + j).value.trim() || "y").toLowerCase() !== "n",
  );
  m.students.forEach((s, i) => {
    const cells = $("editTable").querySelectorAll(`[data-row="${i}"]`);
    s.id = cells[0].value.trim();
    s.resp = [...cells].slice(1).map((c) => c.value.trim());
  });
};

/** 편집 모델을 분석 데이터 모델로 변환한다. */
const gridToData = (m) => {
  const students = m.students.map((s, i) => ({
    id: s.id || "S" + (i + 1),
    resp: s.resp.map((c) => (c === "" ? " " : c)),
  }));
  if (!students.length) {
    throw new Error(
      "학생 응답 행이 없습니다. '＋ 학생 행 추가'로 추가해 주세요.",
    );
  }
  return {
    nItems: m.nItems,
    key: m.key,
    numOptions: m.numOptions,
    scored: m.scored,
    weights: new Array(m.nItems).fill(1),
    students,
  };
};

/** 편집 내용을 검증·적용하고 분석을 다시 실행한다. */
const applyEdit = () => {
  try {
    collectGrid();
    currentData = gridToData(editModel);
    $("editModal").hidden = true;
    run();
  } catch (err) {
    alert("편집 내용을 적용할 수 없습니다:\n" + err.message);
  }
};

/** HTML 속성 값에 안전하게 들어갈 문자열로 이스케이프한다. */
const escAttr = (v) => String(v).replace(/"/g, "&quot;").replace(/</g, "&lt;");

// ---------- 테마 (Fluent 2 light / dark) ----------

const SUN_ICON =
  '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M8 4.75a3.25 3.25 0 1 0 0 6.5 3.25 3.25 0 0 0 0-6.5zM7.25 0h1.5v2h-1.5zM7.25 14h1.5v2h-1.5zM0 7.25h2v1.5H0zM14 7.25h2v1.5h-2zM2.22 1.16l1.06-1.06 1.42 1.42-1.07 1.06zM11.3 12.24l1.06-1.06 1.42 1.42-1.07 1.06zM12.48 2.58L11.42 1.16l1.42-1.42 1.06 1.06zM1.16 13.66L.1 12.24l1.42-1.42 1.06 1.06z"/></svg>';
const MOON_ICON =
  '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M8.9 1.5a6.5 6.5 0 1 0 5.6 5.6.75.75 0 0 0-1.06-.86 5 5 0 0 1-6.2-6.2.75.75 0 0 0-.86-1.06 6.54 6.54 0 0 0-2.48 2.52z"/></svg>';

/** 테마를 적용하고 저장한다. 차트가 있으면 새 팔레트로 다시 그린다. */
const applyTheme = (theme) => {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem("theme", theme);
  $("themeBtn").innerHTML = theme === "dark" ? SUN_ICON : MOON_ICON;
  $("themeBtn").title =
    theme === "dark" ? "라이트 모드로 전환" : "다크 모드로 전환";
  document
    .querySelector('meta[name="theme-color"]')
    .setAttribute("content", theme === "dark" ? "#1f1f1f" : "#0f6cbd");
  if (currentResult) renderChart();
};

applyTheme(
  localStorage.getItem("theme") ??
    (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"),
);
$("themeBtn").addEventListener("click", () =>
  applyTheme(
    document.documentElement.dataset.theme === "dark" ? "light" : "dark",
  ),
);

/** 텍스트를 파일로 내려받는다. */
const downloadFile = (name, content, mime) => {
  const blob = new Blob([content], { type: mime });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
};

// ---------- 렌더링: 각 탭 ----------

/** 입력 데이터 탭: 원본 응답 행렬과 KEY/OPTIONS/INCLUDE 메타를 표로 그린다. */
const renderInput = () => {
  const d = currentData;
  const included = d.scored.filter(Boolean).length;
  $("inputSummary").textContent =
    `학생 ${d.students.length}명 · 문항 ${d.nItems}개 · 분석 포함 ${included}문항 · 총점 만점 ${included}점`;
  let html = "<tr><th>No</th><th>ID</th>";
  for (let j = 0; j < d.nItems; j++) html += `<th>${j + 1}</th>`;
  html += "</tr>";
  html +=
    '<tr><td></td><td class="left">정답 (KEY)</td>' +
    d.key.map((k) => `<td>${k === " " ? "-" : k}</td>`).join("") +
    "</tr>";
  html +=
    '<tr><td></td><td class="left">답지 수</td>' +
    d.numOptions.map((o) => `<td>${o || "-"}</td>`).join("") +
    "</tr>";
  html +=
    '<tr><td></td><td class="left">분석 포함</td>' +
    d.scored.map((s) => `<td>${s ? "y" : "n"}</td>`).join("") +
    "</tr>";
  d.students.forEach((s, i) => {
    html +=
      `<tr><td>${i + 1}</td><td class="left">${s.id}</td>` +
      s.resp.map((r) => `<td>${r === " " ? "-" : r}</td>`).join("") +
      "</tr>";
  });
  $("inputTable").innerHTML = html;
};

/** 점수 탭: 전체 통계 요약과 학생별 석차 표를 그린다. */
const renderScores = () => {
  const st = currentResult.stats;
  const r = currentResult;
  $("scoreSummary").innerHTML =
    `피험자 ${st.n}명 · 평균 ${st.mean.toFixed(2)} · 표준편차 ${st.sd.toFixed(2)} · 분산 ${st.variance.toFixed(2)} · ` +
    `최저 ${st.min} · 최고 ${st.high} · 중앙값 ${st.median} · 왜도 ${st.skewness.toFixed(3)} · 첨도 ${st.kurtosis.toFixed(3)}<br>` +
    `평균난이도 ${st.meanDifficulty.toFixed(3)} · 평균변별도 ${st.meanDiscrimination.toFixed(3)} · ` +
    `Cronbach α ${st.reliability.toFixed(3)} · 측정오차 ${st.sem.toFixed(3)} · ` +
    `상위 27% ${r.upper.n}명(${r.upper.min}~${r.upper.max}점) · 하위 27% ${r.lower.n}명(${r.lower.min}~${r.lower.max}점)`;
  let html =
    "<tr><th>순위</th><th>ID</th><th>점수</th><th>백분율(%)</th><th>정답 문항수</th></tr>";
  [...currentResult.students]
    .sort((a, b) => a.rank - b.rank)
    .forEach((s) => {
      html +=
        `<tr><td>${s.rank}</td><td>${s.id}</td><td>${s.raw}</td>` +
        `<td>${s.percent.toFixed(1)}</td><td>${s.correctCount}</td></tr>`;
    });
  $("scoreTable").innerHTML = html;
};

/** 문항 탭: 선택된 정렬 기준으로 문항별 통계 표를 그린다. */
const renderItems = () => {
  const mode = $("itemSort").value;
  const items = [...currentResult.items];
  if (mode === "diffAsc") items.sort((a, b) => a.difficulty - b.difficulty);
  else if (mode === "diffDesc")
    items.sort((a, b) => b.difficulty - a.difficulty);
  else if (mode === "discDesc")
    items.sort((a, b) => b.discrimination - a.discrimination);
  let html =
    "<tr><th>문항</th><th>정답</th><th>정답자</th><th>무응답</th>" +
    "<th>난이도(p)</th><th>문항상관계수</th><th>상위 정답률</th><th>하위 정답률</th><th>변별도(D)</th><th>제외 시 α</th></tr>";
  items.forEach((it) => {
    const negFlag = it.pointBiserial < 0 ? " ◀부정 변별문항" : "";
    html +=
      `<tr><td>${it.index}</td><td>${it.key === " " ? "-" : it.key}</td>` +
      `<td>${it.correct}</td><td>${it.blank}</td><td>${(it.difficulty * 100).toFixed(1)}%</td>` +
      `<td>${it.pointBiserial.toFixed(2)}${negFlag}</td>` +
      `<td>${(it.pUpper * 100).toFixed(1)}%</td><td>${(it.pLower * 100).toFixed(1)}%</td>` +
      `<td>${it.discrimination.toFixed(2)}</td><td>${it.alphaIfDeleted.toFixed(3)}</td></tr>`;
  });
  $("itemTable").innerHTML = html;
};

/** 답지 분석 탭의 문항 선택 <select>를 채운다. */
const renderOptionSelect = () => {
  $("optionItem").innerHTML = currentResult.items
    .map((it) => `<option value="${it.index - 1}">${it.index}번</option>`)
    .join("");
};

/** 답지 분석 탭: 선택 문항의 답지별 응답 통계 표를 그린다. */
const renderOptions = () => {
  const idx = Number($("optionItem").value) || 0;
  const it = currentResult.items[idx];
  if (!it) return;
  $("optionSummary").textContent =
    `${it.index}번 문항 · 정답 ${it.key} · 난이도 ${(it.difficulty * 100).toFixed(1)}% · 변별도 ${it.discrimination.toFixed(2)}`;
  let html =
    "<tr><th>답지</th><th>정답</th><th>응답비율 전체</th><th>상위 27%</th>" +
    "<th>하위 27%</th><th>답지-총점 상관계수</th><th>비고</th></tr>";
  it.options.forEach((o) => {
    const note = o.isKey ? "*" : o.attractive ? "◀ 더 매력적임" : "";
    html +=
      `<tr><td>${o.option}</td><td>${o.isKey ? "*" : ""}</td>` +
      `<td>${(o.propAll * 100).toFixed(1)}%</td>` +
      `<td>${(o.propUpper * 100).toFixed(1)}%</td><td>${(o.propLower * 100).toFixed(1)}%</td>` +
      `<td>${o.pbis.toFixed(2)}</td><td>${note}</td></tr>`;
  });
  $("optionTable").innerHTML = html;
};

// ---------- 렌더링: 그래프 ----------

let chartHits = []; // 툴팁 히트 영역 {x0, x1, info}

/** 그래프 모드에 맞는 라벨·값·포맷터를 준비한다. */
const chartSeries = (mode) => {
  if (mode !== "score" && mode !== "cum") {
    return {
      labels: currentResult.items.map((it) => it.index),
      values: currentResult.items.map((it) =>
        mode === "diff" ? it.difficulty * 100 : it.discrimination,
      ),
      fmt: (v) => v.toFixed(1),
      asLine: false,
    };
  }
  const st = currentResult.stats;
  const counts = new Map();
  currentResult.students.forEach((s) =>
    counts.set(s.raw, (counts.get(s.raw) ?? 0) + 1),
  );
  const labels = Array.from(
    { length: st.high - st.min + 1 },
    (_, i) => st.min + i,
  );
  if (mode === "score") {
    return {
      labels,
      values: labels.map((l) => counts.get(l) ?? 0),
      fmt: (v) => v.toFixed(0),
      asLine: true,
      counts,
    };
  }
  let cum = 0;
  return {
    labels,
    values: labels.map((l) => {
      cum += counts.get(l) ?? 0;
      return st.n ? (cum / st.n) * 100 : 0;
    }),
    fmt: (v) => v.toFixed(1),
    asLine: true,
    counts,
  };
};

/** 현재 테마에 맞는 차트 팔레트를 반환한다. */
const chartPalette = () =>
  document.documentElement.dataset.theme === "dark"
    ? {
        brand: "#4cc2ff",
        neg: "#ff99a4",
        title: "#ffffff",
        axis: "#adadad",
        value: "#d6d6d6",
        grid: "#404040",
        axisLine: "#575757",
      }
    : {
        brand: "#0f6cbd",
        neg: "#c42b1c",
        title: "#242424",
        axis: "#616161",
        value: "#424242",
        grid: "#e0e0e0",
        axisLine: "#d1d1d1",
      };

/** 캔버스에 난이도/변별도/도수/누가 그래프를 그린다. */
const renderChart = () => {
  const canvas = $("chart");
  const dpr = window.devicePixelRatio ?? 1;
  const w = Math.max(320, canvas.getBoundingClientRect().width || 900);
  const h = w < 640 ? 300 : 400;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  canvas.style.height = h + "px";
  const ctx = canvas.getContext("2d");
  const P = chartPalette();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  const mode = $("graphMode").value;
  chartHits = [];
  const { labels, values, fmt, asLine, counts } = chartSeries(mode);

  const padL = 52;
  const padR = 20;
  const padT = 34;
  const padB = 40;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;
  const maxV = Math.max(...values, 0.001);
  const minV = Math.min(0, ...values);
  const y = (v) => padT + plotH * (1 - (v - minV) / (maxV - minV || 1));
  const title =
    mode === "diff"
      ? "문항 난이도 (정답률 %)"
      : mode === "disc"
        ? "문항 변별도 (D)"
        : mode === "score"
          ? "검사점수의 도수"
          : "검사점수의 누가 백분율 (%)";

  ctx.fillStyle = P.title;
  ctx.font = "600 13px 'Segoe UI', sans-serif";
  ctx.fillText(title, padL, 18);

  // y축 눈금·그리드 + 수치 라벨
  const steps = 5;
  ctx.font = "10px 'Segoe UI', sans-serif";
  for (let i = 0; i <= steps; i++) {
    const v = minV + ((maxV - minV) * i) / steps;
    const yy = y(v);
    ctx.strokeStyle = i === 0 ? P.axisLine : P.grid;
    ctx.beginPath();
    ctx.moveTo(padL, yy);
    ctx.lineTo(w - padR, yy);
    ctx.stroke();
    ctx.fillStyle = P.axis;
    ctx.textAlign = "right";
    ctx.fillText(fmt(v), padL - 6, yy + 3);
  }
  ctx.textAlign = "left";

  /** 데이터 포인트 위에 값을 표시한다. */
  const valText = (v, x, yy) => {
    ctx.fillStyle = P.value;
    ctx.font = "600 10px 'Segoe UI', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(fmt(v), x, yy - 4);
    ctx.textAlign = "left";
  };

  if (asLine) {
    // 도수/누가: 꺾은선 + 포인트 + 툴팁 히트 영역
    const dx = values.length > 1 ? plotW / (values.length - 1) : 0;
    const px = (i) => padL + i * dx;
    const step = Math.max(1, Math.ceil(values.length / 20));
    const st = currentResult.stats;
    ctx.strokeStyle = P.brand;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    values.forEach((v, i) =>
      i === 0 ? ctx.moveTo(px(i), y(v)) : ctx.lineTo(px(i), y(v)),
    );
    ctx.stroke();
    values.forEach((v, i) => {
      const c = counts.get(labels[i]) ?? 0;
      chartHits.push({
        x0: px(i) - dx / 2,
        x1: px(i) + dx / 2,
        info:
          mode === "score"
            ? `점수 ${labels[i]} · ${c}명 (${st.n ? ((c / st.n) * 100).toFixed(1) : 0}%)`
            : `점수 ${labels[i]} 이하 · 누가 ${v.toFixed(1)}%`,
      });
      ctx.beginPath();
      ctx.arc(px(i), y(v), 2.5, 0, Math.PI * 2);
      ctx.fillStyle = P.brand;
      ctx.fill();
      if (i % step === 0) {
        valText(v, px(i), y(v));
        ctx.fillStyle = P.axis;
        ctx.font = "10px 'Segoe UI', sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(labels[i], px(i), h - padB + 14);
        ctx.textAlign = "left";
      }
    });
  } else {
    // 난이도/변별도: 막대 그래프 + 툴팁 히트 영역
    const colW = plotW / values.length;
    const bw = Math.max(2, colW - 4);
    values.forEach((v, i) => {
      const x = padL + i * colW + 2;
      const it = currentResult.items[i];
      chartHits.push({
        x0: padL + i * colW,
        x1: padL + (i + 1) * colW,
        info:
          mode === "diff"
            ? `문항 ${it.index} · 정답 ${it.key === " " ? "-" : it.key}\n난이도 ${(it.difficulty * 100).toFixed(1)}% · 변별도 ${it.discrimination.toFixed(2)}`
            : `문항 ${it.index} · 정답 ${it.key === " " ? "-" : it.key}\n변별도 ${it.discrimination.toFixed(2)} · 난이도 ${(it.difficulty * 100).toFixed(1)}%`,
      });
      const yy = y(Math.max(v, 0));
      const bh = y(Math.min(v, 0)) - yy;
      ctx.fillStyle = v < 0 ? P.neg : P.brand;
      ctx.fillRect(x, yy, bw, Math.max(bh, 1));
      if (values.length <= 40) {
        valText(v, x + bw / 2, yy);
        ctx.fillStyle = P.axis;
        ctx.font = "10px 'Segoe UI', sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(labels[i], x + bw / 2, h - padB + 14);
        ctx.textAlign = "left";
      }
    });
  }
};

/** 그래프 탭 아래의 도수·누가 분포 표를 그린다. */
const renderGraphTable = () => {
  if (!currentResult) {
    $("graphTable").innerHTML = "";
    return;
  }
  const st = currentResult.stats;
  const counts = new Map();
  currentResult.students.forEach((s) =>
    counts.set(s.raw, (counts.get(s.raw) ?? 0) + 1),
  );
  let html =
    "<tr><th>점수</th><th>피험자 수</th><th>백분율(x)</th><th>누가 피험자 수</th><th>누가 백분율(x)</th></tr>";
  let cum = 0;
  for (let sc = st.min; sc <= st.high; sc++) {
    const c = counts.get(sc) ?? 0;
    cum += c;
    html +=
      `<tr><td>${sc}</td><td>${c}</td><td>${(st.n ? (c / st.n) * 100 : 0).toFixed(2)}</td>` +
      `<td>${cum}</td><td>${(st.n ? (cum / st.n) * 100 : 0).toFixed(2)}</td></tr>`;
  }
  $("graphTable").innerHTML = html;
};

// ---------- 차트 툴팁 ----------

const chartTip = document.createElement("div");
chartTip.className = "chart-tip";
chartTip.hidden = true;
document.body.appendChild(chartTip);

/** 마우스 위치의 히트 영역을 찾아 툴팁을 표시한다 (화면 가장자리 자동 회피). */
const showChartTip = (e) => {
  const rect = $("chart").getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const hit = chartHits.find((hh) => mx >= hh.x0 && mx <= hh.x1);
  if (!hit) {
    chartTip.hidden = true;
    return;
  }
  chartTip.textContent = hit.info;
  chartTip.hidden = false;
  const tw = chartTip.offsetWidth;
  const th = chartTip.offsetHeight;
  let tx = e.clientX + 14;
  let ty = e.clientY - th - 10;
  if (tx + tw > window.innerWidth - 8) tx = e.clientX - tw - 14;
  if (ty < 8) ty = e.clientY + 16;
  chartTip.style.left = tx + "px";
  chartTip.style.top = ty + "px";
};

// ---------- 이벤트 연결 ----------

$("chart").addEventListener("mousemove", showChartTip);
$("chart").addEventListener("mouseleave", () => (chartTip.hidden = true));
document.querySelectorAll(".modal").forEach((m) =>
  m.addEventListener("click", (e) => {
    if (e.target === m) m.hidden = true;
  }),
);
document.querySelectorAll(".dialog-close").forEach((b) =>
  b.addEventListener("click", () => {
    b.closest(".modal").hidden = true;
  }),
);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    document
      .querySelectorAll(".modal:not([hidden])")
      .forEach((m) => (m.hidden = true));
    closeMenus();
  }
});
$("loadDemo").addEventListener("click", loadDemo);
$("newData").addEventListener("click", openNewModal);
$("newBuild").addEventListener("click", wizApplyCount);
$("newGenerate").addEventListener("click", wizConfirm);
$("newTable").addEventListener("keydown", (e) => gridKeyNav(e, "newTable"));
$("editTable").addEventListener("keydown", (e) => gridKeyNav(e, "editTable"));

/** 숫자 전용 그리드 셀에서 숫자가 아닌 입력을 즉시 제거한다. */
const digitOnly = (e) => {
  const t = e.target;
  if (t.tagName !== "INPUT" || !t.classList.contains("grid-input")) return;
  if ((t.id || "").startsWith("editFlag") || t.dataset.col === "flag") return;
  const v = t.value.replace(/[^0-9]/g, "");
  if (v !== t.value) t.value = v;
};
$("newTable").addEventListener("input", digitOnly);
$("editTable").addEventListener("input", digitOnly);

/** 파일 내용을 지정 인코딩의 텍스트로 읽는 Promise 래퍼. */
const readAsText = (file, encoding) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("파일을 읽을 수 없습니다."));
    reader.readAsText(file, encoding);
  });

/** 확장자와 내용(첫 줄 형태)으로 CSV / .dat 형식을 판별한다. */
const detectFormat = (name, text) => {
  const ext = name.toLowerCase().split(".").pop();
  if (ext === "csv") return "csv";
  if (ext === "dat") return "dat";
  const firstLine = text
    .replace(/^\uFEFF/, "")
    .trimStart()
    .split(/\r?\n/)[0];
  if (/^id\b/i.test(firstLine)) return "csv";
  if (/^\d+(\s+\d+)?\s*$/.test(firstLine)) return "dat";
  return "csv";
};

/** 불러오기: CSV / .dat를 자동 판별해 파싱하고 분석을 실행한다. */
const importFile = async (file) => {
  try {
    const utf8 = await readAsText(file, "utf-8");
    const format = detectFormat(file.name, utf8);
    const text = format === "dat" ? await readAsText(file, "latin1") : utf8;
    currentData = format === "dat" ? parseDatText(text) : parseDataCsv(text);
    run();
  } catch (err) {
    setStatus(err.message, "error");
  }
};

// ---------- 드롭다운 메뉴 공통 동작 (Fluent menu 패턴) ----------

const dropdowns = [
  {
    btns: [$("importBtn"), $("importChev")],
    menu: $("importMenu"),
  },
  {
    btns: [$("exportBtn"), $("exportChev")],
    menu: $("exportMenu"),
  },
];

/** 메뉴 하나의 열림 상태와 스플릿 버튼 표시(aria-expanded, 셰브론 회전)를 갱신한다. */
const setMenuOpen = ({ btns, menu }, show) => {
  menu.hidden = !show;
  btns.forEach((btn) => {
    btn.setAttribute("aria-expanded", String(show));
    btn.classList.toggle("open", show);
  });
};

/** 열려 있는 모든 드롭다운을 닫는다. */
const closeMenus = () => dropdowns.forEach((d) => setMenuOpen(d, false));

/** 스플릿 버튼 클릭: 해당 메뉴만 토글하고, 열릴 때 첫 항목에 포커스를 준다. */
const toggleMenu = (d) => {
  const show = d.menu.hidden;
  closeMenus();
  if (show) {
    setMenuOpen(d, true);
    d.menu.querySelector(".menu-item")?.focus();
  }
};
dropdowns.forEach((d) =>
  d.btns.forEach((btn) => btn.addEventListener("click", () => toggleMenu(d))),
);

// 바깥 클릭(터치 포함) 시 닫기 — pointerdown이라 드래그 후 놓아도 정확히 닫힌다
document.addEventListener("pointerdown", (e) => {
  if (
    !dropdowns.some(
      ({ btns, menu }) =>
        btns.some((btn) => btn.contains(e.target)) || menu.contains(e.target),
    )
  ) {
    closeMenus();
  }
});

// 키보드 탐색: ↓/↑로 항목 이동, Escape로 닫기 (기존 모달 닫기와 함께 처리)
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    closeMenus();
    return;
  }
  if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
  const open = dropdowns.find((d) => !d.menu.hidden);
  if (!open) return;
  e.preventDefault();
  const items = [...open.menu.querySelectorAll(".menu-item")];
  const idx = items.indexOf(document.activeElement);
  const next =
    e.key === "ArrowDown"
      ? (idx + 1) % items.length
      : (idx - 1 + items.length) % items.length;
  items[next].focus();
});

// 불러오기 메뉴: 형식에 맞는 파일 필터로 선택 다이얼로그를 연다
const pickFile = (accept) => {
  closeMenus();
  $("fileInput").accept = accept;
  $("fileInput").click();
};
$("importCsv").addEventListener("click", () => pickFile(".csv,.txt"));
$("importDat").addEventListener("click", () => pickFile(".dat,.txt"));
$("fileInput").addEventListener("change", (e) => {
  const file = e.target.files[0];
  e.target.value = "";
  if (file) importFile(file);
});

/** 내보낼 데이터가 없으면 안내하고, 있으면 주어진 직렬화 함수로 내려받는다. */
const exportAs = (build) => {
  if (!currentData) {
    setStatus("내보낼 데이터가 없습니다.", "error");
    return;
  }
  build(currentData);
};

// 내보내기 메뉴
$("exportCsv").addEventListener("click", () => {
  closeMenus();
  exportAs((d) =>
    downloadFile(
      "responses.csv",
      "\uFEFF" + buildDataCsv(d),
      "text/csv;charset=utf-8",
    ),
  );
});
$("exportDat").addEventListener("click", () => {
  closeMenus();
  exportAs((d) =>
    downloadFile("responses.dat", buildDatText(d), "text/plain;charset=latin1"),
  );
});
$("newCancel").addEventListener("click", () => ($("newModal").hidden = true));
$("editData").addEventListener("click", () => openEditModal(null));
$("addStudent").addEventListener("click", () => {
  editModel.students.push({
    id: nextStudentId(),
    resp: new Array(editModel.nItems).fill(""),
  });
  renderEditGrid();
});
$("editApply").addEventListener("click", applyEdit);
$("editCancel").addEventListener("click", () => ($("editModal").hidden = true));
$("aboutBtn").addEventListener("click", () => ($("aboutModal").hidden = false));
$("aboutClose").addEventListener(
  "click",
  () => ($("aboutModal").hidden = true),
);
$("itemSort").addEventListener("change", renderItems);
$("graphMode").addEventListener("change", () => {
  renderChart();
  renderGraphTable();
});
$("optionItem").addEventListener("change", renderOptions);

// 탭 전환
document.querySelectorAll("#tabs button").forEach((btn) => {
  btn.addEventListener("click", () => {
    document
      .querySelectorAll("#tabs button")
      .forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    ["input", "score", "item", "option", "graph"].forEach((t) => {
      $("tab-" + t).hidden = t !== btn.dataset.tab;
    });
    if (btn.dataset.tab === "graph") {
      renderChart();
      renderGraphTable();
    }
  });
});
