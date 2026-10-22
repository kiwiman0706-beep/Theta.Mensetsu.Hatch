"use strict";
// The one screen of Theta Mensetsu Hatch, shared by the PC app (desktop/) and the browser version
// (web/). It talks to the device only through Native.call(JSON) → window.onNative({type, data}).
const $ = (id) => document.getElementById(id),
  esc = (x) =>
    String(x ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
const paths = {
  doc: "M6 3h9l4 4v14H6z M15 3v4h4 M9 12h7 M9 16h7 M9 8h3",
  search: "M10 3a7 7 0 1 0 0 14a7 7 0 0 0 0-14 M15 15l6 6",
  plus: "M12 4v16 M4 12h16",
  camera: "M3 7h4l2-3h6l2 3h4v13H3z M12 9a4 4 0 1 0 0 8a4 4 0 0 0 0-8",
  folder: "M3 6h7l2 2h9v12H3z M3 6V4h7l2 2",
  image: "M3 3h18v18H3z M3 17l6-6 4 4 3-3 5 5 M15 7h.1",
  grid: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
  list: "M8 6h13 M8 12h13 M8 18h13 M3 6h.1 M3 12h.1 M3 18h.1",
  table: "M3 4h18v16H3z M3 9h18 M3 14h18 M10 4v16",
  back: "M15 5l-7 7 7 7",
  next: "M9 5l7 7-7 7",
  help: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18 M9.6 9.2a2.5 2.5 0 1 1 3.4 2.3c-.6.3-1 .8-1 1.5v.5 M12 16.8v.2",
  edit: "M4 16l12-12 4 4L8 20H4z M13 7l4 4",
  check: "M4 12l5 5L20 6",
  trash: "M3 6h18 M8 6V3h8v3 M5 6l1 15h12l1-15 M10 10v7 M14 10v7",
  rotate: "M20 8A8 8 0 1 0 20 16 M20 3v5h-5",
  download: "M12 3v13 M7 11l5 5 5-5 M4 17v4h16v-4",
  spark: "M12 2l3 7 7 3-7 3-3 7-3-7-7-3 7-3z",
  user: "M12 3a4 4 0 1 0 0 8a4 4 0 0 0 0-8 M4 21v-3a8 5 0 0 1 16 0v3",
  users: "M9 4a3.5 3.5 0 1 0 0 7a3.5 3.5 0 0 0 0-7 M2 20v-2a7 4.5 0 0 1 14 0v2 M16 4.5a3 3 0 0 1 0 6 M18 14.5c2.4.6 4 2 4 3.5v2",
  cloud: "M6 18a5 5 0 0 1-1-10 7 7 0 0 1 14-1 5 5 0 0 1-1 11 M12 20V10 M8 14l4-4 4 4",
  link: "M10 7l3-3a5 5 0 0 1 7 7l-3 3 M14 17l-3 3a5 5 0 0 1-7-7l3-3 M8 16l8-8",
  close: "M5 5l14 14 M19 5L5 19",
  share: "M12 16V3 M7 8l5-5 5 5 M5 12v9h14v-9",
  clock: "M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18 M12 7v5l3 2",
  cal: "M4 5h16v16H4z M4 10h16 M9 3v4 M15 3v4",
  more: "M5 12h.1 M12 12h.1 M19 12h.1",
  menu: "M4 6h16 M4 12h16 M4 18h16",
  phone: "M5 3h4l2 5-3 2a11 11 0 0 0 6 6l2-3 5 2v4a2 2 0 0 1-2 2A17 17 0 0 1 3 5a2 2 0 0 1 2-2",
  mail: "M3 5h18v14H3z M3 6l9 7 9-7",
  map: "M12 21s-7-6-7-12a7 7 0 0 1 14 0c0 6-7 12-7 12 M12 7a2 2 0 1 0 0 4a2 2 0 0 0 0-4",
  tag: "M3 12V3h9l9 9-9 9z M7.5 7.5h.1",
  mic: "M9 4a3 3 0 0 1 6 0v8a3 3 0 0 1-6 0z M5 10v2a7 7 0 0 0 14 0v-2 M12 19v3 M8 22h8",
  stop: "M6 6h12v12H6z",
  star: "M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z",
};
const icon = (k) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${paths[k] || paths.doc}"/></svg>`;

// ---- Record fields ------------------------------------------------------------------------
const STAGES = [
  ["received", "書類受付"],
  ["scheduled", "面接予定"],
  ["interviewed", "面接済み"],
  ["hold", "保留"],
  ["offered", "内定"],
  ["hired", "採用"],
  ["rejected", "不採用"],
  ["declined", "辞退"],
];
const stageLabel = (s) => (STAGES.find((x) => x[0] === s) || STAGES[0])[1];
const ACTIVE = ["received", "scheduled", "interviewed", "hold"];
// Edit form: [field, label, kind]. kind: text (default), date, datetime, area (a few lines), long
// (paragraphs), category, stage, rating.
const groups = [
  ["応募", [
    ["category", "職種", "category"],
    ["position", "応募職種・希望部署（書類の記載）"],
    ["employment", "雇用形態（常勤・パートなど）"],
    ["appliedDate", "応募日", "date"],
    ["source", "応募経路（求人サイト・ハローワーク・紹介会社など）"],
    ["agency", "紹介会社（紹介会社経由のとき）"],
    ["agencyContact", "紹介会社の担当者・連絡先"],
    ["agencyFee", "紹介手数料・返金規定", "area"],
    ["stage", "選考状況", "stage"],
    ["interview", "面接日時", "datetime"],
    ["interviewers", "面接担当"],
    ["rating", "評価", "rating"],
  ]],
  ["採否・入職", [
    ["decisionDate", "採否決定日", "date"],
    ["decisionNote", "採否の理由・本人への連絡", "long"],
    ["hireDate", "入職日", "date"],
    ["department", "配属先"],
  ]],
  ["本人", [
    ["name", "氏名"],
    ["kana", "ふりがな"],
    ["birthDate", "生年月日", "date"],
    ["gender", "性別（記載があれば）"],
    ["postal", "郵便番号"],
    ["address", "住所", "area"],
    ["mobile", "携帯電話", "area"],
    ["phone", "電話", "area"],
    ["email", "メール", "area"],
    ["commute", "通勤（時間・手段）", "area"],
    ["commuteCost", "通勤費（概算）"],
    ["startDate", "入職可能日", "date"],
  ]],
  ["学歴・職歴・資格", [
    ["education", "学歴", "history"],
    ["career", "職歴", "history"],
    ["licenses", "免許・資格", "history"],
  ]],
  ["志望動機など", [
    ["motivation", "志望動機", "long"],
    ["selfPr", "自己PR・特技", "long"],
    ["wishes", "本人希望（勤務時間・給与など）", "long"],
    ["tags", "タグ（読点区切り）"],
  ]],
];
const FIELDS = groups.flatMap(([, f]) => f.map((x) => x[0]));
const labelOf = Object.fromEntries(groups.flatMap(([, f]) => f.map(([k, l]) => [k, l.replace(/（.*）$/, "")])));

let state = { people: [], categories: [], model: "gemini-2.5-flash", format: "legacy" },
  route = "home",
  selected = "",
  query = "",
  filter = "active",
  catFilter = "",
  sort = "applied",
  layout = "cards",
  mode = "file",
  draft = null,
  noteDraft = "",
  editNoteId = "",
  pendingOpen = "",
  pendingEdit = "",
  pendingRender = false,
  modalOpen = false,
  settingsDraft = null;
const call = (action, params = {}) => {
  if (window.Native) Native.call(JSON.stringify({ action, ...params }));
  else toast("アプリで利用できます");
};
const getPerson = () => state.people.find((p) => p.id === selected),
  title = (p) => p.name || p.suggestion?.name || "氏名未登録",
  job = (p) => p.category || p.suggestion?.category || "職種未設定",
  // Features differ by platform (docs/THETA_HATCH_SPEC.md §4.1).
  can = (cap) => !Array.isArray(state.caps) || state.caps.includes(cap),
  only = (cap, html) => (can(cap) ? html : ""),
  img = (f) => "media/" + encodeURIComponent(f),
  status = (p) => ({ new: "未読み取り", review: "要確認", confirmed: "確認済み" })[p.status] || "未読み取り";
const pad2 = (n) => String(n).padStart(2, "0");
const localDay = (d = new Date()) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
function age(birth) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birth || "");
  if (!m) return "";
  const t = new Date();
  let a = t.getFullYear() - m[1];
  if (t.getMonth() + 1 < +m[2] || (t.getMonth() + 1 === +m[2] && t.getDate() < +m[3])) a--;
  return a >= 0 && a < 130 ? a : "";
}
const WD = ["日", "月", "火", "水", "木", "金", "土"];
// "2026-11-05 14:00" → "11/5(木) 14:00"
function when(v, withYear = false) {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}:\d{2}))?/.exec(v || "");
  if (!m) return "";
  const d = new Date(+m[1], m[2] - 1, +m[3]);
  return `${withYear ? m[1] + "/" : ""}${+m[2]}/${+m[3]}(${WD[d.getDay()]})${m[4] ? " " + m[4] : ""}`;
}
const stars = (r) => (+r ? "★".repeat(+r) + "☆".repeat(5 - +r) : "");
function hue(s) {
  let h = 0;
  for (const ch of String(s || "")) h = (h * 31 + ch.codePointAt(0)) % 360;
  return h;
}
function avatar(p, cls = "") {
  if (p.portrait) return `<img loading="lazy" class="face ${cls}" src="${img(p.portrait)}" alt="顔写真">`;
  const h = hue(p.category || "?");
  return `<div class="face letter ${cls}" style="background:hsl(${h} 35% 90%);color:hsl(${h} 40% 28%)">${esc(title(p).slice(0, 1))}</div>`;
}
const stageBadge = (p) => `<span class="badge st-${esc(p.stage || "received")}">${stageLabel(p.stage)}</span>`;

function toast(t) {
  $("toast").textContent = t;
  $("toast").style.display = "block";
  clearTimeout(window.toastTimer);
  window.toastTimer = setTimeout(() => ($("toast").style.display = "none"), 4200);
}
function modal(html, viewer = false) {
  modalOpen = true;
  dupOpen = false;
  $("modal").innerHTML = `<div class="sheetback ${viewer ? "viewer" : ""}" onclick="if(event.target===this)closeModal()"><div class="sheet" role="dialog"><button class="close" onclick="closeModal()" aria-label="閉じる">${icon("close")}</button>${html}</div></div>`;
}
function closeModal() {
  if (sk && sk.dirty && !confirm("手書きメモを保存せずに閉じますか？")) return;
  sk = null;
  if (recorder) recorder.stop(); // closing the sheet saves the recording
  camStop();
  modalOpen = false;
  dupOpen = false;
  $("modal").innerHTML = "";
}
function report(t) {
  modal(`<h2>お知らせ</h2><p class="pre">${esc(t)}</p><button class="primary full gap" onclick="closeModal()">OK</button>`);
}

// ---- Navigation -----------------------------------------------------------------------------
function go(r) {
  if (route === "edit" && draft && !confirm("未保存の編集を破棄して移動しますか？")) return;
  draft = null;
  noteDraft = "";
  editNoteId = "";
  settingsDraft = null;
  route = r;
  dupOrigin = dupReturn = false;
  closeModal();
  render();
  window.scrollTo(0, 0);
}
function openPerson(id, ev) {
  // Ctrl / Shift / middle click on the PC: the applicant in a window of its own.
  if (ev && can("windows") && (ev.ctrlKey || ev.metaKey || ev.shiftKey || ev.button === 1)) {
    ev.preventDefault();
    return openWindow(id);
  }
  if (route === "edit" && draft && !confirm("未保存の編集を破棄しますか？")) return;
  dupOrigin = dupReturn = false;
  selected = id;
  draft = null;
  noteDraft = "";
  editNoteId = "";
  closeModal();
  call("opened", { id });
  if (getPerson()?.suggestion) return beginEdit();
  route = "detail";
  render();
  window.scrollTo(0, 0);
}
function addButton() {
  return can("scan")
    ? `<button class="shutter" onclick="importSheet('scan')" aria-label="履歴書を撮影・取り込み">${icon("camera")}<span>取り込む</span></button>`
    : `<button class="shutter" onclick="importSheet('pick')" aria-label="履歴書を取り込む" title="PDF・画像をこの画面にドラッグ＆ドロップしても取り込めます">${icon("plus")}<span>取り込む</span></button>`;
}
function nav() {
  if (solo) return "";
  const onList = ["home", "detail", "edit"].includes(route);
  const onMenu = ["menu", "gemini"].includes(route);
  return `<nav class="nav"><button class="${onList ? "active" : ""}" onclick="go('home')">${icon("users")}応募者</button>${addButton()}<button class="${onMenu ? "active" : ""}" onclick="go('menu')">${icon("menu")}メニュー</button></nav>`;
}
function render() {
  pendingRender = false;
  const page = route === "home" ? home() : route === "menu" ? menuPage() : route === "gemini" ? geminiPage() : route === "edit" ? editPage() : detail();
  $("app").innerHTML = `<main class="shell">${page}</main>${nav()}`;
}
// A background update (sync, reading) must not take the cursor away from what is being typed.
function typing() {
  const a = document.activeElement;
  return !!(a && $("app").contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && a.id !== "search" && !["checkbox", "radio"].includes(a.type));
}
document.addEventListener("focusout", () =>
  setTimeout(() => {
    if (pendingRender && !typing()) render();
  }, 0),
);
function backbar(text, right = "") {
  return `<div class="backbar"><button onclick="handleBack()" aria-label="戻る">${icon("back")}</button><h2>${text}</h2>${right}</div>`;
}
// Sync status, shown on the home screen: people working on several PCs see it is up to date.
function syncPill() {
  if (!can("sync")) return "";
  if (state.syncMode === "folder")
    return `<button class="pill" onclick="syncSheet()" title="${esc(state.vaultPath || "")}">${icon("folder")}フォルダ同期</button>`;
  if (!state.syncEnabled) return `<button class="pill off" onclick="syncSheet()">${icon("cloud")}同期オフ</button>`;
  if (state.syncing) return `<button class="pill" onclick="syncSheet()"><i class="spin"></i>同期中</button>`;
  if (state.syncError) return `<button class="pill warn" onclick="syncSheet()">${icon("cloud")}⚠ 同期</button>`;
  const t = state.lastSync ? new Date(state.lastSync).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" }) : "—";
  return `<button class="pill ok" onclick="call('syncNow')" title="押すと今すぐ同期">${icon("check")}同期 ${t}</button>`;
}

// ---- List -------------------------------------------------------------------------------
const FILTERS = [
  ["active", "選考中", (p) => ACTIVE.includes(p.stage || "received")],
  ["scheduled", "面接予定", (p) => p.stage === "scheduled"],
  ["interviewed", "面接済み", (p) => p.stage === "interviewed" || p.stage === "hold"],
  ["offered", "内定・採用", (p) => p.stage === "offered" || p.stage === "hired"],
  ["staff", "職員（採用済み）", (p) => p.stage === "hired"],
  ["onboarding", "手続き中", (p) => (p.checklist || []).some((c) => !c.done)],
  ["agency", "紹介会社経由", (p) => !!String(p.agency || "").trim()],
  ["closed", "不採用・辞退", (p) => p.stage === "rejected" || p.stage === "declined"],
  ["review", "要確認", (p) => p.status !== "confirmed" || !!p.suggestion],
  ["all", "すべて", () => true],
];
function filtered(ignoreFilter = false) {
  const q = query.toLocaleLowerCase();
  const f = FILTERS.find((x) => x[0] === filter) || FILTERS[0];
  return state.people
    .filter(
      (p) =>
        (ignoreFilter || f[2](p)) &&
        (!catFilter || (catFilter === "-" ? !p.category : p.category === catFilter)) &&
        (!q ||
          [...FIELDS.map((k) => p[k]), p.suggestion?.name, ...(p.notes || []).map((n) => n.text), ...(p.recordings || []).map((r) => r.summary), ...(p.sketches || []).map((k) => k.title + " " + (k.text || "")), ...(p.documents || []).map((d) => d.kind + " " + d.title)]
            .join(" ")
            .toLocaleLowerCase()
            .includes(q)),
    )
    .sort((a, b) =>
      sort === "name"
        ? (a.kana || title(a)).localeCompare(b.kana || title(b), "ja")
        : sort === "interview"
          ? (a.interview || "9999").localeCompare(b.interview || "9999")
          : sort === "updated"
            ? b.updated - a.updated
            : sort === "rating"
              ? (+b.rating || 0) - (+a.rating || 0) || b.created - a.created
              : (b.appliedDate || "").localeCompare(a.appliedDate || "") || b.created - a.created,
    );
}
function listContent() {
  const a = filtered();
  if (!state.people.length)
    return `<div class="empty"><div class="emptyart"><div class="miniDoc"><i></i><i></i><i></i><b></b></div><div class="spark">${icon("plus")}</div></div><h2>最初の履歴書を、ここへ。</h2><p>「取り込む」で履歴書のPDF・画像を選ぶか、${state.platform === "desktop" ? "この画面にドラッグ＆ドロップ" : "スマホで撮影"}してください。<br>Geminiが読み取り、応募者として登録します。</p></div>`;
  if (layout === "calendar") return calendarView(filtered(true));
  if (layout === "category") return categoryView();
  if (!a.length) return `<div class="empty"><h2>該当する応募者がいません</h2><p>上の絞り込み（${esc((FILTERS.find((x) => x[0] === filter) || [])[1] || "")}${catFilter ? "・" + esc(catFilter === "-" ? "職種未設定" : catFilter) : ""}）や検索を変えてみてください。</p></div>`;
  if (layout === "table")
    return `<div class="tablewrap"><table><thead><tr><th>氏名</th><th>年齢</th><th>職種</th><th>応募日</th><th>面接日時</th><th>選考状況</th><th>評価</th><th>経路</th><th>連絡先</th></tr></thead><tbody>${a
      .map(
        (p) =>
          `<tr tabindex="0" role="button" onclick="openPerson('${p.id}',event)" onauxclick="openPerson('${p.id}',event)" onkeydown="if(event.key==='Enter')openPerson('${p.id}')"><td><b>${esc(title(p))}</b><br><small>${esc(p.kana)}</small></td><td>${esc(age(p.birthDate))}</td><td>${esc(p.category)}<br><small>${esc(p.position)}</small></td><td>${esc(when(p.appliedDate))}</td><td>${esc(when(p.interview))}</td><td>${stageBadge(p)}</td><td class="stars">${stars(p.rating)}</td><td>${p.agency ? "紹介：" + esc(p.agency) : esc(p.source)}${(p.checklist || []).length ? `<br><small>手続き ${p.checklist.filter((c) => c.done).length}/${p.checklist.length}</small>` : ""}</td><td>${esc(String(p.mobile || p.phone || "").split("\n")[0])}<br><small>${esc(String(p.email || "").split("\n")[0])}</small></td></tr>`,
      )
      .join("")}</tbody></table></div><p class="caption">表は横にスクロールできます。CSVはメニューから書き出せます（今の絞り込みのままでも書き出せます）。</p>`;
  return personCards(a);
}
function personCards(a) {
  return `<div class="cardlist">${a
    .map(
      (p) =>
        `<button class="person" onclick="openPerson('${p.id}',event)" onauxclick="openPerson('${p.id}',event)">${avatar(p)}<div class="personbody"><h3 class="ell">${esc(title(p))}${age(p.birthDate) !== "" ? ` <small>${age(p.birthDate)}歳</small>` : ""}</h3><div class="company ell">${esc(job(p))}${p.position ? " ・ " + esc(p.position) : ""}</div><div class="personmeta">${stageBadge(p)}${p.queue ? `<span class="badge new">処理中</span>` : p.status === "confirmed" && !p.suggestion ? "" : `<span class="badge review">${p.suggestion ? "要確認" : status(p)}</span>`}${p.interview ? `<span class="when">${icon("cal")}${esc(when(p.interview))}</span>` : p.appliedDate ? `<span>応募 ${esc(when(p.appliedDate))}</span>` : ""}${+p.rating ? `<span class="stars">${stars(p.rating)}</span>` : ""}${p.agency ? `<span>紹介：${esc(p.agency)}</span>` : ""}${(p.checklist || []).length ? `<span class="${p.checklist.every((c) => c.done) ? "" : "when"}">${icon("check")}手続き ${p.checklist.filter((c) => c.done).length}/${p.checklist.length}</span>` : ""}${p.contactId ? `<span title="Google連絡先に登録済み">${icon("user")}</span>` : ""}${p.notes?.length ? `<span>メモ ${p.notes.length}</span>` : ""}</div></div><span class="chevron">${icon("next")}</span></button>`,
    )
    .join("")}</div>`;
}
// ---- Job categories -----------------------------------------------------------------------
function categoryView() {
  const keep = catFilter;
  catFilter = "";
  const people = filtered();
  catFilter = keep;
  const names = [...new Set([...state.categories, ...state.people.map((p) => p.category).filter(Boolean)])];
  const tiles = [...names.map((c) => [c, people.filter((p) => p.category === c)]), ["-", people.filter((p) => !p.category)]].filter(([c, list]) => list.length || state.categories.includes(c));
  const count = (list, f) => list.filter(f).length;
  return `<p class="caption">${esc((FILTERS.find((x) => x[0] === filter) || [])[1])}の応募者を職種ごとに表示しています。押すとその職種の一覧になります。</p><div class="cogrid">${tiles
    .map(([c, list]) => {
      const h = hue(c === "-" ? "?" : c);
      const name = c === "-" ? "職種未設定" : c;
      return `<button class="cotile ${list.length ? "" : "zero"}" onclick="catFilter=${esc(JSON.stringify(c))};layout='cards';render()"><div class="cologo letter" style="background:hsl(${h} 35% 90%);color:hsl(${h} 40% 28%)">${esc(name.slice(0, 2))}</div><b class="ell">${esc(name)}</b><small>${list.length}人</small>${list.length ? `<small class="cosub">${[
        ["予定", count(list, (p) => p.stage === "scheduled")],
        ["面接済", count(list, (p) => p.stage === "interviewed" || p.stage === "hold")],
        ["内定・採用", count(list, (p) => p.stage === "offered" || p.stage === "hired")],
      ]
        .filter(([, n]) => n)
        .map(([l, n]) => `${l}${n}`)
        .join(" ・ ")}</small>` : ""}</button>`;
    })
    .join("")}</div>`;
}
function updateList() {
  $("results").innerHTML = listContent();
  if ($("count")) $("count").textContent = (layout === "calendar" ? filtered(true) : filtered()).length + " 人";
}
function setLayout(v) {
  layout = v;
  render();
}
function home() {
  const people = state.people;
  const setup = !state.keySet
    ? `<button class="setup" onclick="go('gemini')">${icon("spark")}<span><b>Gemini APIキーを設定</b><small>設定すると、取り込んだ履歴書を自動で読み取ります</small></span>${icon("next")}</button>`
    : "";
  const queued = people.filter((p) => p.queue).length;
  const busyNow =
    state.processing || queued
      ? `<div class="procbar"><i class="spin"></i><span>${esc(state.processing || "処理待ち")}${queued ? `<small>残り ${queued}件 ・ そのまま作業を続けられます</small>` : ""}</span></div>`
      : "";
  const upd = state.update;
  const updateBanner = upd
    ? `<button class="setup drive" onclick="call('installUpdate')">${icon("download")}<span><b>新しい版 ${esc(upd.version)}</b><small>${upd.error ? "⚠ " + esc(upd.error) : upd.ready ? "押すと再起動して更新します" : "ダウンロードページを開きます"}</small></span>${icon("next")}</button>`
    : "";
  const googleBanner = state.googleNeeded
    ? `<button class="setup" onclick="googleSheet()">${icon("cloud")}<span><b>Googleにログイン</b><small>同期と連絡先の登録を続けます</small></span>${icon("next")}</button>`
    : "";
  const dupCount = dupes().length;
  const dupBanner = dupCount
    ? `<button class="setup" onclick="dupSheet()">${icon("link")}<span><b>同じ人の可能性 ${dupCount}件</b><small>再応募・二重の取り込みをまとめるか、別人として扱えます</small></span>${icon("next")}</button>`
    : "";
  const today = localDay();
  const todays = people.filter((p) => (p.interview || "").startsWith(today) && ACTIVE.includes(p.stage)).sort((a, b) => a.interview.localeCompare(b.interview));
  const todayBanner = todays.length
    ? `<div class="today"><b>${icon("cal")}今日の面接 ${todays.length}件</b>${todays.map((p) => `<button class="link" onclick="openPerson('${p.id}')">${esc(p.interview.slice(11))} ${esc(title(p))}（${esc(job(p))}）</button>`).join("")}</div>`
    : "";
  const reviewN = people.filter(FILTERS.find((x) => x[0] === "review")[2]).length;
  const chips = FILTERS.map(([v, l, f]) => [v, l, people.filter(f).length])
    .filter(([v, , n]) => v === "all" || v === "active" || n || filter === v)
    .map(([v, l, n]) => `<button class="chip ${filter === v ? "active" : ""} ${v === "review" && reviewN ? "attn" : ""}" onclick="filter='${v}';render()">${l} ${n}</button>`)
    .join("");
  const cats = [...new Set([...state.categories, ...people.map((p) => p.category).filter(Boolean)])];
  const catSelect = `<select class="catsel" aria-label="職種で絞り込み" onchange="catFilter=this.value;render()"><option value="">すべての職種</option>${cats
    .map((c) => [c, people.filter((p) => p.category === c).length])
    .filter(([c, n]) => n || c === catFilter)
    .map(([c, n]) => `<option value="${esc(c)}" ${catFilter === c ? "selected" : ""}>${esc(c)}（${n}）</option>`)
    .join("")}${people.some((p) => !p.category) ? `<option value="-" ${catFilter === "-" ? "selected" : ""}>職種未設定</option>` : ""}</select>`;
  return `<header class="top"><div class="brand"><div class="mark">${icon("users")}</div><div><div class="brandline">THETA</div><h1>Mensetsu Hatch</h1></div></div>${syncPill()}</header>${busyNow}${updateBanner}${googleBanner}${setup}${todayBanner}${dupBanner}<div class="toolbar"><div class="search">${icon("search")}<input id="search" placeholder="氏名・職種・資格・メモを検索" value="${esc(query)}" oninput="query=this.value;updateList()"></div>${people.length ? catSelect : ""}</div>${
    people.length
      ? `<div class="views" role="tablist">${[
          ["cards", "リスト", "list"],
          ["table", "表", "table"],
          ["calendar", "面接予定", "cal"],
          ["category", "職種別", "grid"],
        ]
          .map(([v, l, ic]) => `<button role="tab" aria-selected="${layout === v}" class="${layout === v ? "active" : ""}" onclick="setLayout('${v}')">${icon(ic)}${l}</button>`)
          .join("")}</div>${layout === "calendar" ? "" : `<div class="chips">${chips}</div>`}<div class="sectionline"><small id="count">${(layout === "calendar" ? filtered(true) : filtered()).length} 人</small>${catFilter ? `<button class="chip active" onclick="catFilter='';render()">${esc(catFilter === "-" ? "職種未設定" : catFilter)} ✕</button>` : ""}<select aria-label="並べ替え" onchange="sort=this.value;updateList()">${[
          ["applied", "応募日が新しい順"],
          ["interview", "面接日時が近い順"],
          ["rating", "評価が高い順"],
          ["updated", "更新日が新しい順"],
          ["name", "ふりがな順"],
        ]
          .map(([v, l]) => `<option value="${v}" ${sort === v ? "selected" : ""}>${l}</option>`)
          .join("")}</select></div>`
      : ""
  }<div id="results">${listContent()}</div>`;
}

// ---- Interview calendar -------------------------------------------------------------------
let calMonth = "",
  calDay = "";
function calendarView(list) {
  const dated = list.filter((p) => /^\d{4}-\d{2}-\d{2}/.test(p.interview || ""));
  const byDay = {};
  for (const p of dated) (byDay[p.interview.slice(0, 10)] = byDay[p.interview.slice(0, 10)] || []).push(p);
  const today = localDay();
  if (!calMonth) calMonth = today.slice(0, 7);
  const [y, m] = calMonth.split("-").map(Number);
  const first = new Date(y, m - 1, 1).getDay(),
    days = new Date(y, m, 0).getDate();
  const cells = [];
  for (let i = 0; i < first; i++) cells.push(`<span></span>`);
  for (let d = 1; d <= days; d++) {
    const key = `${calMonth}-${pad2(d)}`;
    const n = byDay[key]?.length || 0;
    cells.push(`<button class="${n ? "has" : ""} ${calDay === key ? "sel" : ""} ${key === today ? "today" : ""}" onclick="calDay='${key}';updateList()">${d}${n ? `<i>${n}</i>` : ""}</button>`);
  }
  const shift = (k) => {
    const d = new Date(y, m - 1 + k, 1);
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
  };
  const row = (p, day = false) =>
    `<button class="person compact" onclick="openPerson('${p.id}')">${avatar(p, "small")}<div class="personbody"><h3 class="ell">${esc(day ? when(p.interview) : p.interview.slice(11) || "時刻未定")} ${esc(title(p))}</h3><div class="company ell">${esc(job(p))}${p.interviewers ? " ・ 担当 " + esc(p.interviewers) : ""}</div></div>${stageBadge(p)}</button>`;
  const picked = calDay ? (byDay[calDay] || []).sort((a, b) => a.interview.localeCompare(b.interview)) : [];
  const upcoming = dated.filter((p) => p.interview.slice(0, 10) >= today && ACTIVE.includes(p.stage)).sort((a, b) => a.interview.localeCompare(b.interview)).slice(0, 30);
  return `<div class="cal"><div class="calhead"><button class="iconbtn" onclick="calMonth='${shift(-1)}';calDay='';updateList()" aria-label="前の月">${icon("back")}</button><b>${y}年${m}月</b><button class="outline small" onclick="calMonth='${today.slice(0, 7)}';calDay='${today}';updateList()">今日</button><button class="iconbtn" onclick="calMonth='${shift(1)}';calDay='';updateList()" aria-label="次の月">${icon("next")}</button></div><div class="calgrid">${WD.map((w) => `<b>${w}</b>`).join("")}${cells.join("")}</div></div>${
    calDay
      ? `<h3 class="gap">${esc(when(calDay, true))} の面接（${picked.length}件）</h3><div class="cardlist">${picked.map((p) => row(p)).join("") || '<p class="caption">この日の面接はありません。</p>'}</div>`
      : ""
  }<h3 class="gap">これからの面接</h3><div class="cardlist">${upcoming.map((p) => row(p, true)).join("") || '<p class="caption">予定はありません。応募者の詳細で面接日時を入れると、ここに並びます。</p>'}</div>`;
}

// ---- Detail ---------------------------------------------------------------------------------
let links = [];
function link(url) {
  links.push(url);
  return links.length - 1;
}
function infoRow(k, l, v) {
  const parts = String(v).split(/\n/).filter((x) => x.trim());
  const act = (x) => {
    const t = x.trim();
    if (["phone", "mobile"].includes(k)) return [link("tel:" + t.replace(/[^0-9+]/g, "")), "phone"];
    if (k === "email") return [link("mailto:" + t), "mail"];
    if (k === "address" && !t.startsWith("連絡先")) return [link("https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(t)), "map"];
    return null;
  };
  return `<div class="inforow"><span class="k">${l}</span><span class="v">${parts
    .map((x) => {
      const a = act(x);
      return a ? `<button class="vlink" onclick="openLink(${a[0]})">${icon(a[1])}<span>${esc(x)}</span></button>` : `<span>${esc(x)}</span>`;
    })
    .join("")}</span></div>`;
}
function openLink(i) {
  call("openUrl", { url: links[i] });
}
function primaryAction(p) {
  if (p.queue) return `<button class="outline full" disabled><i class="spin"></i>${p.queue === "photo" ? "顔写真を切り出し中…" : "読み取り中…"}</button>`;
  if (p.suggestion) return `<button class="primary full" onclick="beginEdit()">${icon("check")}読み取り結果を確認して保存</button>`;
  if (!p.pages.length && p.status !== "confirmed") return `<button class="primary full" onclick="call('pick',{id:selected,mode:'all'})">${icon("plus")}履歴書のPDF・画像を追加</button>`;
  if (p.status === "new") return `<button class="primary full" onclick="recognize()">${icon("spark")}Geminiで読み取る</button>`;
  if (p.status === "review") return `<button class="primary full" onclick="beginEdit()">${icon("check")}内容を確認して保存</button>`;
  return "";
}
function contactBox(p) {
  if (!can("contacts")) return "";
  if (p.contactId)
    return `<div class="contactline">${icon("user")}<span>Google連絡先に登録済み${p.contactAccount ? `（${esc(p.contactAccount)}）` : ""}${p.contactPending ? " ・ 次のログインで更新" : ""}</span><button class="link" onclick="call('viewContact',{id:selected})">開く</button></div>`;
  if (p.contactPending) return `<div class="contactline">${icon("user")}<span>Googleにログインすると連絡先に登録します</span><button class="link" onclick="googleSheet()">ログイン</button></div>`;
  if (p.status !== "confirmed") return "";
  return `<button class="outline full" onclick="registerContact()">${icon("user")}Google連絡先に登録${state.contactLabel ? `（ラベル「${esc(state.contactLabel)}」）` : ""}</button>`;
}
function section(h, keys, p, pre = false) {
  const rows = keys.filter((k) => String(p[k] || "").trim());
  if (!rows.length) return "";
  const hist = ["education", "career", "licenses"];
  return `<section class="panel"><h3>${h}</h3>${pre ? rows.map((k) => `<div class="para"><small>${esc(labelOf[k])}</small>${hist.includes(k) ? histTable(p[k]) : `<p class="pre">${esc(p[k])}</p>`}</div>`).join("") : `<div class="infogrid">${rows.map((k) => infoRow(k, labelOf[k], p[k])).join("")}</div>`}</section>`;
}
const toLocalInput = (v) => (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(v || "") ? v.replace(" ", "T") : /^\d{4}-\d{2}-\d{2}$/.test(v || "") ? v + "T00:00" : "");
const fromLocalInput = (v) => String(v || "").replace("T", " ").slice(0, 16);
function setField(k, v) {
  call("set", { id: selected, fields: { [k]: v } });
}
// ---- Commute, decision, staff, recordings ---------------------------------------------------
function commuteBox(p) {
  const from = String(p.address || "").split("\n")[0].trim();
  if (!from && !p.commute && !p.commuteCost) return "";
  const to = state.workplace || "";
  const yahoo = to ? link(`https://transit.yahoo.co.jp/search/result?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`) : -1;
  const gmap = to ? link(`https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(from)}&destination=${encodeURIComponent(to)}&travelmode=transit`) : -1;
  return `<section class="panel"><h3>通勤</h3>${p.commute || p.commuteCost ? `<div class="infogrid">${p.commute ? infoRow("commute", "通勤", p.commute) : ""}${p.commuteCost ? infoRow("commuteCost", "通勤費", p.commuteCost) : ""}</div>` : '<p class="caption">まだ調べていません。</p>'}${
    from
      ? to
        ? `<div class="row gap">${can("commute") && can("gemini") ? `<button class="secondary" onclick="call('commute',{id:selected})">${icon("spark")}${p.commute ? "概算し直す" : "通勤を概算"}</button>` : ""}<button class="outline" onclick="openLink(${yahoo})">乗換案内</button><button class="outline" onclick="openLink(${gmap})">Googleマップ</button></div><p class="caption">概算はGeminiがGoogle検索で調べた目安です。支給額は乗換案内で確かめてください。</p>`
        : `<button class="link" onclick="workplaceSheet()">勤務先の住所を設定すると、通勤時間・費用を概算できます</button>`
      : ""
  }</section>`;
}
// Onboarding: health check, licences to bring, contracts… ticked off one by one (also in Obsidian).
function checkBox(p) {
  const list = p.checklist || [];
  if (!list.length && !["offered", "hired"].includes(p.stage)) return "";
  const done = list.filter((c) => c.done).length;
  return `<section class="panel"><h3>採用手続き <small>${done}/${list.length}</small></h3>${
    list.length
      ? `<div class="progress"><i style="width:${Math.round((done / list.length) * 100)}%"></i></div><div class="checks">${list
          .map(
            (c) =>
              `<div class="check ${c.done ? "done" : ""}"><label><input type="checkbox" ${c.done ? "checked" : ""} onchange="call('checkSet',{id:selected,cid:'${esc(c.id)}',done:this.checked})"><span>${esc(c.item)}${c.date ? ` <small>${esc(when(c.date))}</small>` : ""}${c.note ? `<small class="cnote">${esc(c.note)}</small>` : ""}</span></label><button class="noflex" onclick="checkSheet('${esc(c.id)}')" aria-label="日付・メモ">${icon("edit")}</button></div>`,
          )
          .join("")}</div><div class="row gap"><input id="newcheck" placeholder="項目を追加（例：看護師免許の原本を持参）" onkeydown="if(event.key==='Enter')checkAdd()"><button class="outline noflex" onclick="checkAdd()">${icon("plus")}追加</button></div><button class="link" onclick="call('checkCreate',{id:selected})">ひな形の項目で足りないものを足す</button>`
      : `<button class="secondary full" onclick="call('checkCreate',{id:selected})">${icon("check")}採用手続きのチェックリストを作る</button>`
  }</section>`;
}
function checkAdd() {
  const v = $("newcheck").value.trim();
  if (v) call("checkAdd", { id: selected, item: v });
}
function checkSheet(cid) {
  const c = (getPerson().checklist || []).find((x) => x.id === cid);
  if (!c) return;
  modal(
    `<h2>${icon("check")} 手続きの項目</h2><label class="label">項目</label><input id="ck-item" value="${esc(c.item)}"><label class="label">済んだ日</label><input type="date" id="ck-date" value="${esc(c.date || "")}"><label class="label">メモ（受け取った書類・期限・担当など）</label><textarea id="ck-note" rows="3">${esc(c.note || "")}</textarea><button class="primary full gap" onclick="call('checkSet',{id:selected,cid:'${esc(cid)}',item:$('ck-item').value,date:$('ck-date').value,note:$('ck-note').value,done:!!$('ck-date').value||${c.done}});closeModal()">${icon("check")}保存</button><button class="danger full" onclick="if(confirm('この項目を消しますか？')){call('checkRemove',{id:selected,cid:'${esc(cid)}'});closeModal()}">項目を消す</button>`,
  );
}
function checklistSheet() {
  modal(
    `<h2>${icon("check")} 採用手続きのひな形</h2><p class="caption">内定・採用にしたとき、この項目でチェックリストを作ります。1行に1つ。施設のやり方に合わせて直してください（すでに作ったチェックリストは変わりません。詳細画面の「ひな形の項目で足りないものを足す」で追加できます）。</p><textarea id="cktpl" rows="16">${esc((state.checklistTemplate || []).join("\n"))}</textarea><button class="primary full gap" onclick="call('settings',{checklist:$('cktpl').value});closeModal()">保存</button><button class="outline full" onclick="if(confirm('最初のひな形に戻しますか？')){call('settings',{checklist:''});closeModal()}">最初のひな形に戻す</button>`,
  );
}
function decisionBox(p) {
  if (!p.decisionDate && !p.decisionNote && !["offered", "hired", "rejected", "declined"].includes(p.stage)) return "";
  return `<section class="panel"><h3>採否 ${stageBadge(p)}</h3><div class="infogrid">${p.decisionDate ? infoRow("decisionDate", "決定日", when(p.decisionDate, true)) : ""}${p.hireDate ? infoRow("hireDate", "入職日", when(p.hireDate, true)) : ""}${p.department ? infoRow("department", "配属先", p.department) : ""}</div>${p.decisionNote ? `<div class="para"><small>理由・本人への連絡</small><p class="pre">${esc(p.decisionNote)}</p></div>` : `<button class="link" onclick="beginEdit()">採否の理由・連絡の記録を書く</button>`}</section>`;
}
// After hiring: periodic staff evaluations stay with the person's record.
function staffBox(p) {
  const list = [...(p.evaluations || [])].sort((a, b) => String(b.date).localeCompare(String(a.date)));
  if (p.stage !== "hired" && !list.length) return "";
  return `<section class="panel"><h3>職員評価 <small>${list.length}件</small></h3>${list
    .map(
      (e) =>
        `<div class="note"><div class="notehead"><div><small>${esc((e.date || "").replace(/-/g, "/"))}${e.period ? " ・ " + esc(e.period) : ""}${e.evaluator ? " ・ 評価者 " + esc(e.evaluator) : ""}</small><div>${e.score ? `<b>評価 ${esc(e.score)}</b>` : ""}</div></div><div><button onclick="evalSheet('${esc(e.id)}')" aria-label="評価を編集">${icon("edit")}</button><button onclick="removeItem('evaluations',${p.evaluations.findIndex((x) => x.id === e.id)})" aria-label="評価を削除">${icon("trash")}</button></div></div>${e.text ? `<p class="notebody">${esc(e.text)}</p>` : ""}</div>`,
    )
    .join("")}<button class="outline full gap" onclick="evalSheet('')">${icon("plus")}評価を記録</button></section>`;
}
function evalSheet(eid) {
  const p = getPerson();
  const e = (p.evaluations || []).find((x) => x.id === eid) || { date: localDay() };
  modal(
    `<h2>${icon("star")} 職員評価</h2><div class="grid2"><label><span class="label">日付</span><input type="date" id="ev-date" value="${esc(e.date || "")}"></label><label><span class="label">期間（例：2027年度上期・試用期間）</span><input id="ev-period" value="${esc(e.period || "")}"></label><label><span class="label">評価者</span><input id="ev-evaluator" value="${esc(e.evaluator || "")}"></label><label><span class="label">評価（例：A・B・C、5段階など）</span><input id="ev-score" value="${esc(e.score || "")}"></label><label class="span2"><span class="label">所見</span><textarea id="ev-text" rows="6">${esc(e.text || "")}</textarea></label></div><button class="primary full gap" onclick="call('evalSave',{id:selected,evaluation:{id:'${esc(eid)}',date:$('ev-date').value,period:$('ev-period').value,evaluator:$('ev-evaluator').value,score:$('ev-score').value,text:$('ev-text').value}});closeModal()">${icon("check")}保存</button>`,
  );
}
function recordBox(p) {
  const list = [...(p.recordings || [])].sort((a, b) => b.time - a.time);
  if (!can("record") && !list.length) return "";
  return `<section class="panel"><h3>面接の録音 <small>${list.length}件</small></h3>${list
    .map(
      (r) =>
        `<div class="note"><div class="notehead"><div><small>${esc(date(r.time))}（${Math.floor(r.seconds / 60)}分${r.seconds % 60}秒）</small><div><b>${esc(r.title || "面接")}</b></div></div><div><button onclick="recEditSheet('${esc(r.id)}')" aria-label="録音の名前・文字起こしを編集">${icon("edit")}</button><button onclick="removeItem('recordings',${p.recordings.findIndex((x) => x.id === r.id)})" aria-label="録音を削除">${icon("trash")}</button></div></div><audio controls preload="none" src="${img(r.file)}"></audio>${r.summary ? `<p class="notebody">${esc(r.summary)}</p>` : ""}${r.transcript ? `<details><summary class="caption">文字起こしを見る</summary><p class="notebody transcript">${esc(r.transcript)}</p></details>` : can("gemini") ? `<button class="link" onclick="transcribe('${esc(r.id)}')">${icon("spark")}Geminiで文字起こし</button>` : ""}</div>`,
    )
    .join("")}${can("record") ? `<button class="outline full gap" onclick="recordSheet()">${icon("mic")}録音する</button>` : ""}<p class="caption">録音は応募者の同意を得てから行ってください。文字起こしでは音声をGeminiに送ります。</p></section>`;
}
function transcribe(rid) {
  if (!state.keySet) return report("メニュー →「Gemini APIキー・モデル」で、APIキーを登録してください。");
  if (confirm("録音をGeminiに送って文字起こしと要約をします（30分で数円〜十数円の目安）。続けますか？")) call("recTranscribe", { id: selected, rid });
}
function recEditSheet(rid) {
  const r = (getPerson().recordings || []).find((x) => x.id === rid);
  if (!r) return;
  modal(
    `<h2>${icon("mic")} 録音</h2><label class="label">名前</label><input id="rec-title" value="${esc(r.title || "")}" placeholder="例：一次面接"><label class="label">要約</label><textarea id="rec-summary" rows="5">${esc(r.summary || "")}</textarea><label class="label">文字起こし</label><textarea id="rec-text" rows="12">${esc(r.transcript || "")}</textarea><button class="primary full gap" onclick="call('recEdit',{id:selected,rid:'${esc(rid)}',title:$('rec-title').value,summary:$('rec-summary').value,transcript:$('rec-text').value});closeModal()">${icon("check")}保存</button>${can("gemini") ? `<button class="outline full" onclick="closeModal();transcribe('${esc(rid)}')">${icon("spark")}Geminiで文字起こしし直す</button>` : ""}`,
  );
}
// Recording in the page (MediaRecorder): the PC's microphone, or a phone's.
let recorder = null;
function recordSheet() {
  modal(
    `<h2>${icon("mic")} 面接を録音</h2><p class="caption">応募者に録音の了承を得てから始めてください。録音中もこの画面の外でメモを取れます（このシートを閉じると録音は止まって保存されます）。</p><label class="label">名前</label><input id="rec-name" value="${esc(STAGES.find((x) => x[0] === getPerson().stage)?.[0] === "interviewed" ? "二次面接" : "面接")}"><div class="recbox"><span id="rec-time">0:00</span><span id="rec-level" class="level"><i></i></span></div><label class="mrow"><span class="mt"><b>終わったら文字起こしする</b><small>Geminiで話者ごとに書き起こし、要約も作ります</small></span><input type="checkbox" class="switch" id="rec-tr" ${state.keySet ? "checked" : "disabled"}></label><div class="row gap"><button class="danger" id="rec-btn" onclick="recToggle()">${icon("mic")}録音開始</button></div>`,
  );
}
async function recToggle() {
  if (recorder) return recorder.stop();
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  } catch (e) {
    return toast("マイクを使えません：" + (e.message || e.name));
  }
  const type = ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/mp4"].find((t) => window.MediaRecorder && MediaRecorder.isTypeSupported(t)) || "";
  const mr = new MediaRecorder(stream, type ? { mimeType: type, audioBitsPerSecond: 32000 } : {});
  const chunks = [];
  const start = Date.now();
  const title = $("rec-name").value, tr = $("rec-tr").checked, id = selected;
  // A small level meter, so it is obvious the microphone hears something.
  const ctx = new AudioContext();
  const an = ctx.createAnalyser();
  ctx.createMediaStreamSource(stream).connect(an);
  const buf = new Uint8Array(an.fftSize);
  const tick = setInterval(() => {
    const s = Math.floor((Date.now() - start) / 1000);
    if ($("rec-time")) $("rec-time").textContent = Math.floor(s / 60) + ":" + pad2(s % 60);
    an.getByteTimeDomainData(buf);
    const lvl = Math.min(1, Math.max(...buf.map((v) => Math.abs(v - 128))) / 64);
    if ($("rec-level")) $("rec-level").firstChild.style.width = Math.round(lvl * 100) + "%";
  }, 250);
  mr.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  mr.onstop = () => {
    clearInterval(tick);
    stream.getTracks().forEach((t) => t.stop());
    ctx.close();
    recorder = null;
    const blob = new Blob(chunks, { type: mr.mimeType || "audio/webm" });
    const ext = /ogg/.test(blob.type) ? "ogg" : /mp4/.test(blob.type) ? "m4a" : "webm";
    closeModal();
    window.ThetaUpload([{ name: "interview." + ext, blob }], { as: "recording", id, title, seconds: Math.round((Date.now() - start) / 1000), transcribe: tr });
  };
  mr.start(10000);
  recorder = mr;
  $("rec-btn").innerHTML = icon("stop") + "停止して保存";
}
// Pictures of documents with the PC's (or phone's) camera: several pages, then done.
let camStream = null,
  camShots = [],
  camOpts = {};
async function cameraSheet(opts = {}) {
  camOpts = opts;
  camShots = [];
  modal(
    `<h2>${icon("camera")} カメラで取り込む</h2><p class="caption">書類を明るい所で平らに置き、枠いっぱいに写して「撮影」。何ページでも続けて撮れます。</p><video id="cam" autoplay playsinline muted></video><div class="gthumbs" id="camshots"></div><div class="row gap"><button class="primary" onclick="camShot()">${icon("camera")}撮影</button><button class="secondary" id="camdone" disabled onclick="camDone()">${icon("check")}完了（<span id="camn">0</span>枚）</button></div>`,
  );
  try {
    camStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment", width: { ideal: 3840 }, height: { ideal: 2160 } } });
    $("cam").srcObject = camStream;
  } catch (e) {
    closeModal();
    report("カメラを使えません：" + (e.message || e.name) + "\nPCにカメラがつながっているか、ほかのアプリが使っていないか確認してください。");
  }
}
function camStop() {
  if (camStream) camStream.getTracks().forEach((t) => t.stop());
  camStream = null;
}
function camShot() {
  const v = $("cam");
  if (!v || !v.videoWidth) return;
  const c = document.createElement("canvas");
  c.width = v.videoWidth;
  c.height = v.videoHeight;
  c.getContext("2d").drawImage(v, 0, 0);
  c.toBlob(
    (b) => {
      camShots.push(b);
      $("camshots").insertAdjacentHTML("beforeend", `<img src="${URL.createObjectURL(b)}" alt="${camShots.length}枚目">`);
      $("camn").textContent = camShots.length;
      $("camdone").disabled = false;
    },
    "image/jpeg",
    0.9,
  );
}
function camDone() {
  const shots = camShots.map((blob, i) => ({ name: `camera-${pad2(i + 1)}.jpg`, blob }));
  camStop();
  closeModal();
  if (shots.length) window.ThetaUpload(shots, { mode: "all", ...camOpts });
}
function workplaceSheet() {
  modal(
    `<h2>${icon("map")} 勤務先の住所</h2><p class="caption">通勤時間・費用の概算と、乗換案内のリンクに使います。最寄り駅を書いてもかまいません。</p><input id="wp" value="${esc(state.workplace || "")}" placeholder="例：東京都○○区○○1-2-3（○○駅）"><button class="primary full gap" onclick="call('settings',{workplace:$('wp').value});closeModal()">保存</button>`,
  );
}
const DOC_KINDS = ["履歴書", "職務経歴書", "免許証・資格証の写し", "卒業証明書", "紹介状・推薦状", "健康診断書", "雇用契約書", "身元保証書", "通勤届", "評価シート", "その他"];
function docEditSheet(i) {
  const d = getPerson().documents[i];
  modal(
    `<h2>${icon("doc")} 書類</h2><label class="label">種類</label><input list="dockinds" id="dk" value="${esc(d.kind || "")}"><datalist id="dockinds">${DOC_KINDS.map((k) => `<option value="${esc(k)}"></option>`).join("")}</datalist><label class="label">書類名</label><input id="dt" value="${esc(d.title || "")}"><label class="label">日付</label><input type="date" id="dd" value="${esc(d.date || "")}"><button class="primary full gap" onclick="call('docEdit',{id:selected,did:'${esc(d.id)}',kind:$('dk').value,title:$('dt').value,date:$('dd').value});closeModal()">保存</button>`,
  );
}
// ---- Handwritten memos (stylus) --------------------------------------------------------------------
// One page (A4 proportions, 1000 × 1414 units). Pen pressure sets the line width; once a pen is
// seen, fingers and palms only scroll (no stray marks); the pen's eraser end / button erases.
// Saved as a PNG (what Obsidian shows) plus the strokes as JSON (to edit again later).
const SK_W = 1000, SK_H = 1414;
let sk = null;
function sketchBox(p) {
  const list = [...(p.sketches || [])].sort((a, b) => b.time - a.time);
  return `<section class="panel"><h3>手書きメモ <small>${list.length}件</small></h3>${list
    .map(
      (k) =>
        `<div class="note"><div class="notehead"><div><small>${esc(date(k.time))}</small><div><b>${esc(k.title || "手書きメモ")}</b></div></div><div><button onclick="sketchOpen('${esc(k.id)}')" aria-label="手書きメモを開く">${icon("edit")}</button><button onclick="removeItem('sketches',${p.sketches.findIndex((x) => x.id === k.id)})" aria-label="手書きメモを削除">${icon("trash")}</button></div></div><img class="sketchthumb" loading="lazy" src="${img(k.file)}" alt="手書きメモ" onclick="sketchOpen('${esc(k.id)}')">${k.text ? `<details><summary class="caption">読み取った文字</summary><p class="notebody">${esc(k.text)}</p></details>` : can("gemini") ? `<button class="link" onclick="call('sketchText',{id:selected,sid:'${esc(k.id)}'})">${icon("spark")}手書きの文字を読み取る</button>` : ""}</div>`,
    )
    .join("")}<button class="outline full gap" onclick="sketchOpen('')">${icon("edit")}手書きで書く（ペン・指）</button></section>`;
}
async function sketchOpen(sid) {
  const p = getPerson();
  const k = (p.sketches || []).find((x) => x.id === sid);
  sk = { id: p.id, sid, title: k ? k.title || "" : "", strokes: [], redo: [], color: "#1f3346", width: 3, eraser: false, bg: "lines", penSeen: false, dirty: false, cur: null };
  if (k && k.strokes) {
    try {
      const d = await (await fetch(img(k.strokes))).json();
      sk.strokes = d.strokes || [];
      sk.bg = d.bg || "lines";
    } catch {
      toast("前の線を読み込めませんでした（画像は残っています）");
    }
  }
  modal(
    `<div class="sktools"><input id="sk-title" value="${esc(sk.title)}" placeholder="題（例：一次面接）" oninput="sk.title=this.value"><div class="skrow">${[
      ["#1f3346", "黒"],
      ["#1f5c99", "青"],
      ["#b3261e", "赤"],
      ["#1d7048", "緑"],
    ]
      .map(([c, l]) => `<button class="skcolor" style="--c:${c}" data-c="${c}" onclick="skColor('${c}')" aria-label="${l}"></button>`)
      .join("")}<select aria-label="太さ" onchange="sk.width=+this.value"><option value="2">細</option><option value="3" selected>中</option><option value="6">太</option><option value="14">マーカー</option></select><button id="sk-eraser" onclick="skEraser()" aria-label="消しゴム">消しゴム</button><button onclick="skUndo()" aria-label="元に戻す">${icon("back")}</button><button onclick="skRedo()" aria-label="やり直し">${icon("next")}</button><select aria-label="用紙" onchange="sk.bg=this.value;skBg()"><option value="lines">罫線</option><option value="grid">方眼</option><option value="plain">無地</option></select><button onclick="if(confirm('全部消しますか？')){sk.redo=sk.strokes;sk.strokes=[];sk.dirty=true;skDraw()}">全消去</button></div></div><div class="skpage" id="sk-page"><canvas id="sk-paper"></canvas><canvas id="sk-canvas"></canvas></div><div class="row gap"><button class="primary" onclick="skSave(false)">${icon("check")}保存</button>${can("gemini") ? `<button class="secondary" onclick="skSave(true)">${icon("spark")}保存して文字を読み取る</button>` : ""}</div><p class="caption">ペンで書くと、指や手のひらは画面のスクロールだけになります。ペンの消しゴム（ボタン）でも消せます。</p>`,
  );
  $("modal").querySelector(".sheet").classList.add("sketchsheet");
  sk.canvas = $("sk-canvas");
  skColor(sk.color);
  skSize();
  skBg();
  skBind();
  skDraw();
}
function skSize() {
  const w = $("sk-page").clientWidth;
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  for (const c of [sk.canvas, $("sk-paper")]) {
    c.style.width = w + "px";
    c.style.height = Math.round((w * SK_H) / SK_W) + "px";
    c.width = Math.round(w * dpr);
    c.height = Math.round(((w * SK_H) / SK_W) * dpr);
  }
  sk.scale = sk.canvas.width / SK_W;
}
function skBg() {
  const c = $("sk-paper");
  if (c.width) skPaper(c.getContext("2d"), c.width, c.height, c.width / SK_W, sk.bg);
}
// The paper: white, with ruled lines or a grid every 40 units.
function skPaper(g, W, H, scale, bg) {
  g.fillStyle = "#fff";
  g.fillRect(0, 0, W, H);
  g.strokeStyle = "#dfe6ee";
  g.lineWidth = Math.max(1, 1.2 * scale);
  const step = 40 * scale;
  if (bg === "plain") return;
  for (let y = step * 2; y < H; y += step) (g.beginPath(), g.moveTo(0, y), g.lineTo(W, y), g.stroke());
  if (bg === "grid") for (let x = step; x < W; x += step) (g.beginPath(), g.moveTo(x, 0), g.lineTo(x, H), g.stroke());
}
function skColor(c) {
  sk.color = c;
  sk.eraser = false;
  for (const b of document.querySelectorAll(".skcolor")) b.classList.toggle("on", b.dataset.c === c);
  $("sk-eraser")?.classList.remove("on");
}
function skEraser() {
  sk.eraser = !sk.eraser;
  $("sk-eraser").classList.toggle("on", sk.eraser);
  for (const b of document.querySelectorAll(".skcolor")) b.classList.toggle("on", !sk.eraser && b.dataset.c === sk.color);
}
function skPoint(e) {
  const r = sk.canvas.getBoundingClientRect();
  const pr = e.pointerType === "pen" ? e.pressure || 0.5 : e.pointerType === "touch" ? (e.pressure > 0 && e.pressure < 1 ? e.pressure : 0.5) : 0.5;
  return [Math.round(((e.clientX - r.left) / r.width) * SK_W * 10) / 10, Math.round(((e.clientY - r.top) / r.height) * SK_H * 10) / 10, Math.round(pr * 100) / 100];
}
function skBind() {
  const c = sk.canvas;
  c.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "pen" && !sk.penSeen) {
      sk.penSeen = true;
      c.style.touchAction = "pan-y pinch-zoom"; // fingers scroll from now on
    }
    if (sk.penSeen && e.pointerType === "touch") return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.preventDefault();
    try {
      c.setPointerCapture(e.pointerId);
    } catch {}
    const erase = sk.eraser || e.button === 5 || (e.buttons & 32) === 32;
    sk.cur = { c: sk.color, w: erase ? Math.max(18, sk.width * 4) : sk.width, e: erase ? 1 : 0, p: [skPoint(e)], id: e.pointerId };
    skSegment(sk.cur, 0);
  });
  c.addEventListener("pointermove", (e) => {
    if (!sk.cur || e.pointerId !== sk.cur.id) return;
    e.preventDefault();
    const evs = (e.getCoalescedEvents && e.getCoalescedEvents()) || [];
    for (const ev of evs.length ? evs : [e]) {
      sk.cur.p.push(skPoint(ev));
      skSegment(sk.cur, sk.cur.p.length - 1);
    }
  });
  const end = (e) => {
    if (!sk.cur || e.pointerId !== sk.cur.id) return;
    const s = sk.cur;
    sk.cur = null;
    delete s.id;
    sk.strokes.push(s);
    sk.redo = [];
    sk.dirty = true;
  };
  c.addEventListener("pointerup", end);
  c.addEventListener("pointercancel", end);
}
// Draws one segment (point i-1 → i) of a stroke, width following the pen's pressure.
function skSegment(s, i, g = sk.canvas.getContext("2d"), scale = sk.scale) {
  const p = s.p[i], q = s.p[Math.max(0, i - 1)];
  g.globalCompositeOperation = s.e ? "destination-out" : "source-over";
  g.strokeStyle = s.c;
  g.fillStyle = s.c;
  g.lineCap = "round";
  g.lineJoin = "round";
  g.lineWidth = Math.max(0.6, s.w * (s.e ? 1 : 0.35 + 0.9 * ((p[2] + q[2]) / 2))) * scale;
  if (s.w >= 10 && !s.e) g.globalAlpha = 0.35;
  g.beginPath();
  g.moveTo(q[0] * scale, q[1] * scale);
  g.lineTo(p[0] * scale + (i === 0 ? 0.01 : 0), p[1] * scale);
  g.stroke();
  g.globalAlpha = 1;
  g.globalCompositeOperation = "source-over";
}
function skDraw(g = sk.canvas.getContext("2d"), scale = sk.scale, w = sk.canvas.width, h = sk.canvas.height) {
  g.clearRect(0, 0, w, h);
  for (const s of sk.strokes) for (let i = 0; i < s.p.length; i++) skSegment(s, i, g, scale);
}
function skUndo() {
  if (!sk.strokes.length) return;
  sk.redo.push(sk.strokes.pop());
  sk.dirty = true;
  skDraw();
}
function skRedo() {
  if (!sk.redo.length) return;
  sk.strokes.push(sk.redo.pop());
  sk.dirty = true;
  skDraw();
}
// The saved picture: white paper (with its lines) under the ink, 1240 px wide.
async function skSave(read) {
  if (!sk.strokes.length) return toast("まだ何も書かれていません");
  const W = 1240, H = Math.round((W * SK_H) / SK_W), scale = W / SK_W;
  const ink = document.createElement("canvas");
  ink.width = W;
  ink.height = H;
  skDraw(ink.getContext("2d"), scale, W, H);
  const out = document.createElement("canvas");
  out.width = W;
  out.height = H;
  const g = out.getContext("2d");
  skPaper(g, W, H, scale, sk.bg);
  g.drawImage(ink, 0, 0);
  const png = await new Promise((ok) => out.toBlob(ok, "image/png"));
  const json = new Blob([JSON.stringify({ v: 1, w: SK_W, h: SK_H, bg: sk.bg, strokes: sk.strokes })], { type: "application/json" });
  const q = { as: "sketch", id: sk.id, sid: sk.sid, title: sk.title, read };
  sk.dirty = false;
  closeModal();
  window.ThetaUpload([{ name: "memo.png", blob: png }, { name: "memo.json", blob: json }], q);
}

// ---- Separate windows (PC) ---------------------------------------------------------------------
// "#p=<id>" opens that applicant alone: several can be side by side, each its own window.
const solo = (/^#p=([A-Za-z0-9_-]+)$/.exec(location.hash) || [])[1] || "";
function openWindow(id) {
  window.open(location.pathname + "#p=" + id, "_blank");
}
function detail() {
  const p = getPerson();
  if (!p) {
    route = "home";
    return home();
  }
  links = [];
  const a = age(p.birthDate);
  const docs = p.documents || [];
  document.title = title(p) + " - Theta Mensetsu Hatch";
  return `${backbar("", `${can("windows") && !solo ? `<button onclick="openWindow('${p.id}')" aria-label="別ウインドウで開く" title="別ウインドウで開く">${icon("share")}</button>` : ""}<button onclick="beginEdit()" aria-label="編集">${icon("edit")}</button><button onclick="detailMenu()" aria-label="その他の操作">${icon("more")}</button>`)}<div class="detailsHead"><button class="facebtn" onclick="${p.portrait ? `viewFile('${esc(p.portrait)}')` : "assetSheet()"}" aria-label="顔写真">${avatar(p, "big")}</button><div class="content"><small>${esc(p.kana)}</small><h1>${esc(title(p))}</h1><p class="muted">${[a !== "" ? a + "歳" : "", p.gender, p.birthDate ? "生年月日 " + when(p.birthDate, true).replace(/\(.\)/, "") : ""].filter(Boolean).map(esc).join(" ・ ")}</p><p><b>${esc(job(p))}</b>${p.position ? " ・ " + esc(p.position) : ""}${p.employment ? " ・ " + esc(p.employment) : ""}</p>${p.agency ? `<span class="badge st-scheduled">紹介：${esc(p.agency)}</span> ` : ""}${p.status === "confirmed" && !p.suggestion ? "" : `<span class="badge review">${p.suggestion ? "読み取り結果あり" : status(p)}</span>`}</div></div>
<div class="selection panel"><label><span class="label">選考状況</span><select onchange="setField('stage',this.value)">${STAGES.map(([v, l]) => `<option value="${v}" ${p.stage === v ? "selected" : ""}>${l}</option>`).join("")}</select></label><label><span class="label">面接日時</span><input type="datetime-local" value="${esc(toLocalInput(p.interview))}" onchange="setField('interview',fromLocalInput(this.value))"></label><div><span class="label">評価</span><div class="rate" role="radiogroup" aria-label="評価">${[1, 2, 3, 4, 5].map((n) => `<button class="${+p.rating >= n ? "on" : ""}" onclick="setField('rating','${+p.rating === n ? "" : n}')" aria-label="${n}">${icon("star")}</button>`).join("")}</div></div></div>
<div class="gap">${primaryAction(p)}</div>${p.warnings ? `<div class="tip warning gap">読み取り時の注意：${esc(p.warnings)}</div>` : ""}${p.queueError ? `<div class="tip warning gap">処理できませんでした：${esc(p.queueError)}</div>` : ""}<div class="gap">${contactBox(p)}</div>
<div class="detailcols"><div>${section("連絡先", ["mobile", "phone", "email", "postal", "address"], p)}${commuteBox(p)}${decisionBox(p)}${checkBox(p)}${section("応募", ["appliedDate", "source", "agency", "agencyContact", "agencyFee", "interviewers", "startDate", "tags"], p)}${section("学歴・職歴・資格", ["education", "career", "licenses"], p, true)}${section("志望動機など", ["motivation", "selfPr", "wishes"], p, true)}${
    !FIELDS.some((k) => !["name", "kana", "stage", "rating", "interview", "category", "position", "employment", "birthDate", "gender"].includes(k) && String(p[k] || "").trim())
      ? `<p class="caption">まだ詳しい情報がありません。読み取るか、右上の編集から入力してください。</p>`
      : ""
  }${staffBox(p)}</div><div>${recordBox(p)}${sketchBox(p)}<section class="panel"><h3>面接メモ <small>${p.notes.length}件</small></h3><textarea id="note" placeholder="面接での受け答え、印象、確認事項、連絡の記録など" oninput="noteDraft=this.value">${esc(noteDraft)}</textarea><div class="row gap"><button class="secondary" onclick="addNote()">${icon("plus")}${editNoteId ? "変更を保存" : "メモを追加"}</button>${editNoteId ? `<button class="noflex" onclick="noteDraft='';editNoteId='';render()">キャンセル</button>` : ""}</div>${timeline(p)}</section><section class="panel"><h3>応募書類 <small>${p.pages.length}ページ${docs.length ? ` ・ 添付 ${docs.length}件` : ""}</small></h3>${
    p.pages.length ? `<div class="pages">${p.pages.map((pg, i) => `<button class="page" onclick="viewImage(${i})"><img class="pageimg" loading="lazy" src="${img(pg.file)}" alt="${i + 1}ページ"><span class="pageLabel">${i + 1}</span></button>`).join("")}</div>` : ""
  }${(p.sources || []).filter((s) => s.file.endsWith(".pdf")).map((s) => `<button class="link" onclick="call('openMedia',{file:'${esc(s.file)}'})">${icon("download")}原本のPDFを開く（${esc(s.name)}）</button>`).join("")}${docs
    .map(
      (d, i) =>
        `<div class="note"><div class="notehead"><div><small>${esc((d.date || "").replace(/-/g, "/"))}</small><div>${d.kind ? `<span class="badge">${esc(d.kind)}</span> ` : ""}<b>${esc(d.title || d.kind || "書類")}</b></div></div><div><button onclick="docEditSheet(${i})" aria-label="書類の種類・名前を変更">${icon("edit")}</button><button onclick="removeItem('documents',${i})" aria-label="書類を外す">${icon("trash")}</button></div></div>${(d.files || []).some((f) => !f.original) ? `<div class="gthumbs">${d.files.filter((f) => !f.original).map((f) => `<img src="${img(f.file)}" alt="${esc(d.title || "書類")}" onclick="viewFile('${esc(f.file)}')">`).join("")}</div>` : ""}${(d.files || []).filter((f) => f.original).map((f) => `<button class="link" onclick="call('openMedia',{file:'${esc(f.file)}'})">${icon("download")}原本を開く（${esc(f.name || "PDF")}）</button>`).join("")}</div>`,
    )
    .join("")}<button class="outline full gap" onclick="attachSheet()">${icon("plus")}書類を添付（職務経歴書・免許証の写し・契約書など）</button></section></div></div><p class="footnote">応募書類は個人情報です。採用選考の目的だけに使い、選考後の保管期間・廃棄は施設の規程に従ってください。</p>`;
}
function timeline(p) {
  return [...p.notes]
    .map((n, i) => ({ n, i }))
    .sort((a, b) => b.n.time - a.n.time)
    .map(({ n, i }) => `<div class="note"><div class="notehead"><small>${esc(date(n.time))}</small><div><button onclick="editNote(${i})" aria-label="メモ編集">${icon("edit")}</button><button onclick="removeItem('notes',${i})" aria-label="メモ削除">${icon("trash")}</button></div></div><p class="notebody">${esc(n.text)}</p></div>`)
    .join("");
}
function menuRow(ic, label, sub, onclick, cls = "") {
  return `<button class="mrow ${cls}" onclick="${onclick}"><span class="mi">${icon(ic)}</span><span class="mt"><b>${label}</b>${sub ? `<small>${sub}</small>` : ""}</span>${icon("next")}</button>`;
}
function switchRow(ic, label, sub, on, onchange) {
  return `<label class="mrow"><span class="mi">${icon(ic)}</span><span class="mt"><b>${label}</b>${sub ? `<small>${sub}</small>` : ""}</span><input type="checkbox" class="switch" ${on ? "checked" : ""} onchange="${onchange}"></label>`;
}
function detailMenu() {
  const p = getPerson();
  modal(
    `<h2>${esc(title(p))}</h2><div class="mlist">${[
      menuRow("image", "履歴書のページを追加", "PDF・画像（裏面・2枚目など）", "closeModal();call('pick',{id:selected,mode:'all'})"),
      only("scan", menuRow("camera", "撮影してページを追加", "", "closeModal();call('scan',{id:selected,mode:'all'})")),
      only("camera", menuRow("camera", "カメラでページを追加", "PCのカメラなどで撮影", "cameraSheet({id:selected})")),
      only("record", menuRow("mic", "面接を録音", "文字起こし・要約もできます", "recordSheet()")),
      menuRow("edit", "手書きメモ", "ペン・指で書く（筆圧対応）", "closeModal();sketchOpen('')"),
      can("windows") ? menuRow("share", "別ウインドウで開く", "一覧で Ctrl＋クリックでも開けます", "closeModal();openWindow(selected)") : "",
      p.pages.length && can("gemini") ? menuRow("spark", "Geminiで読み取り直す", "結果は保存前に確認できます", "closeModal();reread()") : "",
      menuRow("user", "顔写真", p.portrait ? (p.portraitSource ? "履歴書から切り出し済み" : "手動で登録済み") : "履歴書から切り出す・画像を選ぶ", "assetSheet()"),
      menuRow("download", "書類を添付", "職務経歴書・免許証の写し・紹介状など", "attachSheet()"),
      can("contacts") && p.contactId ? menuRow("close", "Google連絡先から削除", "応募者の記録は残ります", "closeModal();unlinkContact()") : "",
      can("contacts") && !p.contactId && p.status === "confirmed" ? menuRow("user", "Google連絡先に登録", "", "closeModal();registerContact()") : "",
      state.people.length > 1 ? menuRow("link", "別の記録とまとめる", "再応募・二重の取り込みを1人に", "mergeSheet()") : "",
      can("export") ? menuRow("table", "この人をCSVで書き出す", "", `closeModal();call('export',{ids:['${p.id}']})`) : "",
      p.rawText ? menuRow("list", "読み取った全文を見る", "", "report(getPerson().rawText)") : "",
      menuRow("trash", "この応募者を削除", "Theta Vault のゴミ箱（.theta/trash）へ", "closeModal();deletePerson()", "dangerrow"),
    ].join("")}</div>`,
  );
}
function attachSheet() {
  modal(
    `<h2>${icon("download")} 書類を添付</h2><label class="label">種類</label><input list="dockinds" id="akind" placeholder="選ぶか入力"><datalist id="dockinds">${DOC_KINDS.map((k) => `<option value="${esc(k)}"></option>`).join("")}</datalist><label class="label">書類名（任意）</label><input id="atitle" placeholder="例：看護師免許証（表・裏）"><div class="mlist gap">${[
      only("scan", menuRow("camera", "撮影して添付", "何ページでも続けて撮影", "attachGo('scan')")),
      only("camera", menuRow("camera", state.platform === "desktop" ? "PCのカメラで撮影して添付" : "カメラで撮影して添付（画面で確認）", "何ページでも続けて撮影", "attachGo('camera')")),
      menuRow("image", "PDF・画像を選んで添付", "PDFは原本も保存します", "attachGo('pick')"),
    ].join("")}</div><p class="caption">添付した書類はGeminiでは読み取りません。応募書類の欄に日付つきで並び、同期にも含まれます。</p>`,
  );
}
function attachGo(how) {
  const opts = { id: "", mode: "all", attachTo: selected, title: $("atitle").value.trim(), kind: $("akind").value.trim() };
  closeModal();
  if (how === "camera") cameraSheet(opts);
  else call(how, opts);
}
function assetSheet() {
  const p = getPerson();
  modal(
    `<h2>${icon("user")} 顔写真</h2><p class="caption">一覧のサムネイルと、Google連絡先の写真に使います。履歴書の1ページ目に貼られた写真を自動で切り出します。</p><div class="assetrow"><div class="assetbox">${p.portrait ? `<img src="${img(p.portrait)}" alt="顔写真">` : `<div class="placeholder">${icon("user")}</div>`}<small>${p.portrait ? (p.portraitSource ? "履歴書から切り出し" : "手動で登録") : "未登録"}</small></div></div><div class="mlist gap">${[
      p.pages.length && can("gemini") ? menuRow("spark", "履歴書から切り出し直す", "Geminiが写真の位置を探します", "closeModal();call('photoOne',{id:selected})") : "",
      menuRow("image", "画像を選んで登録", "", "closeModal();call('asset',{id:selected})"),
      p.portrait ? menuRow("trash", "顔写真を外す", "", "if(confirm('顔写真を外しますか？')){closeModal();call('clearAsset',{id:selected})}", "dangerrow") : "",
    ].join("")}</div>`,
  );
}
function date(t) {
  return new Date(t).toLocaleString("ja-JP", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}
function recognize() {
  if (!state.keySet) return report("メニュー →「Gemini APIキー・モデル」で、APIキーを登録してください。");
  call("recognize", { id: selected });
}
function reread() {
  if (!state.keySet) return report("メニュー →「Gemini APIキー・モデル」で、APIキーを登録してください。");
  call("reread", { id: selected });
}
function unlinkContact() {
  if (confirm("Google連絡先からこの応募者を削除します（Googleコンタクトのゴミ箱に30日残ります）。応募者の記録は残ります。続けますか？")) call("unlinkContact", { id: selected });
}
function registerContact() {
  call("contacts", { id: selected });
}

// ---- Review / edit -----------------------------------------------------------------------
// Edit doubles as the review screen: a pending Gemini result is pre-filled into the form. Only
// the fields changed here are saved, so edits made meanwhile on another PC are kept.
function beginEdit() {
  const p = getPerson();
  draft = JSON.parse(JSON.stringify(p));
  draft.base = Object.fromEntries(FIELDS.map((k) => [k, p[k] ?? ""]));
  draft.baseUpdated = p.updated;
  draft.fromSuggestion = !!p.suggestion;
  if (p.suggestion) for (const k of FIELDS) if (p.suggestion[k]) draft[k] = p.suggestion[k];
  route = "edit";
  closeModal();
  render();
  window.scrollTo(0, 0);
}
function fieldInput([k, l, kind]) {
  const v = draft[k] ?? "";
  const set = `draft['${k}']=this.value`;
  const wide = ["address", "position", "source", "agencyFee", "commute", "commuteCost", "motivation", "selfPr", "wishes", "tags", "interviewers"].includes(k) || kind === "long" || kind === "history";
  let input;
  if (kind === "category") {
    // Pick one, or type a new job: it appears in the lists on every PC once saved.
    const cats = [...new Set([...state.categories, ...state.people.map((p) => p.category).filter(Boolean)])];
    input = `<input list="catlist" value="${esc(v)}" oninput="${set}" placeholder="選ぶか、新しい職種を入力"><datalist id="catlist">${cats.map((c) => `<option value="${esc(c)}"></option>`).join("")}</datalist>`;
  } else if (kind === "history") input = `<div class="hist" id="hist-${k}">${histEditor(k)}</div>`; else if (kind === "stage") input = `<select onchange="${set}">${STAGES.map(([s, n]) => `<option value="${s}" ${v === s ? "selected" : ""}>${n}</option>`).join("")}</select>`;
  else if (kind === "rating") input = `<select onchange="${set}"><option value="">（未評価）</option>${[5, 4, 3, 2, 1].map((n) => `<option value="${n}" ${String(v) === String(n) ? "selected" : ""}>${stars(n)}</option>`).join("")}</select>`;
  else if (kind === "datetime") input = `<input type="datetime-local" value="${esc(toLocalInput(v))}" onchange="draft['${k}']=fromLocalInput(this.value)">`;
  else if (kind === "date") input = `<input type="date" value="${esc(v)}" oninput="${set}">`;
  else if (kind === "long") input = `<textarea rows="5" oninput="${set}">${esc(v)}</textarea>`;
  else if (kind === "area") input = `<textarea style="min-height:${k === "address" ? 80 : 50}px" rows="${k === "address" ? 2 : 1}" oninput="${set}">${esc(v)}</textarea>`;
  else input = `<input type="text" value="${esc(v)}" oninput="${set}" ${k === "kana" ? 'placeholder="やまだ はなこ"' : ""}>`;
  const changed = draft.fromSuggestion && String(draft.base[k] || "") !== String(v || "") && draft.base[k];
  return `<label class="${wide ? "span2" : ""}"><span class="label">${l}${changed ? ` <small class="was">変更前：${esc(String(draft.base[k]).slice(0, 30))}</small>` : ""}</span>${input}</label>`;
}
// Education, work history and licences are kept as lines "YYYY-MM text" (readable in Obsidian);
// here they are edited row by row.
function histParse(text) {
  return String(text || "")
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => {
      const m = /^\s*(\d{4})[-/年.](\d{1,2})月?\s*(.*)$/.exec(l) || /^\s*(\d{4})年?\s+(.*)$/.exec(l);
      if (m && m.length === 4) return { ym: `${m[1]}-${pad2(+m[2])}`, text: m[3].trim() };
      if (m) return { ym: m[1] + "-01", text: m[2].trim() };
      return { ym: "", text: l.trim() };
    });
}
const histJoin = (rows) => rows.filter((r) => r.ym || r.text.trim()).map((r) => [r.ym, r.text.trim()].filter(Boolean).join(" ")).join("\n");
const histRows = {};
const HIST_PH = { education: "例：○○看護専門学校 看護学科 卒業", career: "例：○○病院 内科病棟 看護師 入職", licenses: "例：看護師免許 取得" };
function histEditor(k) {
  histRows[k] = histParse(draft[k]);
  if (!histRows[k].length) histRows[k].push({ ym: "", text: "" });
  return histHtml(k);
}
function histHtml(k) {
  return `${histRows[k]
    .map(
      (r, i) =>
        `<div class="histrow"><input type="month" value="${esc(r.ym)}" aria-label="年月" onchange="histSet('${k}',${i},'ym',this.value)"><input value="${esc(r.text)}" placeholder="${HIST_PH[k] || ""}" oninput="histSet('${k}',${i},'text',this.value)"><button class="noflex" onclick="histDel('${k}',${i})" aria-label="行を削除">${icon("close")}</button></div>`,
    )
    .join("")}<div class="row"><button class="outline noflex" onclick="histAdd('${k}')">${icon("plus")}行を追加</button><button class="noflex" onclick="histSort('${k}')">年月順に並べる</button></div>`;
}
function histRedraw(k, focusLast = false) {
  draft[k] = histJoin(histRows[k]);
  $("hist-" + k).innerHTML = histHtml(k);
  if (focusLast) [...$("hist-" + k).querySelectorAll(".histrow input:not([type=month])")].at(-1)?.focus();
}
function histSet(k, i, f, v) {
  histRows[k][i][f] = v;
  draft[k] = histJoin(histRows[k]);
}
function histAdd(k) {
  histRows[k].push({ ym: "", text: "" });
  histRedraw(k, true);
}
function histDel(k, i) {
  histRows[k].splice(i, 1);
  if (!histRows[k].length) histRows[k].push({ ym: "", text: "" });
  histRedraw(k);
}
function histSort(k) {
  histRows[k] = histRows[k].filter((r) => r.ym || r.text.trim()).sort((a, b) => (a.ym || "9999").localeCompare(b.ym || "9999"));
  if (!histRows[k].length) histRows[k].push({ ym: "", text: "" });
  histRedraw(k);
}
function histTable(text) {
  const rows = histParse(text);
  return `<table class="histtable"><tbody>${rows.map((r) => `<tr><td>${esc(r.ym ? r.ym.replace("-", "年") + "月" : "")}</td><td>${esc(r.text)}</td></tr>`).join("")}</tbody></table>`;
}
function editPage() {
  const p = getPerson();
  if (!draft || !p) {
    draft = null;
    route = p ? "detail" : "home";
    return p ? detail() : home();
  }
  const warn = draft.fromSuggestion && p.suggestion?.warnings;
  const moved = p.updated !== draft.baseUpdated;
  return `${backbar(draft.fromSuggestion ? "読み取り結果の確認" : "応募者を編集")}${moved ? `<div class="tip warning gap" id="moved">この応募者は、編集中に別の端末でも更新されました。保存すると、ここで変えた項目だけを上書きします。</div>` : ""}${
    draft.pages.length ? `<div class="pages compact">${draft.pages.map((pg, i) => `<button class="page" onclick="viewImage(${i},true)"><img class="pageimg" src="${img(pg.file)}" alt="${i + 1}ページ"></button>`).join("")}</div>` : ""
  }${draft.fromSuggestion ? `<div class="tip gap">${icon("spark")} Geminiの読み取り結果です。履歴書の画像と見比べて、氏名・生年月日・連絡先・資格を確認してください。<button class="link" onclick="discardSuggestion()">結果を破棄</button></div>` : ""}${warn ? `<div class="tip warning gap">注意：${esc(warn)}</div>` : ""}${groups
    .map(([h, list]) => `<div class="panel gap"><h3>${h}</h3><div class="grid2">${list.map(fieldInput).join("")}</div></div>`)
    .join("")}<p class="caption">複数の電話・メールは改行で区切れます。</p><div class="fixedsave">${
    can("contacts") && !p.contactId && !p.contactUnlinked
      ? `<button class="primary full" onclick="savePerson(false)">${icon("check")}保存</button><button class="outline full" onclick="savePerson(true)">${icon("user")}保存してGoogle連絡先に登録</button>`
      : `<button class="primary full" onclick="savePerson(false)">${icon("check")}保存${p.contactId ? "（Google連絡先にも反映）" : ""}</button>`
  }</div>`;
}
function savePerson(thenContact) {
  if (!String(draft.name || "").trim()) return toast("氏名を入力してください");
  const person = {};
  for (const k of FIELDS) if (String(draft[k] ?? "") !== String(draft.base[k] ?? "")) person[k] = draft[k] ?? "";
  person.status = "confirmed";
  person.acceptSuggestion = !!draft.fromSuggestion;
  call("save", { id: selected, person, thenContact });
}
function discardSuggestion() {
  if (!confirm("この読み取り結果を破棄しますか？")) return;
  draft = null;
  route = "detail";
  call("discardRecognition", { id: selected });
}
function addNote() {
  const text = noteDraft.trim();
  if (!text) return;
  call(editNoteId ? "editNote" : "note", { id: selected, text, noteId: editNoteId });
  noteDraft = "";
  editNoteId = "";
  if ($("note")) $("note").blur();
}
function editNote(i) {
  const n = getPerson().notes[i];
  noteDraft = n.text;
  editNoteId = n.id;
  render();
  $("note").focus();
  $("note").scrollIntoView({ block: "center" });
}
function removeItem(key, index) {
  if (confirm(key === "pages" ? "このページを外しますか？元のファイルは保管されます。" : key === "documents" ? "この書類を外しますか？" : "このメモを削除しますか？")) call("removeItem", { id: selected, key, index });
}
function deletePerson() {
  const p = getPerson();
  if (!p.contactId) {
    if (confirm("この応募者の記録（応募書類・メモを含む）を削除しますか？Theta Vault のゴミ箱フォルダに移ります。")) call("delete", { id: selected });
    return;
  }
  modal(
    `<h2>${esc(title(p))} を削除</h2><p class="caption">応募者の記録（応募書類・メモ）を Theta Vault のゴミ箱フォルダに移します。</p><div class="mlist">${menuRow("trash", "記録とGoogle連絡先を削除", "このアプリで登録した連絡先も消します", "closeModal();call('delete',{id:selected,withContact:true})", "dangerrow")}${menuRow("trash", "記録だけ削除", "Google連絡先は残します", "closeModal();call('delete',{id:selected})", "dangerrow")}</div>`,
  );
}

// ---- Same person twice -------------------------------------------------------------------
// A second application, or the same résumé imported twice: same e-mail, mobile number, or the
// same name with the same birth date.
function dupes() {
  const n = (x) => String(x || "").normalize("NFKC").toLowerCase().replace(/[\s　]/g, "");
  const index = {};
  const add = (k, id) => (index[k] = index[k] || []).push(id);
  for (const p of state.people) {
    for (const e of String(p.email || "").split(/[\n,;]/)) if (n(e).includes("@")) add("m:" + n(e), p.id);
    for (const t of String(p.mobile || "").split(/[\n,;]/)) {
      const d = t.replace(/\D/g, "");
      if (d.length >= 10) add("t:" + d.slice(-10), p.id);
    }
    if (n(p.name).length >= 2) add((p.birthDate ? "b:" + p.birthDate + "|" : "n:") + n(p.name), p.id);
  }
  const reason = { m: "同じメールアドレス", t: "同じ携帯番号", b: "同じ氏名・生年月日", n: "同じ氏名" };
  const pairs = new Map();
  for (const [k, ids] of Object.entries(index)) {
    const u = [...new Set(ids)];
    for (let i = 0; i < u.length; i++)
      for (let j = i + 1; j < u.length; j++) {
        const key = [u[i], u[j]].sort().join("|");
        if (!pairs.has(key)) pairs.set(key, { a: u[i], b: u[j], why: new Set() });
        pairs.get(key).why.add(reason[k[0]]);
      }
  }
  const byId = Object.fromEntries(state.people.map((p) => [p.id, p]));
  return [...pairs.values()].filter((x) => !(byId[x.a].notDuplicate || []).includes(x.b) && !byId[x.a].queue && !byId[x.b].queue);
}
let dupOrigin = false,
  dupOpen = false,
  dupReturn = false,
  busyNow = false;
const dupPick = new Set();
function dupKey(d, byId) {
  const [older, newer] = [byId[d.a], byId[d.b]].sort((x, y) => x.created - y.created);
  return newer.id + ":" + older.id;
}
function dupSheet() {
  dupOrigin = true;
  const byId = Object.fromEntries(state.people.map((p) => [p.id, p]));
  const who = (p) =>
    `<button class="duprow" onclick="openPerson('${p.id}')">${avatar(p, "small")}<span><b>${esc(title(p))}</b><small>${esc(job(p))} ・ ${stageLabel(p.stage)}<br>応募 ${esc(when(p.appliedDate, true))} ・ 追加 ${esc(date(p.created))}</small></span></button>`;
  const list = dupes();
  const keys = list.map((d) => dupKey(d, byId));
  for (const k of [...dupPick]) if (!keys.includes(k)) dupPick.delete(k);
  const items = list
    .map((d, i) => {
      const [older, newer] = [byId[d.a], byId[d.b]].sort((x, y) => x.created - y.created);
      return `<div class="dupitem"><label class="dupcheck"><input type="checkbox" ${dupPick.has(keys[i]) ? "checked" : ""} onchange="dupToggle('${keys[i]}',this.checked)">選択</label>${who(newer)}${who(older)}<p class="caption">${[...d.why].join("・")}</p><div class="row"><button class="primary" onclick="mergePair('${newer.id}','${older.id}')">1人にまとめる</button><button class="noflex" onclick="dupAgain();call('notDuplicate',{id:'${d.a}',other:'${d.b}'});closeModal()">別人</button></div></div>`;
    })
    .join("");
  const all = list.length && dupPick.size === list.length;
  modal(
    `<h2>${icon("link")} 同じ人の可能性 <small>${list.length}件</small></h2><p class="caption">「1人にまとめる」は新しい方の内容を優先し、古い方の応募書類・メモを引き継ぎます。以前の応募の記録を残したいときは「別人」を選んでください。</p>${
      list.length > 1 ? `<div class="row gap"><button class="outline" onclick="dupSelectAll(${!all})">${all ? "選択を解除" : "すべて選択"}</button></div>` : ""
    }${items || '<p class="caption">該当はありません。</p>'}${list.length ? `<div class="dupbulk"><button class="primary full" ${dupPick.size ? "" : "disabled"} onclick="dupBulk()">${icon("link")}選択した ${dupPick.size}件をまとめる</button></div>` : ""}`,
  );
  dupOpen = true;
}
function dupRedraw() {
  const keep = $("modal").querySelector(".sheet")?.scrollTop || 0;
  dupSheet();
  const sheet = $("modal").querySelector(".sheet");
  if (sheet) sheet.scrollTop = keep;
}
function dupToggle(k, on) {
  on ? dupPick.add(k) : dupPick.delete(k);
  dupRedraw();
}
function dupSelectAll(on) {
  const byId = Object.fromEntries(state.people.map((p) => [p.id, p]));
  dupPick.clear();
  if (on) for (const d of dupes()) dupPick.add(dupKey(d, byId));
  dupSheet();
}
function dupBulk() {
  const keys = [...dupPick];
  if (!keys.length || !confirm(`選択した${keys.length}件をまとめますか？`)) return;
  dupPick.clear();
  dupAgain();
  closeModal();
  call("mergeBatch", { pairs: keys.map((k) => k.split(":")) });
}
function dupAgain() {
  dupReturn = dupOrigin;
}
function dupBack() {
  if (!dupReturn || busyNow) return;
  dupReturn = false;
  if (dupOpen || route !== "home") return;
  if (dupes().length) dupSheet();
  else toast("同じ人の可能性はすべて片付きました");
}
function mergePair(target, source) {
  if (!confirm("2件の記録を1人にまとめますか？")) return;
  closeModal();
  dupAgain();
  call("merge", { id: target, sourceId: source, stay: true });
}
function viewImage(i, readOnly = false) {
  const p = getPerson(),
    pg = p.pages[i];
  const tools = readOnly
    ? ""
    : `<div class="viewtools">${i > 0 ? `<button onclick="closeModal();call('reorder',{id:selected,from:${i},to:${i - 1}})">${icon("back")}前へ</button>` : ""}<button onclick="call('shareImage',{id:selected,index:${i}})">${icon("share")}${state.platform === "desktop" ? "フォルダで表示" : "共有"}</button><button onclick="closeModal();removeItem('pages',${i})">${icon("trash")}外す</button></div>`;
  modal(`<img src="${img(pg.file)}" alt="${i + 1}ページ"><p style="font-size:12px">${esc(pg.name)}</p>${tools}`, true);
}
function viewFile(file) {
  modal(`<img src="${img(file)}" alt="拡大">`, true);
}
function mergeSheet() {
  const candidates = state.people.filter((p) => p.id !== selected);
  if (!candidates.length) return toast("まとめられる別の記録がありません");
  modal(
    `<h2>同じ人の記録をまとめる</h2><p class="caption">選んだ記録の応募書類・メモを、いま開いている人へ移します。空欄の項目だけ補います。</p><select id="mergeid">${candidates.map((p) => `<option value="${p.id}">${esc(title(p))} / ${esc(job(p))} / 応募 ${esc(p.appliedDate)}</option>`).join("")}</select><button class="primary full gap" onclick="if(confirm('1人にまとめますか？')){const sourceId=$('mergeid').value;closeModal();call('merge',{id:selected,sourceId})}">この人にまとめる</button>`,
  );
}

// ---- Import ----------------------------------------------------------------------------------
const groupings = [
  ["file", "1ファイル = 1人", "履歴書・職務経歴書を1人1つのPDFにした場合（ふつうはこれ）"],
  ["all", "選んだ全部 = 1人", "1人分の書類が複数のファイル・画像に分かれている場合"],
  ["page", "1ページ = 1人", "1枚ものの履歴書をまとめてスキャンした場合"],
  ["pair", "2ページずつ = 1人", "見開き2ページの履歴書を続けてスキャンした場合"],
];
function importSheet(action) {
  const cats = state.categories || [];
  modal(
    `<h2>${icon("plus")} 履歴書を取り込む</h2><p class="caption">PDF・画像を選ぶと、Geminiが読み取って応募者を登録します（自動読み取りがオンのとき）。${state.platform === "desktop" ? "ファイルをこの画面にドラッグ＆ドロップしても取り込めます（1ファイル = 1人）。" : ""}</p><label class="label">職種（分かっていれば。空なら読み取りで判断）</label><select id="impcat"><option value="">（読み取りで判断）</option>${cats.map((c) => `<option>${esc(c)}</option>`).join("")}</select><label class="label">ページのまとめ方</label><div class="mlist">${groupings
      .map(([v, l, sub]) => menuRow(v === "file" ? "doc" : v === "all" ? "grid" : "list", l + (mode === v && v !== "file" ? "（前回）" : ""), sub, `mode='${v}';importGo('${action === "scan" ? "pick" : action}','${v}')`))
      .join("")}${action === "scan" ? menuRow("camera", state.platform === "android" ? "スキャン（書類を自動で切り抜き）" : "カメラで撮影", "紙の履歴書を1人分撮影（何枚でも）", "importGo('scan','all')") : ""}${can("camera") ? menuRow("camera", state.platform === "desktop" ? "PCのカメラで撮影" : "カメラで撮影（画面で確認しながら）", "紙の履歴書を1人分、何ページでも", "importCamera()") : ""}${
      can("folder") ? menuRow("folder", "フォルダから取り込む", "フォルダ内のPDF・画像を一括（1ファイル = 1人。取り込み済みは飛ばします）", "importGo('folder','file')") : ""
    }${can("folder") && state.folder ? menuRow("rotate", "前回のフォルダを再確認", esc(state.folder), "importGo('rescan','file')") : ""}${menuRow("edit", "手入力で追加", "書類なしで登録", "closeModal();manualAdd()")}</div>`,
  );
}
function importCamera() {
  const category = $("impcat") ? $("impcat").value : "";
  cameraSheet({ category });
}
function importGo(action, m) {
  const category = $("impcat") ? $("impcat").value : "";
  closeModal();
  call(action, { mode: m, category });
}
let editOnOpen = false;
function manualAdd() {
  editOnOpen = true;
  call("new");
}

// ---- Google, sync and contacts settings -------------------------------------------------------
const setupDone = new Set();
function copyText(text) {
  if (window.ThetaCopy) return ThetaCopy(text).then(() => toast("コピーしました"));
  if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(() => toast("コピーしました"), () => toast("コピーできませんでした"));
  else {
    const t = document.createElement("textarea");
    t.value = text;
    document.body.appendChild(t);
    t.select();
    document.execCommand("copy");
    t.remove();
    toast("コピーしました");
  }
}
function setupSteps() {
  const web = state.platform === "web";
  const copy = (label, value) => `<div class="copyrow"><small>${label}</small><code>${esc(value)}</code><button class="outline noflex" onclick="copyText('${esc(value)}')">コピー</button></div>`;
  return [
    ["project", "プロジェクトを作る", "名前は「mensetsu」など何でも。Gemini APIキーを作ったプロジェクトがあれば、それを選んで次へ。", "projectcreate", ""],
    ["drive", "Google Drive API を有効にする", "開いた画面で「有効にする」（画面上部のプロジェクトが1のものか確認）。", "apis/library/drive.googleapis.com", ""],
    ["people", "Google People API を有効にする", "連絡先の登録とラベルに使います。「有効にする」。", "apis/library/people.googleapis.com", ""],
    ["consent", "同意画面（Google Auth Platform）を作る", "「開始」→ アプリ名「Theta Mensetsu Hatch」、サポートメールに自分のアドレス → 対象は「外部」→ 連絡先に自分のアドレス → 同意して「作成」。", "auth/overview", ""],
    ["testuser", "使うGoogleアカウントを追加", "「対象」→「テストユーザー」→「Add users」→ 同期・連絡先に使うGoogleアカウント（連絡先を別のアカウントにするなら両方）を追加して保存。", "auth/audience", ""],
    ["publish", "公開ステータスを「本番環境」にする", "同じ「対象」の画面で「アプリを公開」→「確認」。テストのままだと7日ごとにログインし直しになります（自分たちだけで使うので、Googleの審査は不要です。ログイン時に「確認されていません」と出たら「続行」）。", "auth/audience", ""],
    state.platform === "android"
      ? ["client", "Android用のクライアントを作る", "種類「Android」→ 下の2つを貼り付けて「作成」。クライアントIDをアプリに入れる必要はありません（PC版・ブラウザ版も使うなら、それぞれのクライアントも同じプロジェクトに作ります）。", "auth/clients/create", (state.appPackage ? copy("パッケージ名", state.appPackage) : "") + (state.appSha1 ? copy("SHA-1 証明書フィンガープリント", state.appSha1) : "")]
      : web
      ? ["client", "ウェブ用のクライアントを作る", "種類「ウェブ アプリケーション」→「承認済みの JavaScript 生成元」に下のアドレスを追加 → 作成。出てきた「クライアントID」をコピーして、この画面の「Googleアカウント」に貼り付けます。", "auth/clients/create", copy("JavaScript 生成元", location.origin)]
      : ["client", "デスクトップ用のクライアントを作る", "種類「デスクトップ アプリ」→ 名前は何でも →「作成」。出てきた「クライアントID」と「クライアント シークレット」を、この画面の「Googleアカウント」に貼り付けます（PCのアプリでは、このシークレットは秘密の鍵ではありません）。", "auth/clients/create", ""],
  ];
}
function setupGuide(reason = "") {
  const steps = setupSteps();
  const done = steps.filter(([k]) => setupDone.has(k)).length;
  modal(
    `<h2>${icon("cloud")} Google連携の初期設定</h2>${reason ? `<div class="tip warning">${esc(reason)}</div>` : ""}<p class="caption">Googleドライブ同期と連絡先の登録には、Google Cloudに「このアプリ」を1回だけ登録します（無料・10分ほど）。各手順の「開く」でGoogle Cloudがブラウザで開きます。</p><ol class="setup-steps">${steps
      .map(
        ([k, t, how, path, extra], i) =>
          `<li class="${setupDone.has(k) ? "done" : ""}"><label class="stepcheck"><input type="checkbox" ${setupDone.has(k) ? "checked" : ""} onchange="this.checked?setupDone.add('${k}'):setupDone.delete('${k}');setupGuide()"><b>${i + 1}. ${t}</b></label><small>${how}</small>${extra}<button class="outline" onclick="call('openUrl',{url:'https://console.cloud.google.com/${path}'})">${icon("next")}開く</button></li>`,
      )
      .join("")}</ol><p class="caption">${done}/${steps.length} 完了。作ったばかりの設定は、反映まで数分かかることがあります。</p><button class="primary full gap" onclick="googleSheet()">${icon("user")}${state.platform === "android" ? "Googleアカウントへ" : "クライアントIDを入れる"}</button>`,
  );
}
function accountBlock(purpose, acc, label) {
  if (!state.googleReady) return "";
  const email = acc?.email || "";
  return `<div class="acct"><span class="mi">${icon(purpose === "contacts" ? "user" : "cloud")}</span><span class="mt"><b>${label}</b><small>${acc?.signedIn ? "ログイン中：" + esc(email) : email ? esc(email) + "（ログインが切れています）" : "未ログイン"}</small></span>${
    acc?.signedIn
      ? `<button class="outline noflex" onclick="closeModal();call('googleSignIn',{purpose:'${purpose}'})">変更</button><button class="noflex" onclick="if(confirm('ログアウトしますか？'))call('googleSignOut',{purpose:'${purpose}'})">ログアウト</button>`
      : `<button class="primary noflex" onclick="closeModal();call('googleSignIn',{purpose:'${purpose}'})">ログイン</button>`
  }</div>`;
}
function googleSheet() {
  const desktop = state.platform !== "web";
  const android = state.platform === "android";
  modal(
    `<h2>${icon("cloud")} Googleアカウント</h2><p class="caption">Googleドライブ（Theta Vault）の同期と、Google連絡先への登録に使います。ログインのとき、使うアカウントを選べます。<button class="link" onclick="setupGuide()">初めての方：初期設定ガイド</button></p>${android ? `<p class="tip">スマホでは、Google CloudにAndroid用のクライアント（このアプリのパッケージ名とSHA-1）を登録しておくだけで使えます。クライアントIDを入れる必要はありません。</p>` : `<label class="label">OAuthクライアントID（${desktop ? "種類：デスクトップ アプリ" : "種類：ウェブ アプリケーション"}）</label><input id="gclient" value="${esc(state.googleClientId || "")}" placeholder="123456-xxxx.apps.googleusercontent.com" autocomplete="off" autocapitalize="off">${
      desktop ? `<label class="label">クライアント シークレット ${state.googleClientSecretSet ? "・登録済み" : ""}</label><input id="gsecret" type="password" placeholder="${state.googleClientSecretSet ? "変更するときだけ入力" : "GOCSPX-…"}" autocomplete="off">` : ""
    }<button class="secondary full gap" onclick="call('settings',Object.assign({googleClientId:$('gclient').value},$('gsecret')?{googleClientSecret:$('gsecret').value}:{}))">保存</button>`}${
      state.googleReady
        ? `<div class="mlist gap">${accountBlock("sync", state.googleSync, "同期（Googleドライブ）")}${switchRow("users", "連絡先は別のアカウントに登録", "採用用のアカウントなどに分けるとき", state.contactsSeparate, "call('settings',{contactsSeparate:this.checked})")}${state.contactsSeparate ? accountBlock("contacts", state.googleContacts, "Google連絡先の登録先") : ""}</div>`
        : ""
    }${android ? `<p class="caption gap">一度許可すると、あとは自動で同期します（アプリを開いたとき・閉じたとき・3分ごと）。</p>` : desktop ? `<p class="caption gap">このPCはログインを覚えているので、裏で自動的に同期します（ログイン情報はWindowsの資格情報保護／Macのキーチェーンで暗号化して保存）。</p>` : `<p class="caption gap">ブラウザ版のログインは約1時間で切れます。切れたらホーム画面の「Googleにログイン」を押してください。</p>`}`,
  );
}
function syncSheet() {
  const desktop = state.platform !== "web";
  const drive = state.syncMode === "drive";
  const signed = state.googleSync?.signedIn;
  modal(
    `<h2>${icon("cloud")} 同期</h2><p class="caption">応募者のデータ（1人1つのMarkdownと応募書類の画像）を、Googleドライブの「マイドライブ/Theta Vault/Mensetsu」で共有します。複数のPC・ブラウザで同じ内容を使え、同時に編集しても項目ごとにまとめます（食い違った値はメモに残します）。</p>${
      desktop
        ? `<label class="label">同期の方法</label><div class="mlist"><label class="mrow"><span class="mi">${icon("cloud")}</span><span class="mt"><b>アプリがGoogleドライブと直接同期（おすすめ）</b><small>変更してすぐ・3分ごと・画面を開いたときに同期。Googleドライブのパソコン版は不要</small></span><input type="radio" name="sm" ${drive ? "checked" : ""} onchange="call('settings',{syncMode:'drive'})"></label><label class="mrow"><span class="mi">${icon("folder")}</span><span class="mt"><b>フォルダの同期に任せる</b><small>Theta Vault フォルダを Googleドライブ（パソコン版）・OneDrive などで同期している場合</small></span><input type="radio" name="sm" ${drive ? "" : "checked"} onchange="call('settings',{syncMode:'folder'})"></label></div>${
            drive && state.vaultInCloud ? `<div class="tip warning gap">Theta Vault フォルダが Googleドライブ（パソコン版）などの同期フォルダの中にあります。二重に同期しないよう、「フォルダの同期に任せる」にするか、フォルダを書類フォルダなどに移してください。</div>` : ""
          }`
        : ""
    }${
      drive
        ? `<div class="mlist gap">${!state.googleReady ? menuRow("help", "Google連携の初期設定", "最初に1回だけ", "setupGuide()", "attnrow") : !signed ? menuRow("user", "Googleにログイン", "Theta Vault を置くアカウントを選びます", "closeModal();call('googleSignIn',{purpose:'sync'})", "attnrow") : ""}${
            signed
              ? state.syncEnabled
                ? menuRow("rotate", "今すぐ同期", (state.syncError ? "⚠ " + esc(state.syncError) + " ・ " : "") + (state.lastSync ? "最終同期 " + esc(date(state.lastSync)) : "まだ同期していません") + " ・ " + esc(state.googleSync.email), "closeModal();call('syncNow')", state.syncError ? "attnrow" : "") +
                  menuRow("close", "同期をやめる", "Googleドライブのデータは残ります", "if(confirm('同期をやめますか？Googleドライブのデータは削除されません。')){closeModal();call('syncStop')}")
                : menuRow("cloud", "同期を始める", esc(state.googleSync.email) + " のGoogleドライブ", "closeModal();call('syncNow')", "attnrow")
              : ""
          }</div>`
        : ""
    }${desktop ? `<div class="mlist gap">${menuRow("folder", "Theta Vault フォルダ（このPC）", esc(state.vaultPath || "未設定") + (state.vaultWarnings?.length ? ` ・ ⚠ 読み込めないノート ${state.vaultWarnings.length}件` : ""), "call('chooseVault')", state.vaultWarnings?.length ? "attnrow" : "")}</div><p class="caption">Obsidianでこのフォルダを開くと、応募者のノートを閲覧・編集できます（編集は数秒で画面に反映され、同期されます）。</p>` : ""}${
      state.vaultWarnings?.length ? `<div class="tip warning gap">${state.vaultWarnings.map(esc).join("<br>")}</div>` : ""
    }`,
  );
}
function contactSettingsSheet() {
  modal(
    `<h2>${icon("user")} Google連絡先への登録</h2><p class="caption">応募者を連絡先に入れると、電話がかかってきたときに誰か分かります。名刺や普段の連絡先と混ざらないよう、ラベルで分けて登録します（スマホの連絡先アプリでもラベルで絞り込めます）。</p><label class="label">ラベル名（空にするとラベルなし）</label><input id="clabel" value="${esc(state.contactLabel || "")}" placeholder="面接応募者"><label class="label">施設名（連絡先の「会社」欄。任意）</label><input id="corg" value="${esc(state.contactOrg || "")}" placeholder="例：○○病院 採用"><button class="secondary full gap" onclick="call('settings',{contactLabel:$('clabel').value,contactOrg:$('corg').value})">保存</button><div class="mlist gap">${[
      switchRow("tag", "職種ごとのラベルも付ける", `例：「${esc(state.contactLabel || "面接応募者")}・看護師」`, state.contactLabelByCategory, "call('settings',{contactLabelByCategory:this.checked})"),
      switchRow("user", "名前の後ろに職種を付ける", "例：山田 花子（看護師 応募者）。着信の画面で分かります", state.contactSuffix, "call('settings',{contactSuffix:this.checked})"),
      switchRow("image", "顔写真を連絡先の写真にする", "", state.contactPhoto !== "none", "call('settings',{contactPhoto:this.checked?'portrait':'none'})"),
      switchRow("spark", "読み取ったら自動で登録", "オフなら、応募者ごとに「Google連絡先に登録」を押します", state.autoContact, "call('settings',{autoContact:this.checked})"),
      menuRow("users", "登録先のGoogleアカウント", state.contactsSeparate ? (state.googleContacts?.email ? esc(state.googleContacts.email) : "未ログイン") : (state.googleSync?.email ? esc(state.googleSync.email) + "（同期と同じ）" : "未ログイン"), "googleSheet()"),
      menuRow("rotate", "登録済みの連絡先を今の設定で更新", "ラベル・名前の付け方を変えたあとに", "if(confirm('登録済みの応募者の連絡先を、今の設定で更新しますか？')){closeModal();call('contactsRelabel')}"),
      menuRow("trash", "不採用・辞退の人の連絡先を削除", "選考が終わったら。応募者の記録は残ります", "if(confirm('選考状況が「不採用」「辞退」の応募者のGoogle連絡先を削除しますか？（Googleコンタクトのゴミ箱に30日残ります）')){closeModal();call('contactsCleanup')}", "dangerrow"),
    ].join("")}</div><p class="tip gap">面接メモ・評価・学歴などは連絡先に送りません（氏名・ふりがな・電話・メール・住所・職種・応募日・面接日時だけ）。</p>`,
  );
}
function categorySheet() {
  modal(
    `<h2>${icon("grid")} 職種の一覧</h2><p class="caption">1行に1つ。並べた順に表示します。Geminiはこの中から最も近い職種を選びます。</p><textarea id="cats" rows="12">${esc((state.categories || []).join("\n"))}</textarea><button class="primary full gap" onclick="call('settings',{categories:$('cats').value});closeModal()">保存</button><button class="outline full" onclick="if(confirm('最初の一覧に戻しますか？')){call('settings',{categories:''});closeModal()}">最初の一覧に戻す</button>`,
  );
}
function menuPage() {
  const unread = state.people.filter((p) => p.status === "new" && p.pages.length).length;
  const section = (h, rows) => `<div class="msection"><small>${h}</small><div class="mlist">${rows.join("")}</div></div>`;
  const syncSub =
    state.syncMode === "folder"
      ? "フォルダの同期に任せる ・ " + esc(state.vaultPath || "")
      : !state.syncEnabled
        ? "オフ ・ 複数のPCで使うときは設定してください"
        : state.syncError
          ? "⚠ " + esc(state.syncError)
          : state.lastSync
            ? "最終同期 " + esc(date(state.lastSync))
            : "まだ同期していません";
  return `<header class="top"><div class="brand"><div class="mark">${icon("menu")}</div><div><div class="brandline">MENU</div><h1>メニュー</h1></div></div></header>${section("取り込み", [
    menuRow("plus", "履歴書を取り込む", "PDF・画像（まとめ方・職種を選べます）", "importSheet('pick')"),
    only("scan", menuRow("camera", "紙の履歴書を撮影", "", "importSheet('scan')")),
    only("folder", menuRow("folder", "フォルダから取り込む", "メールで届いたPDFを保存したフォルダなど", "call('folder',{mode:'file'})")),
    menuRow("edit", "手入力で追加", "書類なしで登録", "manualAdd()"),
  ])}${section("読み取り", [
    menuRow("spark", "未読み取りをまとめて読み取る", unread ? unread + "件が未読み取り" : "未読み取りの応募者はいません", "batchRecognize()"),
    `<label class="mrow"><span class="mi">${icon("spark")}</span><span class="mt"><b>取り込み後に自動で読み取る</b><small>バックグラウンドで処理します</small></span><input type="checkbox" class="switch" ${state.autoRecognize !== false ? "checked" : ""} onchange="call('settings',{autoRecognize:this.checked})"></label>`,
    menuRow("spark", "Gemini APIキー・モデル", state.keySet ? "登録済み ・ " + esc(state.model) : "未設定", "go('gemini')", state.keySet ? "" : "attnrow"),
  ])}${only("sync", section("同期・Google", [
    menuRow("cloud", "同期", syncSub, "syncSheet()", state.syncError ? "attnrow" : ""),
    menuRow("user", "Googleアカウント", state.googleReady ? (state.googleSync?.email ? esc(state.googleSync.email) + (state.googleSync.signedIn ? "" : "（ログインが切れています）") : "未ログイン") : "未設定（同期・連絡先に必要）", "googleSheet()", state.googleReady ? "" : "attnrow"),
    menuRow("help", "Google連携の初期設定ガイド", "最初に1回だけ（Google Cloudへの登録）", "setupGuide()"),
  ]))}${section("整理", [
 menuRow("map", "勤務先の住所", state.workplace ? esc(state.workplace) : "未設定（通勤の概算に使います）", "workplaceSheet()"),
    menuRow("check", "採用手続きのひな形", `${(state.checklistTemplate || []).length}項目（健康診断・免許の持参・契約など）`, "checklistSheet()"),
    menuRow("grid", "職種の一覧", (state.categories || []).slice(0, 6).map(esc).join("・") + ((state.categories || []).length > 6 ? "…" : ""), "categorySheet()"),
    only("contacts", menuRow("user", "Google連絡先への登録", (state.contactLabel ? "ラベル「" + esc(state.contactLabel) + "」" : "ラベルなし") + (state.autoContact ? " ・ 自動" : " ・ 手動"), "contactSettingsSheet()")),
    menuRow("link", "同じ人の可能性", dupes().length ? dupes().length + "件" : "ありません", "dupSheet()"),
  ])}${only("export", section("書き出し", [
    menuRow("table", "一覧をCSVで書き出す", "Excelで開けるUTF-8 CSV（すべての応募者）", "call('export',{})"),
    menuRow("table", "今の絞り込みのままCSVで書き出す", esc((FILTERS.find((x) => x[0] === filter) || [])[1] || "") + (catFilter ? "・" + esc(catFilter) : "") + `（${filtered().length}人）`, "call('export',{ids:filtered().map(p=>p.id)})"),
  ]))}<p class="footnote">Theta Mensetsu Hatch ${state.version ? esc(state.version) + " ・ " : ""}${state.platform === "android" ? "Android版<br>データはこのスマホに保存し、Googleドライブの Theta Vault と同期します。" : state.platform === "web" ? "ブラウザ版<br>データはこのブラウザに保存し、Googleドライブの Theta Vault と同期します。" : "PC版<br>データは Theta Vault フォルダ（Markdown＋画像）に保存されます。"}</p>`;
}
function geminiPage() {
  if (!settingsDraft) settingsDraft = { key: "", model: state.model, format: state.format };
  return `${backbar("Gemini APIキー・モデル")}<section class="panel"><p class="caption">APIキーはこの${state.platform === "web" ? "ブラウザ" : state.platform === "android" ? "スマホ（暗号化）" : "PC"}の中に保存します（同期・書き出しには含めません）。</p><label class="label">Gemini APIキー ${state.keySet ? "・登録済み" : ""}</label><input type="password" autocomplete="off" value="${esc(settingsDraft.key)}" placeholder="${state.keySet ? "変更する時だけ入力" : "AIza…"}" oninput="settingsDraft.key=this.value"><label class="label">モデル名</label><input id="model" value="${esc(settingsDraft.model)}" oninput="settingsDraft.model=this.value" autocomplete="off"><p class="caption">利用できるモデルはAPIキーごとに異なります。保存後に「モデル一覧」から選べます。</p><details class="gap"><summary class="caption">詳細設定</summary><label class="label">API互換設定（通常は変更不要）</label><select onchange="settingsDraft.format=this.value"><option value="legacy" ${settingsDraft.format === "legacy" ? "selected" : ""}>標準</option><option value="modern" ${settingsDraft.format === "modern" ? "selected" : ""}>新しいモデル向け</option></select></details><div class="row gap"><button class="primary" onclick="saveSettings()">保存</button><button class="outline" onclick="call('models')">モデル一覧</button></div>${state.keySet ? `<button class="danger full gap" onclick="if(confirm('保存しているAPIキーを削除しますか？'))call('settings',{clearKey:true})">APIキーを削除</button>` : ""}</section><div class="tip warning"><b>個人情報の取り扱い</b><br>読み取りのとき、履歴書の画像をGoogleのGemini APIへ送ります。<b>無料枠のAPIキーでは、送った内容がGoogleのサービス改善に使われることがあります。</b>応募者の個人情報を扱うため、請求先アカウント（有料）を設定したプロジェクトのAPIキーを使ってください（履歴書1枚あたりの費用は1円前後の目安です）。施設の個人情報の規程も確認してください。</div>`;
}
function saveSettings() {
  call("settings", { ...settingsDraft });
  settingsDraft.key = "";
}
function batchRecognize() {
  if (!state.keySet) return report("先に「Gemini APIキー・モデル」でAPIキーを登録してください。");
  const count = state.people.filter((p) => p.status === "new" && p.pages.length).length;
  if (!count) return toast("未読み取りの応募者はいません");
  if (confirm(count + "人分の応募書類をGeminiに送って読み取ります。APIの利用料金がかかる場合があります。")) call("recognizeAll");
}

// ---- Device bridge -----------------------------------------------------------------------------
// Returns false at the list (the phone app then closes), true when it went back a step.
window.handleBack = () => {
  if (!$("busy").hidden) {
    toast("処理が終わるまでお待ちください");
    return true;
  }
  if (modalOpen) {
    if (dupOrigin && !dupOpen && route === "home") dupSheet();
    else closeModal();
    return true;
  }
  if (route === "edit") {
    if (confirm("未保存の編集を破棄しますか？")) {
      draft = null;
      route = "detail";
      render();
    }
    return true;
  }
  if (route === "gemini") return go("menu"), true;
  if (route === "detail" && solo) return window.close(), true;
  if (route === "detail" || route === "menu") return go("home"), true;
  if (route === "home" && (query || catFilter)) {
    query = "";
    catFilter = "";
    render();
    return true;
  }
  return false;
};
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && (modalOpen || route !== "home")) {
    e.preventDefault();
    handleBack();
  } else if ((e.ctrlKey || e.metaKey) && e.key === "f" && route === "home" && $("search")) {
    e.preventDefault();
    $("search").focus();
  }
});
// Coming back to the window: catch up with what other PCs changed.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") call("focus");
});
window.onNative = ({ type, data }) => {
  if (type === "state") {
    state = data;
    if (solo && route === "home") {
      if (!state.people.some((p) => p.id === solo)) {
        $("app").innerHTML = `<main class="shell"><div class="empty"><h2>この応募者は見つかりません</h2><p>削除されたか、まだ同期されていません。</p></div></main>`;
        return;
      }
      selected = solo;
      route = "detail";
    }
    if (pendingOpen && state.people.some((p) => p.id === pendingOpen)) {
      selected = pendingOpen;
      route = "detail";
      pendingOpen = "";
    }
    if (pendingEdit) {
      selected = pendingEdit;
      pendingEdit = "";
      if (getPerson()) return beginEdit();
    }
    if (route === "edit") {
      // Only the notice changes: the form keeps what is being typed.
      const p = getPerson();
      if (!p) {
        draft = null;
        toast("編集中の応募者は他の端末で削除されました");
        route = "home";
      } else {
        if (p.updated !== draft.baseUpdated && !$("moved")) render();
        if (dupOpen) dupRedraw();
        return;
      }
    }
    if (typing()) pendingRender = true;
    else render();
    if (dupOpen) dupRedraw();
    setTimeout(dupBack);
  } else if (type === "busy") {
    busyNow = !!data;
    if (!data) setTimeout(dupBack);
    $("busy").hidden = !data;
    $("busytext").textContent = data;
  } else if (type === "toast") toast(data);
  else if (type === "error" || type === "report") {
    dupReturn = false;
    report(data);
  } else if (type === "open") {
    if (editOnOpen && state.people.some((p) => p.id === data)) {
      editOnOpen = false;
      selected = data;
      beginEdit();
    } else if (state.people.some((p) => p.id === data)) openPerson(data);
    else pendingOpen = data;
  } else if (type === "review") pendingEdit = data;
  else if (type === "queued") {
    if (route !== "edit") route = "home";
    filter = "all";
    render();
    toast(data.ids.length + "人を保存しました。読み取りはバックグラウンドで進めます" + (data.skipped ? `（取り込み済みのため飛ばした ${data.skipped}件）` : ""));
    if (data.errors.length) report("取り込めなかったファイル：\n" + data.errors.join("\n"));
  } else if (type === "home") go("home");
  else if (type === "saved") {
    draft = null;
    route = "detail";
    render();
    toast("保存しました");
  } else if (type === "imported") {
    // One applicant: open it (the state with it has usually arrived already).
    if (data.ids.length === 1) {
      if (state.people.some((p) => p.id === data.ids[0])) openPerson(data.ids[0]);
      else pendingOpen = data.ids[0];
    } else if (route !== "detail" || !data.ids.length) {
      route = "home";
      render();
    }
    const message = `${data.ids.length}人・${data.pages}ページを保存しました。` + (data.skipped ? `\n取り込み済みのため飛ばしたファイル：${data.skipped}` : "");
    if (data.errors.length) report(message + "\n\n取り込めなかったファイル：\n" + data.errors.join("\n"));
    else toast(message);
  } else if (type === "models") {
    modal(
      `<h2>利用できるモデル</h2><p class="caption">履歴書の読み取りには画像入力に対応したFlash系のモデルを選んでください。</p><select id="chooseModel">${data.map((m) => `<option value="${esc(m)}">${esc(m)}</option>`).join("")}</select><button class="primary full gap" onclick="settingsDraft.model=$('chooseModel').value;closeModal();render();toast('モデルを選びました。保存を押してください')">このモデルを選ぶ</button>`,
    );
  }
};
render();
call("boot");
