// Two PCs, each with its own local Vault folder, syncing through one (in-memory) Google Drive:
// what reaches the other PC, concurrent edits, deletions, and the safety stops.
"use strict";
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { VaultStore } = require("../lib/vault-store");
const { DriveVault } = require("../lib/drive-vault");
const V = require("../lib/vault-codec");
const model = require("../lib/model");
const { FakeDrive, memoryKv } = require("./fakes");

const APP = "Theta Vault/Mensetsu/Applicants";

function pc(drive, account = "hr@example.com") {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mensetsu-sync-"));
  const store = new VaultStore(path.join(dir, "Theta Vault"), path.join(dir, "overlay.json")).load();
  const kv = memoryKv();
  return { dir, store, kv, vault: new DriveVault(store, kv, drive, account), run() { return new DriveVault(store, kv, drive, account).run(); } };
}
function applicant(name, extra = {}) {
  return { ...model.empty(), name, status: "confirmed", ...extra };
}

test("a new applicant and its pictures reach the other PC; quiet runs send nothing", async () => {
  const drive = new FakeDrive();
  const a = pc(drive), b = pc(drive);
  const p = applicant("山田 花子", { category: "看護師", pages: [{ file: "img1.jpg", name: "1" }], portrait: "face1.jpg", portraitSource: "resume" });
  await a.store.writeMedia("img1.jpg", Buffer.from("JPEG1"));
  await a.store.writeMedia("face1.jpg", Buffer.from("FACE"));
  a.store.put(p);
  const r1 = await a.run();
  assert.strictEqual(r1.up, 1);
  assert.match(drive.notesIn(APP)[0].name, /山田 花子（看護師）\.md/);
  assert.deepStrictEqual(((x) => [x.up, x.down])(await a.run()), [0, 0]);
  const r3 = await b.run();
  assert.deepStrictEqual([r3.down, r3.media], [1, 2], "the PC keeps the pictures locally");
  assert.strictEqual(fs.readFileSync(b.store.mediaFile("face1.jpg"), "utf8"), "FACE");
  assert.strictEqual(b.store.person(p.id).category, "看護師");
  assert.ok(fs.existsSync(path.join(b.store.top, "山田 花子（看護師）.md")), "readable in Obsidian on the other PC");
  assert.deepStrictEqual(((x) => [x.up, x.down])(await b.run()), [0, 0]);
});

test("both PCs edit the same applicant: different fields both kept; same field → newer wins, other value noted", async () => {
  const drive = new FakeDrive();
  const a = pc(drive), b = pc(drive);
  const p = applicant("佐藤 一郎", { updated: 1000 });
  a.store.put(p, false);
  await a.run();
  await b.run();
  const pa = a.store.person(p.id);
  Object.assign(pa, { mobile: "090-1111-1111", rating: "3", updated: 2000 });
  pa.notes.push({ id: "na", time: 2000, text: "Aのメモ" });
  a.store.put(pa, false);
  const pb = b.store.person(p.id);
  Object.assign(pb, { interview: "2026-11-05 10:00", rating: "5", updated: 3000 });
  pb.notes.push({ id: "nb", time: 3000, text: "Bのメモ" });
  b.store.put(pb, false);
  await a.run();
  const rb = await b.run();
  assert.strictEqual(rb.merged, 1);
  await a.run();
  for (const s of [a.store, b.store]) {
    const m = s.person(p.id);
    assert.deepStrictEqual([m.mobile, m.interview, m.rating], ["090-1111-1111", "2026-11-05 10:00", "5"]);
    assert.ok(["na", "nb"].every((id) => m.notes.some((n) => n.id === id)));
    const conflict = m.notes.find((n) => n.text.startsWith("（同期）"));
    assert.match(conflict.text, /評価：3/, "the losing value is kept in a note");
  }
  assert.strictEqual(a.store.person(p.id).notes.length, b.store.person(p.id).notes.length);
});

test("a note changed on Drive while this PC is sending is not overwritten (merged on the next round)", async () => {
  const drive = new FakeDrive();
  const a = pc(drive);
  const p = applicant("競合 太郎");
  a.store.put(p);
  await a.run();
  const x = a.store.person(p.id);
  x.mobile = "080-2222-2222";
  a.store.put(x);
  drive.onMeta = (id) => {
    drive.onMeta = null;
    const f = drive.files.get(id);
    const q = V.parse(drive.text(f));
    q.licenses = "2020-04 看護師免許";
    q.updated = Date.now() + 1000;
    drive.write(f, V.render(q));
  };
  const r = await a.run();
  assert.ok(r.retry, "asks for another round");
  assert.match(drive.text(drive.notesIn(APP)[0]), /看護師免許/, "the other PC's save is still there");
  await a.run();
  const m = V.parse(drive.text(drive.notesIn(APP)[0]));
  assert.deepStrictEqual([m.mobile, m.licenses], ["080-2222-2222", "2020-04 看護師免許"]);
});

test("delete → Drive's .theta/trash and gone on the other PC; an edit beats a deletion", async () => {
  const drive = new FakeDrive();
  const a = pc(drive), b = pc(drive);
  const x = applicant("消す人"), y = applicant("向こうで消す人");
  for (const p of [x, y]) a.store.put(p);
  await a.run();
  await b.run();
  a.store.remove(x.id);
  await a.run();
  assert.strictEqual(drive.notesIn("Theta Vault/.theta/trash").length, 1);
  await b.run();
  assert.ok(!b.store.peek(x.id), "deletion reaches the other PC");
  assert.ok(fs.readdirSync(path.join(b.store.root, ".theta", "trash")).length, "kept in the local trash too");
  // A deletes y while B edits it.
  a.store.remove(y.id);
  const e = b.store.person(y.id);
  e.decisionNote = "内定の連絡済み";
  b.store.put(e);
  await a.run();
  await b.run();
  assert.strictEqual(b.store.person(y.id).decisionNote, "内定の連絡済み");
  await a.run();
  assert.strictEqual(a.store.person(y.id).decisionNote, "内定の連絡済み", "the edited applicant comes back");
});

test("safety: many notes missing stops the sync; another account starts afresh; Obsidian notes get an id", async () => {
  const drive = new FakeDrive();
  const a = pc(drive);
  for (let i = 0; i < 12; i++) a.store.put(applicant("人" + i));
  await a.run();
  for (const f of drive.notesIn(APP)) f.trashed = true;
  await assert.rejects(a.run(), /同期を止めました/);
  assert.strictEqual(a.store.people().length, 12, "nothing deleted here");

  const other = new FakeDrive();
  const moved = new DriveVault(a.store, a.kv, other, "someone@example.com");
  const r = await moved.run();
  assert.strictEqual(r.up, 12, "a different Google account: everything goes up, nothing is deleted");

  await other.create({ name: "手書き.md", parents: [other.folderId(APP)], mimeType: "text/markdown" }, Buffer.from("---\nname: 手書き 一郎\ncategory: 事務\n---\n\nメモ\n"));
  await moved.run();
  const h = a.store.people().find((p) => p.name === "手書き 一郎");
  assert.ok(h);
  assert.match(other.text(other.notesIn(APP).find((n) => n.name.includes("手書き"))), new RegExp("id: " + h.id));
});

test("Obsidian edit on this PC's folder (seen by reloading) goes up with the file's time", async () => {
  const drive = new FakeDrive();
  const a = pc(drive), b = pc(drive);
  const p = applicant("編集 花子", { updated: 1000 });
  a.store.put(p, false);
  await a.run();
  const f = a.store.byId.get(p.id).file;
  fs.writeFileSync(f, fs.readFileSync(f, "utf8").replace("stage: received", "stage: interviewed"));
  a.store.load();
  assert.ok(a.store.person(p.id).updated > 1000);
  await a.run();
  await b.run();
  assert.strictEqual(b.store.person(p.id).stage, "interviewed");
});

test("two PCs tick different onboarding items: both stay ticked", async () => {
  const drive = new FakeDrive();
  const a = pc(drive), b = pc(drive);
  const p = model.addChecklist(applicant("入職 予定", { stage: "hired", updated: 1000 }), ["健康診断書", "免許証の写し", "雇用契約書"]);
  a.store.put(p, false);
  await a.run();
  await b.run();
  const pa = a.store.person(p.id);
  Object.assign(pa.checklist[0], { done: true, date: "2026-11-20" });
  pa.updated = 2000;
  a.store.put(pa, false);
  const pb = b.store.person(p.id);
  Object.assign(pb.checklist[1], { done: true, date: "2026-11-21", note: "原本確認済み" });
  pb.updated = 3000;
  b.store.put(pb, false);
  await a.run();
  await b.run();
  await a.run();
  for (const s of [a.store, b.store]) assert.deepStrictEqual(s.person(p.id).checklist.map((c) => c.done), [true, true, false]);
  assert.strictEqual(model.checkProgress(a.store.person(p.id)), "2/3");
});
