// The applicant note format (docs/MENSETSU_VAULT.md): round trip, Obsidian edits, hand-written notes.
"use strict";
const test = require("node:test");
const assert = require("node:assert");
const V = require("../lib/vault-codec");

function sample() {
  const p = { id: "2b6f3c1e-aaaa-bbbb-cccc-000000000001" };
  for (const k of V.FIELDS) p[k] = "";
  Object.assign(p, {
    name: "山田 花子", kana: "やまだ はなこ", birthDate: "1995-04-12", category: "看護師", position: "病棟看護師（夜勤可）",
    stage: "scheduled", rating: "4", appliedDate: "2026-10-20", interview: "2026-11-05 14:00", mobile: "090-1234-5678",
    email: "hanako@example.com\nh2@example.com", address: "東京都千代田区1-1\n連絡先：実家", education: "2013-04 ○○看護専門学校 入学\n2016-03 同 卒業",
    career: "2016-04 ○○病院 入職", licenses: "2016-05 看護師免許", motivation: "地域医療に…\n二行目", tags: "経験者、夜勤可",
    decisionDate: "", hireDate: "", commuteCost: "定期 1か月 約12,000円",
    status: "confirmed", contactRegistered: true, contactId: "people/c123", contactAccount: "hr@example.com",
    created: 1709600400123, updated: 1760000000456, rawText: "履 歴 書\n山田 花子", queue: "photo", suggestion: { name: "x" },
    portrait: "ph1.jpg", portraitSource: "resume",
    pages: [{ file: "a1-0.jpg" }, { file: "a1-1.jpg" }],
    sources: [{ file: "a1.pdf", name: "resume.pdf", hash: "abc" }],
    notes: [
      { id: "note-1", time: 1709600400000, text: "電話で日程調整" },
      { id: "note-2", time: 1709700000000, text: "受け答えが丁寧\n夜勤の経験あり" },
    ],
    documents: [{ id: "d1", date: "2026-10-21", kind: "免許証・資格証の写し", title: "看護師免許", files: [{ file: "d1.jpg" }, { file: "d1.pdf", original: true }] }],
    recordings: [{ id: "r1", file: "r1.webm", time: 1709700000000, seconds: 1501, title: "一次面接", summary: "・夜勤可", transcript: "面接官: どうぞ\n応募者: よろしくお願いします" }],
    evaluations: [{ id: "e1", date: "2027-09-30", period: "試用期間", evaluator: "看護部長", score: "A", text: "良好" }],
  });
  return p;
}

test("round trip keeps everything shared, nothing device-only", () => {
  const p = sample();
  const md = V.render(p);
  assert.equal(V.editedOutside(md), false);
  assert.doesNotMatch(md, /queue|suggestion/);
  assert.match(md, /theta: mensetsu\/applicant@1/);
  assert.match(md, /> \[!note\]- 文字起こし/);
  const q = V.parse(md);
  for (const k of V.FIELDS) assert.equal(q[k], p[k], k);
  for (const k of ["contactId", "contactAccount", "portrait", "portraitSource", "rawText", "created", "updated"]) assert.deepEqual(q[k], p[k], k);
  assert.deepEqual(q.notes, p.notes);
  assert.deepEqual(q.recordings, p.recordings);
  assert.deepEqual(q.evaluations, p.evaluations);
  assert.equal(q.documents[0].kind, "免許証・資格証の写し");
  assert.deepEqual(q.documents[0].files.map((f) => !!f.original), [false, true]);
  assert.equal(V.render(q), md, "stable");
});

test("Obsidian edits: frontmatter, notes, free text; unknown keys kept", () => {
  let md = V.render(sample());
  md = md.replace("stage: scheduled", "stage: 面接済み\ncssclasses: [wide]").replace("## 面接メモ\n", "## 面接メモ\n- 2026-11-05 15:10 Obsidianで追記\n");
  md += "\n自分用のメモ\n";
  assert.equal(V.editedOutside(md), true);
  const q = V.parse(md);
  assert.equal(q.stage, "interviewed", "Japanese stage names are understood");
  assert.equal(q.notes.length, 3);
  assert.match(q.vaultFree, /自分用のメモ/);
  assert.deepEqual(q.vaultExtra, { cssclasses: ["wide"] });
  assert.match(V.render(q), /cssclasses:/);
});

test("hand-written note gets an id; file name is name（職種）", () => {
  const q = V.parse("---\nname: 鈴木 一郎\ncategory: 事務\n---\n本文\n", true);
  assert.ok(q.vaultNewId && q.id);
  assert.equal(q.stage, "received");
  assert.equal(V.fileName(q), "鈴木 一郎（事務）.md");
  assert.throws(() => V.parse("no frontmatter"));
});
