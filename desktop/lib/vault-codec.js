// Applicant record ⇄ Obsidian Markdown (docs/THETA_VAULT_SPEC.md, docs/MENSETSU_VAULT.md).
// Every device (PC, browser) reads and writes the same notes; "rev" tells whether a note was
// edited outside the app (Obsidian, a text editor).
"use strict";
const crypto = require("crypto");
const YAML = require("yaml");

const APP_DIR = "Mensetsu";
const FOLDER = "Applicants";
const FILES = APP_DIR + "/_files/";
const H_NOTES = "## 面接メモ",
  H_CHECK = "## 採用手続き",
  H_SKETCH = "## 手書きメモ",
  H_REC = "## 面接の録音",
  H_EVAL = "## 職員評価",
  H_DOCS = "## 書類",
  H_TEXT = "## 履歴書の全文";
// Sections the app writes. "面接メモ", "採用手続き" (a task list: ticking a box in Obsidian counts)
// and "履歴書の全文" are read back; the others are generated from the frontmatter.
const MANAGED = [H_NOTES, H_SKETCH, H_CHECK, H_REC, H_EVAL, H_DOCS, H_TEXT];
const FREE_MARK = "<!-- ここから下は自由に書けます（アプリは変更しません） -->";

// Record field ⇄ frontmatter key. "l": one value per line (a YAML list), "t": tags.
const SPEC = [
  ["name", "name"],
  ["kana", "kana"],
  ["birthDate", "birth_date"],
  ["gender", "gender"],
  ["category", "category"],
  ["position", "position"],
  ["employment", "employment"],
  ["stage", "stage"],
  ["rating", "rating"],
  ["decisionDate", "decided"],
  ["decisionNote", "decision_note"],
  ["hireDate", "hire_date"],
  ["department", "department"],
  ["appliedDate", "applied"],
  ["source", "source"],
  ["agency", "agency"],
  ["agencyContact", "agency_contact"],
  ["agencyFee", "agency_fee"],
  ["interview", "interview"],
  ["interviewers", "interviewers"],
  ["startDate", "start_date"],
  ["commute", "commute"],
  ["commuteCost", "commute_cost"],
  ["postal", "postal"],
  ["address", "address"],
  ["phone", "phone", "l"],
  ["mobile", "mobile", "l"],
  ["email", "email", "l"],
  ["education", "education"],
  ["career", "career"],
  ["licenses", "licenses"],
  ["motivation", "motivation"],
  ["selfPr", "self_pr"],
  ["wishes", "wishes"],
  ["tags", "tags", "t"],
];
const FIELDS = SPEC.map((x) => x[0]);
const ORDER = [
  "theta", "rev", "id", ...SPEC.map((x) => x[1]), "status", "contact_registered", "contact_unlinked",
  "google_contact", "google_contact_account", "import_key", "not_duplicate", "warnings", "created",
  "updated", "pages", "originals", "portrait", "portrait_source", "documents", "recordings", "evaluations", "sketches",
];
const OWN = new Set(ORDER);
// Fields that only make sense on one device (queues, a pending Gemini result): never in the vault.
const LOCAL = ["queue", "queueError", "suggestion", "contactPending", "photoTried", "contactDuplicate"];

const STAGES = {
  received: "書類受付",
  scheduled: "面接予定",
  interviewed: "面接済み",
  hold: "保留",
  offered: "内定",
  hired: "採用",
  rejected: "不採用",
  declined: "辞退",
};

// ---- time (Asia/Tokyo) ----------------------------------------------------------------
const JST = 9 * 3600 * 1000;
const pad = (n, w = 2) => String(n).padStart(w, "0");
function iso(ms) {
  const d = new Date(ms + JST);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}.${pad(d.getUTCMilliseconds(), 3)}+09:00`;
}
function noteTime(ms) {
  return iso(ms).slice(0, 16).replace("T", " ");
}
function ms(v, fallback) {
  if (typeof v === "number") return v;
  if (v == null) return fallback;
  let s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) s += "T00:00:00+09:00";
  else if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(s)) s = s.replace(" ", "T") + "+09:00";
  const t = Date.parse(s);
  return Number.isNaN(t) ? fallback : t;
}

// ---- media ------------------------------------------------------------------------------
const pathOf = (local) => FILES + local;
function local(p) {
  if (p == null) return null;
  let s = String(p).trim().replace(/\\/g, "/");
  if (s.startsWith("[[") && s.endsWith("]]")) s = s.slice(2, -2);
  if (s.includes("|")) s = s.slice(0, s.indexOf("|"));
  const name = s.slice(s.lastIndexOf("/") + 1);
  return /^[A-Za-z0-9_.-]+$/.test(name) && !name.includes("..") ? name : null;
}

// Java's UUID.nameUUIDFromBytes (MD5, version 3): notes typed in Obsidian without an id get the
// same id on every device.
function nameUUID(text) {
  const b = crypto.createHash("md5").update(Buffer.from(text, "utf8")).digest();
  b[6] = (b[6] & 0x0f) | 0x30;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = b.toString("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

const split = (s, re) => String(s || "").split(re).map((x) => x.trim()).filter(Boolean);
const put = (m, k, v) => {
  if (v != null && v !== "") m[k] = v;
};
const blockId = (id) => String(id || "").replace(/[^A-Za-z0-9-]/g, "") || "n";
const cell = (s) => String(s).replace(/\|/g, "｜").replace(/\n/g, " ");

function rev(text) {
  return crypto.createHash("sha256").update(Buffer.from(text, "utf8")).digest("hex").slice(0, 12);
}

function dump(fm) {
  return YAML.stringify(fm, { lineWidth: 0, indentSeq: false, defaultStringType: "PLAIN", aliasDuplicateObjects: false });
}

function render(p) {
  const fm = { theta: "mensetsu/applicant@1", id: p.id };
  for (const [k, key, kind] of SPEC) {
    if (kind === "l") {
      const v = split(p[k], /\n/);
      if (v.length) fm[key] = v;
    } else if (kind === "t") {
      const v = split(p[k], /[、,，\n]/);
      if (v.length) fm[key] = v;
    } else put(fm, key, String(p[k] == null ? "" : p[k]).replace(/\r\n/g, "\n").trim());
  }
  put(fm, "status", p.status);
  if (p.contactRegistered) fm.contact_registered = true;
  if (p.contactUnlinked) fm.contact_unlinked = true;
  put(fm, "google_contact", p.contactId);
  put(fm, "google_contact_account", p.contactAccount);
  put(fm, "import_key", p.importKey);
  if (Array.isArray(p.notDuplicate) && p.notDuplicate.length) fm.not_duplicate = [...p.notDuplicate];
  put(fm, "warnings", p.warnings);
  fm.created = iso(p.created || Date.now());
  fm.updated = iso(p.updated || Date.now());
  const pages = (p.pages || []).map((x) => pathOf(x.file));
  if (pages.length) fm.pages = pages;
  const originals = (p.sources || []).map((s) => {
    const m = { file: pathOf(s.file) };
    if (s.name) m.name = s.name;
    if (s.hash) m.sha256 = s.hash;
    return m;
  });
  if (originals.length) fm.originals = originals;
  if (p.portrait) fm.portrait = pathOf(p.portrait);
  if (p.portrait && p.portraitSource) fm.portrait_source = p.portraitSource;
  const docs = (p.documents || []).map((d) => {
    const m = { id: d.id || "" };
    put(m, "date", d.date);
    put(m, "kind", d.kind);
    put(m, "title", d.title);
    const files = [], orig = [];
    for (const f of d.files || []) (f.original ? orig : files).push(pathOf(f.file));
    if (files.length) m.files = files;
    if (orig.length) m.originals = orig;
    return m;
  });
  if (docs.length) fm.documents = docs;
  const recs = (p.recordings || [])
    .filter((r) => r.file)
    .map((r) => {
      const m = { id: r.id || "", file: pathOf(r.file), time: iso(r.time || 0), seconds: r.seconds | 0 };
      for (const k of ["title", "summary", "transcript"]) put(m, k, String(r[k] || "").trim());
      return m;
    });
  if (recs.length) fm.recordings = recs;
  const evals = (p.evaluations || []).map((e) => {
    const m = { id: e.id || "" };
    for (const k of ["date", "period", "evaluator", "score", "text"]) put(m, k, String(e[k] == null ? "" : e[k]).trim());
    return m;
  });
  if (evals.length) fm.evaluations = evals;
  // Handwritten memos: the picture (shown in Obsidian) and the pen strokes (to edit again).
  const sketches = (p.sketches || [])
    .filter((k) => k.file)
    .map((k) => {
      const m = { id: k.id || "", file: pathOf(k.file), time: iso(k.time || 0) };
      if (k.strokes) m.strokes = pathOf(k.strokes);
      for (const x of ["title", "text"]) put(m, x, String(k[x] || "").trim());
      return m;
    });
  if (sketches.length) fm.sketches = sketches;
  for (const [k, v] of Object.entries(p.vaultExtra || {})) if (!OWN.has(k)) fm[k] = v;

  let b = "---\n" + dump(fm) + "---\n\n";
  const embeds = [...(p.portrait ? [`![[${pathOf(p.portrait)}|120]]`] : []), ...pages.map((x) => `![[${x}|360]]`)];
  if (embeds.length) b += embeds.join(" ") + "\n\n";
  b += H_NOTES + "\n";
  for (const n of [...(p.notes || [])].sort((a, c) => (a.time || 0) - (c.time || 0))) {
    const lines = String(n.text || "").split("\n");
    b += "- " + noteTime(n.time || 0) + " " + lines[0];
    for (const l of lines.slice(1)) b += "\n  " + l;
    b += " ^" + blockId(n.id) + "\n";
  }
  b += "\n";
  if (sketches.length) {
    b += H_SKETCH + "\n";
    for (const k of sketches) {
      b += `- ${k.time.slice(0, 16).replace("T", " ")}${k.title ? " " + k.title.replace(/\n/g, " ") : ""}\n  ![[${k.file}|480]]\n`;
      if (k.text) b += "  " + k.text.replace(/\n/g, "\n  ") + "\n";
    }
    b += "\n";
  }
  const checks = p.checklist || [];
  if (checks.length) {
    b += H_CHECK + "\n";
    for (const c of checks) {
      const item = String(c.item || "").replace(/\n/g, " ").trim() || "（項目）";
      b += `- [${c.done ? "x" : " "}] ${item}${c.date ? " 📅 " + c.date : ""}${String(c.note || "").trim() ? " — " + String(c.note).replace(/\n/g, " ").trim() : ""} ^${blockId(c.id)}\n`;
    }
    b += "\n";
  }
  if (recs.length) {
    b += H_REC + "\n";
    for (const r of recs) {
      b += `- ![[${r.file}]] ${r.time.slice(0, 16).replace("T", " ")}（${Math.floor(r.seconds / 60)}分${r.seconds % 60}秒）${r.title ? " " + r.title.replace(/\n/g, " ") : ""}\n`;
      if (r.summary) b += "  " + r.summary.replace(/\n/g, "\n  ") + "\n";
      if (r.transcript) b += "\n> [!note]- 文字起こし\n" + r.transcript.split("\n").map((l) => "> " + l).join("\n") + "\n\n";
    }
    b += "\n";
  }
  if (evals.length) {
    b += H_EVAL + "\n| 日付 | 期間 | 評価者 | 評価 | 所見 |\n|---|---|---|---|---|\n";
    for (const e of [...evals].sort((x, y) => String(y.date || "").localeCompare(String(x.date || ""))))
      b += `| ${e.date || ""} | ${cell(e.period || "")} | ${cell(e.evaluator || "")} | ${cell(e.score || "")} | ${cell(e.text || "")} |\n`;
    b += "\n";
  }
  if (docs.length) {
    b += H_DOCS + "\n| 日付 | 種類 | 書類 | ファイル |\n|---|---|---|---|\n";
    for (const d of [...(p.documents || [])].sort((x, y) => String(y.date || "").localeCompare(String(x.date || ""))))
      b += `| ${d.date || ""} | ${cell(d.kind || "")} | ${cell(d.title || "書類")} | ${(d.files || []).map((f) => `[[${pathOf(f.file)}]]`).join(" ")} |\n`;
    b += "\n";
  }
  if (String(p.rawText || "").trim())
    b += H_TEXT + "\n```text\n" + String(p.rawText).replace(/```/g, "ˋˋˋ").trim() + "\n```\n\n";
  b += FREE_MARK + "\n";
  if (String(p.vaultFree || "").trim()) b += "\n" + String(p.vaultFree).trim() + "\n";
  return b.replace("\n", "\nrev: " + rev(b) + "\n");
}

function editedOutside(md) {
  md = md.replace(/\r\n/g, "\n");
  const m = /\nrev: ([0-9a-f]+)\n/.exec(md);
  if (!m) return true;
  return m[1] !== rev(md.slice(0, m.index) + "\n" + md.slice(m.index + m[0].length));
}

const str = (v) => {
  if (v == null) return "";
  if (Array.isArray(v)) return v.filter((x) => x != null && String(x).trim()).map((x) => String(x).trim()).join("\n");
  return String(v).trim();
};
const NOTE = /^[-*]\s+(\d{4}-\d{2}-\d{2})(?:[ T](\d{1,2}:\d{2}))?\s*(.*)$/;
const BLOCK = /\s\^([A-Za-z0-9-]+)\s*$/;
const CHECK = /^[-*]\s+\[([ xX])\]\s*(.*)$/;

function parse(md, allowNewId = false) {
  md = md.replace(/\r\n/g, "\n");
  if (md.startsWith("\uFEFF")) md = md.slice(1);
  if (!md.startsWith("---\n")) throw new Error("frontmatterがありません");
  const end = md.indexOf("\n---", 4);
  if (end < 0) throw new Error("frontmatterが閉じていません");
  const yaml = md.slice(4, end + 1);
  const bodyStart = md.indexOf("\n", end + 4);
  const body = bodyStart < 0 ? "" : md.slice(bodyStart + 1);
  const fm = YAML.parse(yaml) || {};
  if (typeof fm !== "object" || Array.isArray(fm)) throw new Error("frontmatterの形式が不正です");
  let id = str(fm.id);
  const newId = !id && allowNewId;
  if (newId) id = crypto.randomUUID();
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(id)) throw new Error("idが不正です");
  const p = { id };
  if (newId) p.vaultNewId = true;
  for (const [k, key, kind] of SPEC) p[k] = kind === "t" ? str(fm[key]).replace(/\n/g, "、") : str(fm[key]);
  for (const k of ["birthDate", "appliedDate", "startDate", "decisionDate", "hireDate"]) if (/^\d{4}-\d{2}-\d{2}T/.test(p[k])) p[k] = p[k].slice(0, 10);
  p.interview = p.interview.replace("T", " ").slice(0, 16);
  if (!STAGES[p.stage]) p.stage = p.stage ? (Object.keys(STAGES).find((k) => STAGES[k] === p.stage) || "received") : "received";
  const st = str(fm.status);
  p.status = ["new", "review", "confirmed"].includes(st) ? st : p.name ? "confirmed" : "new";
  if (fm.contact_registered === true) p.contactRegistered = true;
  if (fm.contact_unlinked === true) p.contactUnlinked = true;
  if (/^people\/[A-Za-z0-9_-]+$/.test(str(fm.google_contact))) p.contactId = str(fm.google_contact);
  if (str(fm.google_contact_account)) p.contactAccount = str(fm.google_contact_account);
  if (str(fm.import_key)) p.importKey = str(fm.import_key);
  if (Array.isArray(fm.not_duplicate)) p.notDuplicate = fm.not_duplicate.filter((x) => x != null).map(String);
  if (str(fm.warnings)) p.warnings = str(fm.warnings);
  const now = Date.now();
  p.created = ms(fm.created, now);
  p.updated = ms(fm.updated, p.created);
  p.pages = (Array.isArray(fm.pages) ? fm.pages : []).map(local).filter(Boolean).map((l) => ({ file: l, name: l }));
  p.sources = (Array.isArray(fm.originals) ? fm.originals : [])
    .map((o) => (o && typeof o === "object" ? o : { file: o }))
    .map((o) => {
      const l = local(o.file);
      if (!l) return null;
      const s = { file: l, name: str(o.name) || l, mime: l.endsWith(".pdf") ? "application/pdf" : "image/jpeg" };
      if (str(o.sha256)) s.hash = str(o.sha256);
      return s;
    })
    .filter(Boolean);
  const portrait = local(fm.portrait);
  if (portrait) p.portrait = portrait;
  if (p.portrait && typeof fm.portrait_source === "string") p.portraitSource = fm.portrait_source;
  const docs = (Array.isArray(fm.documents) ? fm.documents : [])
    .filter((m) => m && typeof m === "object")
    .map((m) => {
      const d = { id: str(m.id) || crypto.randomUUID() };
      const date = str(m.date);
      d.date = date.length >= 10 ? date.slice(0, 10) : date;
      if (str(m.title)) d.title = str(m.title);
      if (str(m.kind)) d.kind = str(m.kind);
      d.files = [];
      for (const key of ["files", "originals"])
        for (const f of Array.isArray(m[key]) ? m[key] : []) {
          const l = local(f);
          if (l) d.files.push(key === "originals" ? { file: l, name: l, original: true } : { file: l, name: l });
        }
      return d;
    });
  if (docs.length) p.documents = docs;
  const recs = (Array.isArray(fm.recordings) ? fm.recordings : [])
    .filter((m) => m && typeof m === "object" && local(m.file))
    .map((m) => {
      const r = { id: str(m.id) || local(m.file), file: local(m.file), time: ms(m.time, Date.now()), seconds: typeof m.seconds === "number" ? m.seconds | 0 : 0 };
      for (const k of ["title", "summary", "transcript"]) if (str(m[k])) r[k] = String(m[k]).replace(/\r\n/g, "\n").trim();
      return r;
    });
  if (recs.length) p.recordings = recs;
  const evals = (Array.isArray(fm.evaluations) ? fm.evaluations : [])
    .filter((m) => m && typeof m === "object")
    .map((m) => {
      const e = { id: str(m.id) || crypto.randomUUID() };
      for (const k of ["date", "period", "evaluator", "score", "text"]) e[k] = k === "text" ? String(m[k] == null ? "" : m[k]).trim() : str(m[k]);
      if (/^\d{4}-\d{2}-\d{2}T/.test(e.date)) e.date = e.date.slice(0, 10);
      return e;
    });
  if (evals.length) p.evaluations = evals;
  const sk = (Array.isArray(fm.sketches) ? fm.sketches : [])
    .filter((m) => m && typeof m === "object" && local(m.file))
    .map((m) => {
      const k = { id: str(m.id) || local(m.file), file: local(m.file), time: ms(m.time, Date.now()) };
      if (local(m.strokes)) k.strokes = local(m.strokes);
      for (const x of ["title", "text"]) if (str(m[x])) k[x] = String(m[x]).replace(/\r\n/g, "\n").trim();
      return k;
    });
  if (sk.length) p.sketches = sk;
  const extra = {};
  for (const [k, v] of Object.entries(fm)) if (!OWN.has(k)) extra[k] = v;
  if (Object.keys(extra).length) p.vaultExtra = extra;

  const notes = [];
  const checks = [];
  let free = "",
    section = null,
    text = null,
    afterMark = false,
    last = null;
  for (const line of body.split("\n")) {
    if (afterMark) {
      free += line + "\n";
      continue;
    }
    if (line.trim() === FREE_MARK) {
      afterMark = true;
      continue;
    }
    if (line.startsWith("## ")) {
      section = MANAGED.includes(line.trim()) ? line.trim() : null;
      last = null;
      if (section == null) free += line + "\n";
      continue;
    }
    if (section == null) {
      if (!(line.trim().startsWith("![[") && line.includes(FILES)) && !(line.trim() === "" && free === "")) free += line + "\n";
      continue;
    }
    if (section === H_NOTES) {
      if (line.startsWith("- ") || line.startsWith("* ")) {
        let m = NOTE.exec(line.trim());
        if (!m) {
          const t = line.slice(2).trim();
          if (!t) continue;
          m = NOTE.exec("- " + noteTime(now) + " " + t);
        }
        let t = m[3];
        let bid = null;
        const bm = BLOCK.exec(t);
        if (bm) {
          bid = bm[1];
          t = t.slice(0, bm.index);
        }
        const hm = m[2] == null ? "00:00" : m[2].length === 4 ? "0" + m[2] : m[2];
        const time = ms(m[1] + "T" + hm, now);
        last = { id: bid != null ? bid : nameUUID(String(time) + t), time, text: t.trim() };
        notes.push(last);
      } else if (last && line.startsWith("  ")) {
        let t = line.slice(2);
        const bm = BLOCK.exec(t);
        if (bm) {
          last.id = bm[1];
          t = t.slice(0, bm.index);
        }
        last.text += "\n" + t;
      } else if (line.trim()) {
        free += line + "\n";
        last = null;
      }
    } else if (section === H_CHECK) {
      const m = CHECK.exec(line.trim());
      if (m) {
        let rest = m[2];
        let cid = null;
        const bm = BLOCK.exec(" " + rest);
        if (bm) {
          cid = bm[1];
          rest = (" " + rest).slice(0, bm.index).trim();
        }
        let note = "";
        const ni = rest.indexOf(" — ");
        if (ni >= 0) {
          note = rest.slice(ni + 3).trim();
          rest = rest.slice(0, ni).trim();
        }
        let date = "";
        const dm = / 📅 (\d{4}-\d{2}-\d{2})$/.exec(rest);
        if (dm) {
          date = dm[1];
          rest = rest.slice(0, dm.index).trim();
        }
        checks.push({ id: cid || nameUUID("check" + rest), item: rest, done: m[1] !== " ", date, note });
      } else if (line.trim()) free += line + "\n";
    } else if (section === H_TEXT) {
      if (line.startsWith("```")) {
        text = text == null ? "" : text;
        continue;
      }
      if (text != null) text += line + "\n";
    }
  }
  p.notes = notes;
  if (checks.length) p.checklist = checks;
  if (text != null && text.trim()) p.rawText = text.trim();
  if (free.trim()) p.vaultFree = free.trim();
  return p;
}

// "山田 花子（看護師）.md": the name people look for in Obsidian or the file manager.
function fileName(p) {
  let n = String(p.name || "").trim() || "氏名未登録";
  const c = String(p.category || "").trim();
  if (c) n += "（" + c + "）";
  n = n.replace(/[\\/:*?"<>|#^[\]\n\r\t]/g, " ").replace(/\s+/g, " ").trim();
  if (n.startsWith(".")) n = "_" + n;
  if (n.length > 80) n = n.slice(0, 80).trim();
  return n + ".md";
}
const folder = () => FOLDER;

module.exports = { APP_DIR, FOLDER, FILES, FIELDS, SPEC, LOCAL, STAGES, render, parse, fileName, folder, editedOutside, rev, iso, ms, nameUUID, local };
