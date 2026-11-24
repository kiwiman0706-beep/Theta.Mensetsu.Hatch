// The bulk export / import zip (docs/IMPORT_FORMAT.md): a round trip between two PCs, a zip made
// by hand as the format document shows, and the rules (newer wins, nothing is deleted).
"use strict";
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { zipSync, strToU8 } = require("fflate");
const { VaultStore } = require("../lib/vault-store");
const archive = require("../lib/archive");
const model = require("../lib/model");
const V = require("../lib/vault-codec");

function pc() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mensetsu-zip-"));
  return new VaultStore(path.join(dir, "Theta Vault"), path.join(dir, "overlay.json")).load();
}

test("export → import on another PC: notes, pictures, PDF, recordings, memos come back", async () => {
  const a = pc(), b = pc();
  for (const [n, c] of [["r1-0.jpg", "JPG"], ["r1.pdf", "PDF"], ["face.jpg", "FACE"], ["rec.webm", "OPUS"], ["s1.png", "PNG"], ["s1.json", "{}"]]) await a.writeMedia(n, Buffer.from(c));
  const p = { ...model.empty(), name: "山田 花子", category: "看護師", status: "confirmed", pages: [{ file: "r1-0.jpg", name: "1" }], sources: [{ file: "r1.pdf", name: "履歴書.pdf" }], portrait: "face.jpg", portraitSource: "resume" };
  p.recordings = [{ id: "rc", file: "rec.webm", time: 1, seconds: 3, transcript: "面接官: どうぞ" }];
  p.sketches = [{ id: "sk", file: "s1.png", strokes: "s1.json", time: 2, title: "メモ" }];
  p.notes = [{ id: "n1", time: 3, text: "受け答えが丁寧" }];
  a.put(p);
  const out = await archive.build(a.people(), (m) => a.readMedia(m), { version: "1.0.0", settings: { categories: "看護師\n事務" } });
  assert.strictEqual(out.media, 6);
  const parsed = archive.read(out.bytes);
  assert.strictEqual(parsed.manifest.format, "theta-export-1");
  assert.strictEqual(parsed.settings.categories, "看護師\n事務");
  const r = await archive.apply(b, parsed);
  assert.deepStrictEqual([r.added, r.files, r.missing.length], [1, 6, 0]);
  const q = b.person(p.id);
  assert.strictEqual(V.render(q), V.render(a.person(p.id)));
  assert.strictEqual(String(await b.readMedia("r1.pdf")), "PDF");
  // Again: nothing new, nothing lost.
  const again = await archive.apply(b, archive.read(out.bytes));
  assert.deepStrictEqual([again.added, again.skipped, again.files], [0, 1, 0]);
  // Without recordings.
  const small = await archive.build(a.people(), (m) => a.readMedia(m), { recordings: false });
  assert.ok(!archive.read(small.bytes).media.has("rec.webm"));
});

test("a zip made by hand (the format document's minimal example) imports, unread ones counted", async () => {
  const md = `---
id: r2026-001
name: 山田 花子
status: new
pages:
- Mensetsu/_files/r2026-001-1.jpg
originals:
- file: Mensetsu/_files/r2026-001.pdf
  name: 山田花子_履歴書.pdf
applied: 2026-11-20
source: 求人サイト
---
`;
  const noId = "---\nname: 佐藤 一郎\ncategory: 新しい職種\nmobile: [090-0000-0000]\n---\n";
  const zip = zipSync({
    "まとめ/Mensetsu/Applicants/山田.md": strToU8(md),
    "まとめ/Mensetsu/Applicants/佐藤.md": strToU8(noId),
    "まとめ/Mensetsu/_files/r2026-001-1.jpg": strToU8("JPG"),
    "まとめ/Mensetsu/_files/r2026-001.pdf": strToU8("PDF"),
    "まとめ/壊れた.md": strToU8("frontmatter なし"),
    "__MACOSX/._x": strToU8("x"),
  });
  const b = pc();
  const parsed = archive.read(zip);
  assert.strictEqual(parsed.people.length, 2);
  assert.ok(parsed.warnings.some((w) => /壊れた\.md/.test(w)));
  const r = await archive.apply(b, parsed);
  assert.deepStrictEqual([r.added, r.unread, r.files], [2, 1, 2]);
  const y = b.person("r2026-001");
  assert.deepStrictEqual([y.stage, y.appliedDate, y.sources[0].name, y.status], ["received", "2026-11-20", "山田花子_履歴書.pdf", "new"]);
  const s = b.people().find((p) => p.name === "佐藤 一郎");
  assert.strictEqual(s.category, "新しい職種");
  assert.ok(fs.existsSync(path.join(b.top, "山田 花子.md")), "kept as a Vault note");
});

test("the newer version wins; older is skipped; a missing picture is reported", async () => {
  const b = pc();
  b.put({ ...model.empty(), id: "x1", name: "古い", updated: 2000 }, false);
  const older = V.render({ ...model.empty(), id: "x1", name: "もっと古い", updated: 1000, created: 1000 });
  const newer = V.render({ ...model.empty(), id: "x1", name: "新しい", updated: 3000, created: 1000, pages: [{ file: "nofile.jpg" }] });
  let r = await archive.apply(b, archive.read(zipSync({ "a.md": strToU8(older) })));
  assert.deepStrictEqual([r.skipped, b.person("x1").name], [1, "古い"]);
  r = await archive.apply(b, archive.read(zipSync({ "a.md": strToU8(newer) })));
  assert.deepStrictEqual([r.updated, b.person("x1").name], [1, "新しい"]);
  assert.match(r.missing[0], /nofile\.jpg/);
  assert.throws(() => archive.read(Buffer.from("not a zip")), /zip ファイルを開けません/);
});
