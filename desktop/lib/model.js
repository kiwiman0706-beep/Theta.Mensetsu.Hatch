// Record rules for applicants, shared by the PC (Electron) and the browser version.
"use strict";
const crypto = require("crypto");
const V = require("./vault-codec");

// Job categories offered by default (the list is editable in the app).
const CATEGORIES = [
  "看護師", "准看護師", "助産師", "看護助手", "介護職", "医師", "薬剤師", "臨床検査技師", "診療放射線技師",
  "理学療法士", "作業療法士", "言語聴覚士", "臨床工学技士", "管理栄養士・栄養士", "調理", "医療事務", "事務", "その他",
];

// What usually has to be done before someone starts at a hospital or clinic (editable in the app).
const CHECKLIST = [
  "採用通知・労働条件通知書の交付",
  "雇用契約書の締結",
  "入職前の健康診断（健康診断書の提出）",
  "抗体価・ワクチン接種歴（B型肝炎・麻疹・風疹・水痘・ムンプス）",
  "免許証の原本確認・写しの提出",
  "資格証・修了証の原本確認・写しの提出",
  "免許の登録確認（厚生労働省 医療資格者の資格確認検索など）",
  "卒業証明書・成績証明書",
  "身元保証書",
  "誓約書・守秘義務の同意書",
  "マイナンバーの確認",
  "基礎年金番号（年金手帳など）",
  "雇用保険被保険者証（前職がある場合）",
  "源泉徴収票（年内に前職がある場合）",
  "扶養控除等申告書・扶養の届け（該当者）",
  "給与振込口座の届け",
  "通勤届・通勤手当の申請",
  "制服・名札・ロッカーの準備",
  "電子カルテ・院内システムのID発行",
  "入職オリエンテーションの日程連絡",
  "紹介会社への採用・入職日の連絡（紹介会社経由の場合）",
];

function empty() {
  const now = Date.now();
  const p = { id: crypto.randomUUID(), created: now, updated: now, status: "new", pages: [], sources: [], notes: [] };
  for (const k of V.FIELDS) p[k] = "";
  p.stage = "received";
  p.appliedDate = today(now);
  return p;
}

// Saving from the edit screen. Only the fields in `input` change: the UI sends just what was edited,
// so a change synced from another PC meanwhile (other fields) is kept.
function edit(p, input) {
  for (const k of V.FIELDS) if (k in input) p[k] = input[k] == null ? "" : String(input[k]);
  if ("status" in input) p.status = String(input.status);
  if (!V.STAGES[p.stage]) p.stage = "received";
  if (input.acceptSuggestion && p.suggestion) {
    p.rawText = p.suggestion.rawText || "";
    p.warnings = p.suggestion.warnings || "";
    delete p.suggestion;
  }
  // A date for the interview moves a new application on; a decision gets its date.
  if (String(p.interview || "").trim() && p.stage === "received") p.stage = "scheduled";
  if ("stage" in input && ["offered", "hired", "rejected", "declined"].includes(p.stage) && !p.decisionDate) p.decisionDate = today(Date.now());
  return p;
}

// Two records of the same person (a second application): fill gaps, append lists.
function merge(target, source) {
  for (const k of V.FIELDS) if (!target[k] && source[k]) target[k] = source[k];
  for (const k of ["pages", "sources", "notes", "documents", "recordings", "evaluations", "checklist"]) {
    if (!Array.isArray(source[k])) continue;
    target[k] = [...(target[k] || []), ...source[k]];
  }
  if (!target.portrait && source.portrait) {
    target.portrait = source.portrait;
    target.portraitSource = source.portraitSource;
  }
  if (!target.contactId && source.contactId) {
    target.contactId = source.contactId;
    target.contactAccount = source.contactAccount;
    target.contactRegistered = true;
  }
  if (!target.status) target.status = "new";
  delete target.suggestion;
  return target;
}

// A Gemini result applied directly (background reading).
function applyResult(p, r) {
  for (const k of V.FIELDS) if (k !== "stage" && k !== "rating" && String(r[k] || "").trim()) p[k] = String(r[k]).trim();
  for (const k of ["birthDate", "startDate"]) if (p[k] && !/^\d{4}-\d{2}-\d{2}$/.test(p[k])) p[k] = "";
  p.rawText = r.rawText || "";
  p.warnings = r.warnings || "";
  delete p.suggestion;
  p.status = String(p.name || "").trim() && !String(p.warnings || "").trim() ? "confirmed" : "review";
  return p;
}

const today = (ms) => V.iso(ms).slice(0, 10);

// Age on a given day (YYYY-MM-DD birth date), or "".
function age(birth, at = Date.now()) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(birth || ""));
  if (!m) return "";
  const [y, mo, d] = today(at).split("-").map(Number);
  let a = y - +m[1];
  if (mo < +m[2] || (mo === +m[2] && d < +m[3])) a--;
  return a >= 0 && a < 130 ? a : "";
}

// ---- CSV ------------------------------------------------------------------------------
const cell = (s) => {
  s = String(s == null ? "" : s);
  if (/^\s*[=+@-]/.test(s)) s = "'" + s; // no formulas when opened in Excel
  return '"' + s.replace(/"/g, '""') + '"';
};
const HEAD = {
  name: "氏名", kana: "ふりがな", birthDate: "生年月日", gender: "性別", category: "職種", position: "応募職種・部署",
  employment: "雇用形態", stage: "選考状況", rating: "評価", decisionDate: "採否決定日", decisionNote: "採否の理由・連絡", hireDate: "入職日",
  department: "配属先", commuteCost: "通勤費（概算）", appliedDate: "応募日", agency: "紹介会社", agencyContact: "紹介会社の担当者", agencyFee: "紹介手数料・返金規定", source: "応募経路", interview: "面接日時",
  interviewers: "面接担当", startDate: "入職可能日", commute: "通勤", postal: "郵便番号", address: "住所", phone: "電話",
  mobile: "携帯", email: "メール", education: "学歴", career: "職歴", licenses: "免許・資格", motivation: "志望動機",
  selfPr: "自己PR", wishes: "本人希望", tags: "タグ",
};

function csv(people) {
  let out = "\uFEFF" + [...V.FIELDS.map((k) => HEAD[k]), "年齢", "採用手続き", "未完了の手続き", "面接メモ", "読み取り状態"].map(cell).join(",") + "\r\n";
  for (const p of people) {
    const notes = (p.notes || []).map((n) => V.iso(n.time || 0).slice(0, 16).replace("T", " ") + " " + n.text).join("\n");
    out += [...V.FIELDS.map((k) => (k === "stage" ? V.STAGES[p[k]] || p[k] : p[k])), age(p.birthDate), checkProgress(p), (p.checklist || []).filter((c) => !c.done).map((c) => c.item).join("\n"), notes, p.status].map(cell).join(",") + "\r\n";
  }
  return out;
}

// "5/21" (done / all), or "" without a checklist.
function checkProgress(p) {
  const list = p.checklist || [];
  return list.length ? `${list.filter((c) => c.done).length}/${list.length}` : "";
}

// Adds the template's items the person does not have yet (by name), all unticked.
function addChecklist(p, template) {
  const have = new Set((p.checklist || []).map((c) => String(c.item).trim()));
  p.checklist = [...(p.checklist || []), ...template.filter((t) => !have.has(String(t).trim())).map((item) => ({ id: crypto.randomUUID(), item, done: false, date: "", note: "" }))];
  return p;
}

// ---- the ID photo on a résumé -----------------------------------------------------------
// "ymin,xmin,ymax,xmax" on a 0–1000 grid → { x, y, width, height } in pixels, or null.
function photoRect(text, w, h) {
  const v = String(text || "").replace(/[[\]\s]/g, "").split(",");
  if (v.length !== 4 || v.some((x) => !/^-?\d+$/.test(x))) return null;
  const [y0, x0, y1, x1] = v.map((x) => Math.max(0, Math.min(1000, +x)));
  if (y1 - y0 < 20 || x1 - x0 < 15 || (y1 - y0) * (x1 - x0) > 250000) return null;
  const x = Math.floor((x0 * w) / 1000), y = Math.floor((y0 * h) / 1000);
  return { x, y, width: Math.floor((x1 * w) / 1000) - x, height: Math.floor((y1 * h) / 1000) - y };
}

// Gemini's box may include some of the white paper or the form's ruled line around the photo:
// trim rows and columns that are mostly paper (bright and grey) from each side. It never grows,
// so the form's other cells stay out. px(x, y) → [r, g, b].
function trimPhotoRect(px, w, h, r) {
  if (!r) return r;
  const paper = (x, y) => {
    const [a, b, c] = px(x, y);
    return Math.min(a, b, c) > 200 && Math.max(a, b, c) - Math.min(a, b, c) < 25;
  };
  const line = (n, f) => {
    let p = 0, all = 0;
    for (let i = 0; i < n; i += 2, all++) if (f(i)) p++;
    return all ? p / all : 1;
  };
  let x0 = r.x, y0 = r.y, x1 = r.x + r.width, y1 = r.y + r.height;
  const limitX = Math.floor(r.width * 0.25), limitY = Math.floor(r.height * 0.25);
  const row = (y) => line(x1 - x0, (i) => paper(x0 + i, y));
  const col = (x) => line(y1 - y0, (i) => paper(x, y0 + i));
  for (let i = 0; i < limitY && row(y0) > 0.85; i++) y0++;
  for (let i = 0; i < limitY && row(y1 - 1) > 0.85; i++) y1--;
  for (let i = 0; i < limitX && col(x0) > 0.85; i++) x0++;
  for (let i = 0; i < limitX && col(x1 - 1) > 0.85; i++) x1--;
  if (x1 - x0 < 16 || y1 - y0 < 16) return r;
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

// ---- sync ----------------------------------------------------------------------------------
// Both sides changed since the last sync: field by field, the newer edit wins where it has a
// value; lists are unioned so nothing written on either side is lost. When both sides hold
// different values for a field, the losing value is kept in a note so it can be checked.
function syncMerge(local, remote, now = Date.now()) {
  const remoteNewer = (remote.updated || 0) > (local.updated || 0);
  const base = JSON.parse(JSON.stringify(remoteNewer ? remote : local));
  const other = remoteNewer ? local : remote;
  const lost = [];
  for (const k of V.FIELDS) {
    const a = String(base[k] || ""), b = String(other[k] || "");
    if (!a && b) base[k] = other[k];
    else if (a && b && a.trim() !== b.trim() && k !== "stage") lost.push(`${HEAD[k]}：${b.replace(/\n/g, " ").slice(0, 80)}`);
  }
  if (String(base.stage || "received") !== String(other.stage || "received")) {
    // The stage only moves forward unless someone set it back deliberately (newer side wins).
    lost.push(`選考状況：${V.STAGES[other.stage] || other.stage}`);
  }
  for (const k of ["portrait", "rawText", "warnings", "contactId", "contactAccount"])
    if (!base[k] && other[k]) {
      base[k] = other[k];
      if (k === "portrait") base.portraitSource = other.portraitSource;
    }
  if (other.contactRegistered) base.contactRegistered = true;
  const union = (key, id) => {
    const seen = new Set((base[key] || []).map((x) => x[id]));
    base[key] = [...(base[key] || []), ...(other[key] || []).filter((x) => !seen.has(x[id]))];
  };
  union("notes", "id");
  union("pages", "file");
  union("sources", "file");
  union("documents", "id");
  union("recordings", "id");
  union("evaluations", "id");
  union("checklist", "id");
  // A box ticked on either PC stays ticked; date and memo filled from the other side.
  for (const c of base.checklist || []) {
    const o = (other.checklist || []).find((x) => x.id === c.id);
    if (!o) continue;
    if (o.done && !c.done) Object.assign(c, { done: true, date: c.date || o.date });
    if (!c.note && o.note) c.note = o.note;
    if (!c.date && o.date) c.date = o.date;
  }
  // A transcript made on one PC while the other only has the recording.
  for (const r of base.recordings || []) {
    const o = (other.recordings || []).find((x) => x.id === r.id);
    if (o) for (const k of ["transcript", "summary", "title"]) if (!r[k] && o[k]) r[k] = o[k];
  }
  if (base.notDuplicate || other.notDuplicate) base.notDuplicate = [...new Set([...(base.notDuplicate || []), ...(other.notDuplicate || [])])];
  if (lost.length) {
    const text = "（同期）別の端末でも同時に編集されたため、新しい方の内容にしました。もう一方の内容：\n" + lost.join("\n");
    const id = crypto.createHash("sha256").update(text + base.id).digest("hex").slice(0, 16);
    if (!(base.notes || []).some((n) => n.id === id)) base.notes = [...(base.notes || []), { id, time: now, text }];
  }
  for (const k of V.LOCAL) {
    if (local[k] !== undefined) base[k] = local[k];
    else delete base[k];
  }
  base.updated = Math.max(local.updated || 0, remote.updated || 0);
  return base;
}

// Files a record refers to: what has to travel with its note.
function media(p) {
  const out = new Set();
  if (p.portrait) out.add(p.portrait);
  for (const k of ["pages", "sources"]) for (const o of p[k] || []) if (o.file) out.add(o.file);
  for (const d of p.documents || []) for (const f of d.files || []) if (f.file) out.add(f.file);
  for (const r of p.recordings || []) if (r.file) out.add(r.file);
  return out;
}

module.exports = { CHECKLIST, checkProgress, addChecklist, CATEGORIES, HEAD, empty, edit, merge, applyResult, today, age, csv, photoRect, trimPhotoRect, syncMerge, media };
