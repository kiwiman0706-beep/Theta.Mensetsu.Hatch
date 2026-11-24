// Checks a zip for the bulk import (docs/IMPORT_FORMAT.md) without changing any data:
//   node scripts/check-import.js <file.zip>
"use strict";
const fs = require("fs");
const archive = require("../lib/archive");
const model = require("../lib/model");

const file = process.argv[2];
if (!file) {
  console.error("使い方: node scripts/check-import.js <file.zip>");
  process.exit(2);
}
const r = archive.read(fs.readFileSync(file));
const missing = [], noId = [], unread = [];
for (const p of r.people) {
  for (const m of model.media(p)) if (!r.media.has(m)) missing.push(`${p.name || p.id}：${m}`);
  if (p.vaultNewId) noId.push(p.name || "(氏名なし)");
  if (p.status === "new" && (p.pages || []).length) unread.push(p.name || p.id);
}
console.log(`応募者 ${r.people.length}人、ファイル ${r.media.size}個${r.manifest ? `、形式 ${r.manifest.format}` : "（manifest.json なし）"}`);
if (unread.length) console.log(`読み取りがまだ（status: new）：${unread.length}人`);
if (noId.length) console.log(`id の無い人（読み込むたびに新しい人になります）：${noId.join("、")}`);
if (missing.length) console.log(`zip に無いファイル：\n  ${missing.join("\n  ")}`);
if (r.warnings.length) console.log(`問題：\n  ${r.warnings.join("\n  ")}`);
const unused = [...r.media.keys()].filter((m) => !r.people.some((p) => model.media(p).has(m)));
if (unused.length) console.log(`どのノートからも使われていないファイル：${unused.length}個（${unused.slice(0, 10).join("、")}${unused.length > 10 ? "…" : ""}）`);
process.exit(missing.length || r.warnings.length || !r.people.length ? 1 : 0);
