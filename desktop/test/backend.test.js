// Backend + VaultStore + HTTP bridge against a temporary vault, with fake imaging, Gemini and Google.
"use strict";
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const { VaultStore } = require("../lib/vault-store");
const { Backend } = require("../lib/backend");
const server = require("../lib/server");
const V = require("../lib/vault-codec");
const { FakeDrive, FakePeople, fakeAccount, memoryKv } = require("./fakes");

const RESUME = Object.fromEntries(require("../lib/prompts.json").resume.keys.map((k) => [k, ""]));

// gemini(prompt, body) → the JSON object Gemini "answers".
function setup(gemini = () => ({ ...RESUME }), { signedIn = true } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mensetsu-test-"));
  const root = path.join(dir, "Theta Vault");
  const store = new VaultStore(root, path.join(dir, "overlay.json")).load();
  const values = {};
  let key = "";
  const calls = [];
  const fetchImpl = async (url, opt) => {
    const body = opt && opt.body ? JSON.parse(opt.body) : {};
    const prompt = body.contents?.[0]?.parts?.[0]?.text || "";
    calls.push({ url, prompt, body });
    const answer = { candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify(gemini(prompt, body)) }] } }] };
    return { ok: true, status: 200, text: async () => JSON.stringify(answer), json: async () => answer };
  };
  const events = [];
  const imaging = {
    toJpeg: async (b) => b,
    pdfPages: async (b) => [b, Buffer.concat([b, Buffer.from("2")])],
    crop: async (b, rectOf) => (rectOf(1000, 1400) ? Buffer.from("face-of-" + b) : null),
    square: async (b) => Buffer.from("sq-" + b),
  };
  const people = new FakePeople(), drive = new FakeDrive();
  const account = fakeAccount("hr@example.com", { people, drive });
  account.signed = signedIn;
  const backend = new Backend({
    store,
    settings: { get: (k, d) => (k in values ? values[k] : d), set: (o) => Object.assign(values, o) },
    secrets: { get: () => key, set: (v) => (key = v) },
    services: { imaging, openFiles: async () => [], saveFile: async () => "x", openExternal: async () => {} },
    fetchImpl,
    google: (purpose) => (values.googleClientId === undefined ? null : account),
    kv: memoryKv(),
  });
  backend.on((e) => events.push(e));
  const file = (name, content) => {
    const f = path.join(dir, name);
    fs.writeFileSync(f, content);
    return f;
  };
  const settle = async () => {
    for (let i = 0; i < 100 && (backend.running || store.people().some((p) => p.queue)); i++) await new Promise((r) => setTimeout(r, 10));
  };
  const google = () => {
    values.googleClientId = "1-x.apps.googleusercontent.com";
    backend.resetGoogle();
  };
  return { dir, root, store, backend, events, calls, file, settle, setKey: (k) => (key = k), values, people, drive, account, google };
}

test("import → résumé read → face photo cut; job list goes to Gemini; device fields stay out of the vault", async () => {
  const t = setup((prompt) => ({ ...RESUME, name: "山田 花子", kana: "やまだ はなこ", category: "看護師", birthDate: "1995-04-12", licenses: "2016-05 看護師免許", photoBox: "100,700,300,950" }));
  t.setKey("k");
  t.values.categories = ["看護師", "医療事務"];
  await t.backend.importFiles([t.file("a.jpg", "jpegA"), t.file("b.pdf", "pdfB")], {});
  await t.settle();
  const people = t.store.people();
  assert.strictEqual(people.length, 2);
  assert.ok(people.every((p) => p.status === "confirmed" && p.name === "山田 花子" && p.category === "看護師" && p.stage === "received"));
  assert.match(t.calls[0].prompt, /看護師、医療事務/);
  const p = people.find((x) => x.pages.length === 2);
  assert.strictEqual(p.portraitSource, "resume");
  assert.match(String(await t.store.readMedia(p.portrait)), /^face-of-pdfB/);
  const notes = t.store.notes();
  assert.match(path.basename(notes[0]), /山田 花子（看護師）/);
  assert.doesNotMatch(fs.readFileSync(notes[0], "utf8"), /queue|photoTried/);
  // Same file again: skipped by its hash.
  await t.backend.importFiles([t.file("a2.jpg", "jpegA")], {});
  assert.strictEqual(t.store.people().length, 2);
});

test("saving only the edited fields keeps what another PC changed meanwhile", async () => {
  const t = setup();
  await t.backend.dispatch("new", {});
  const id = t.store.people()[0].id;
  await t.backend.dispatch("save", { id, person: { name: "佐藤 一郎", category: "事務" } });
  // Another PC (via the vault folder) sets the interview time.
  const other = t.store.person(id);
  other.interview = "2026-11-05 10:00";
  t.store.put(other);
  // This PC's edit form only changed the phone.
  await t.backend.dispatch("save", { id, person: { mobile: "090-0000-0000" } });
  const p = t.store.person(id);
  assert.deepStrictEqual([p.name, p.mobile, p.interview], ["佐藤 一郎", "090-0000-0000", "2026-11-05 10:00"]);
  assert.strictEqual(p.stage, "scheduled", "an interview time moves 書類受付 → 面接予定");
  await t.backend.dispatch("set", { id, fields: { stage: "hired" } });
  assert.match(t.store.person(id).decisionDate, /^\d{4}-\d{2}-\d{2}$/, "the decision gets its date");
  const list = t.store.person(id).checklist;
  assert.ok(list.length > 10 && list.some((c) => /健康診断/.test(c.item)) && list.some((c) => /免許証/.test(c.item)), "hiring starts the onboarding checklist");
  const hc = list.find((c) => /健康診断/.test(c.item));
  await t.backend.dispatch("checkSet", { id, cid: hc.id, done: true, note: "11/20 受領" });
  await t.backend.dispatch("checkAdd", { id, item: "看護師免許の原本を持参" });
  const after = t.store.person(id).checklist;
  assert.match(after.find((c) => c.id === hc.id).date, /^\d{4}-\d{2}-\d{2}$/);
  assert.strictEqual(after.at(-1).item, "看護師免許の原本を持参");
  const md = fs.readFileSync(t.store.byId.get(id).file, "utf8");
  assert.match(md, /- \[x\] 入職前の健康診断.*📅 .* — 11\/20 受領/);
  assert.match(md, /- \[ \] 看護師免許の原本を持参/);
  await t.backend.dispatch("checkCreate", { id });
  assert.strictEqual(t.store.person(id).checklist.length, after.length, "the template adds nothing twice");
  await t.backend.dispatch("evalSave", { id, evaluation: { period: "試用期間", score: "A", text: "良好" } });
  assert.strictEqual(t.store.person(id).evaluations[0].score, "A");
  await t.backend.dispatch("note", { id, text: "初回面接" });
  await t.backend.dispatch("delete", { id });
  assert.strictEqual(t.store.people().length, 0);
  assert.strictEqual(fs.readdirSync(path.join(t.root, ".theta", "trash")).length, 1);
  assert.ok(t.store.tombs.has(id), "remembered for the next Drive sync");
});

test("Google contacts: labels keep applicants apart; job change relabels; cleanup after the selection", async () => {
  const t = setup();
  t.google();
  await t.backend.dispatch("new", {});
  const id = t.store.people()[0].id;
  await t.backend.dispatch("save", { id, person: { name: "山田 花子", category: "看護師", mobile: "090-1" }, thenContact: true });
  const p = t.store.person(id);
  assert.match(p.contactId, /^people\//);
  assert.strictEqual(p.contactAccount, "hr@example.com");
  assert.deepStrictEqual(t.people.labelsOf(p.contactId), ["面接応募者", "面接応募者・看護師"]);
  const body = t.people.contacts.get(p.contactId);
  assert.match(body.names[0].honorificSuffix, /看護師 応募者/);
  assert.match(body.biographies[0].value, /Theta Mensetsu Hatch/);
  // The vault keeps the link, so another PC can update the same contact.
  assert.match(fs.readFileSync(t.store.notes()[0], "utf8"), /google_contact: people\/c/);
  await t.backend.dispatch("save", { id, person: { category: "看護助手" } });
  assert.deepStrictEqual(t.people.labelsOf(p.contactId), ["面接応募者", "面接応募者・看護助手"]);
  assert.strictEqual(t.people.groupsList.filter((g) => g.name === "面接応募者").length, 1, "one label, made once");
  await t.backend.dispatch("set", { id, fields: { stage: "rejected" } });
  await t.backend.dispatch("contactsCleanup", {});
  assert.strictEqual(t.people.contacts.size, 0);
  assert.ok(!t.store.person(id).contactId && t.store.person(id).contactUnlinked);
});

test("not signed in: contacts wait, then go in at sign-in", async () => {
  const t = setup(undefined, { signedIn: false });
  t.google();
  t.values.autoContact = true;
  await t.backend.dispatch("new", {});
  const id = t.store.people()[0].id;
  await t.backend.dispatch("save", { id, person: { name: "後で 登録" }, thenContact: true });
  assert.ok(t.store.person(id).contactPending);
  assert.ok(t.backend.state().googleNeeded);
  await t.backend.dispatch("googleSignIn", { purpose: "sync" });
  assert.ok(t.store.person(id).contactId && !t.store.person(id).contactPending);
});

test("recording → transcript; commute estimate; documents with a kind", async () => {
  const t = setup((prompt) =>
    /採用面接の録音/.test(prompt) ? { transcript: "面接官: どうぞ\n応募者: はい", summary: "・夜勤可" } : /通勤/.test(prompt) ? { route: "JR中央線 新宿→四ツ谷", minutes: "35", fare: "180", pass: "6,000", carKm: "12", carMinutes: "30", note: "" } : { ...RESUME },
  );
  t.setKey("k");
  await t.backend.dispatch("new", {});
  const id = t.store.people()[0].id;
  await t.backend.receive([{ name: "interview.webm", read: async () => Buffer.from("OPUS") }], { as: "recording", id, seconds: 125, title: "一次面接", transcribe: true });
  const r = t.store.person(id).recordings[0];
  assert.deepStrictEqual([r.title, r.seconds, r.transcript, r.summary], ["一次面接", 125, "面接官: どうぞ\n応募者: はい", "・夜勤可"]);
  assert.ok(t.calls.some((c) => c.body.contents?.[0]?.parts?.[1]?.inlineData?.mimeType === "audio/webm"));
  await assert.rejects(t.backend.dispatch("commute", { id }), /勤務先/);
  t.values.workplace = "東京都新宿区1-1";
  await t.backend.dispatch("save", { id, person: { name: "通勤 太郎", address: "東京都中野区2-2\n連絡先：実家" } });
  await t.backend.dispatch("commute", { id });
  const p = t.store.person(id);
  assert.match(p.commute, /公共交通 約35分 ・ JR中央線/);
  assert.match(p.commuteCost, /定期 1か月 約6,000円・片道 180円/);
  assert.ok(t.calls.at(-1).body.tools, "with Google Search");
  // A camera picture attached as a document.
  await t.backend.receive([{ name: "camera-01.jpg", read: async () => Buffer.from("JPG") }], { mode: "all", attachTo: id, kind: "雇用契約書", title: "契約書" });
  const d = t.store.person(id).documents[0];
  assert.deepStrictEqual([d.kind, d.title, d.files.length], ["雇用契約書", "契約書", 1]);
  assert.strictEqual(t.store.people().length, 1);
});

function get(port, p, headers = {}, method = "GET", body) {
  return new Promise((ok, ng) => {
    const req = http.request({ host: "127.0.0.1", port, path: p, method, headers }, (res) => {
      let d = "";
      res.on("data", (c) => (d += c));
      res.on("end", () => ok({ status: res.statusCode, headers: res.headers, body: d }));
    });
    req.on("error", ng);
    if (body) req.write(body);
    req.end();
  });
}

test("HTTP bridge: token, cookie, Host guard, UI, calls", async () => {
  const t = setup();
  const ui = path.join(__dirname, "..", "ui");
  const token = "abc123";
  const port = await new Promise((ok) => {
    const s = server.start({ backend: t.backend, store: t.store, uiDir: ui, port: 0, token, onReady: ok });
    t.srv = s;
  });
  // port 0 → the Host check needs the real port; restart on it.
  t.srv.close();
  const srv = await new Promise((ok) => {
    const s = server.start({ backend: t.backend, store: t.store, uiDir: ui, port, token, onReady: () => ok(s) });
  });
  try {
    const H = { Host: `127.0.0.1:${port}` };
    assert.strictEqual((await get(port, "/", H)).status, 401);
    assert.strictEqual((await get(port, "/?token=" + token, { Host: "evil.example:" + port })).status, 403);
    const r = await get(port, "/?token=" + token, H);
    assert.strictEqual(r.status, 302);
    assert.strictEqual(r.headers.location, "/");
    const cookie = r.headers["set-cookie"][0].split(";")[0];
    const page = await get(port, "/", { ...H, Cookie: cookie });
    assert.strictEqual(page.status, 200);
    assert.match(page.body, /bridge\.js/);
    assert.match(page.body, /connect-src 'self'/);
    assert.strictEqual((await get(port, "/app.js", { ...H, Cookie: cookie })).status, 200);
    assert.strictEqual((await get(port, "/../package.json", { ...H, Cookie: cookie })).status, 404);
    assert.strictEqual((await get(port, "/media/..%2Fx", { ...H, Cookie: cookie })).status, 500);
    const call = await get(port, "/api/call", { ...H, Cookie: cookie, "Content-Type": "application/json" }, "POST", JSON.stringify({ action: "new" }));
    assert.strictEqual(call.status, 204);
    await new Promise((r) => setTimeout(r, 50));
    assert.strictEqual(t.store.people().length, 1);
  } finally {
    srv.close();
  }
});

test("imported applicants already read (no Gemini reading) get their face photo cut in bulk", async () => {
  const t = setup((prompt) => (/顔写真/.test(prompt) && /box/.test(prompt) ? { box: "100,700,300,950" } : { ...RESUME }));
  t.setKey("k");
  await t.store.writeMedia("p1.jpg", Buffer.from("PAGE1"));
  const model = require("../lib/model");
  t.store.put({ ...model.empty(), id: "imp1", name: "読込 花子", status: "confirmed", pages: [{ file: "p1.jpg", name: "1" }] });
  t.store.put({ ...model.empty(), id: "imp2", name: "未読 太郎", status: "new", pages: [{ file: "p1.jpg", name: "1" }] });
  assert.deepStrictEqual(t.backend.state().photoMissing, 1, "the unread one gets its photo when read");
  await t.backend.dispatch("photoAll", {});
  await t.settle();
  const p = t.store.person("imp1");
  assert.strictEqual(p.portraitSource, "resume");
  assert.match(String(await t.store.readMedia(p.portrait)), /^face-of-PAGE1/);
  assert.strictEqual(t.backend.state().photoMissing, 0);
});

test("face photo cut by hand, and from an applicant who has only the PDF", async () => {
  const t = await setup();
  const model = require("../lib/model");
  await t.store.writeMedia("p1.jpg", Buffer.from("PAGE1"));
  await t.store.writeMedia("r.pdf", Buffer.from("PDF"));
  t.store.put({ ...model.empty(), id: "m1", name: "手動 花子", status: "confirmed", pages: [{ file: "p1.jpg", name: "1" }] });
  t.store.put({ ...model.empty(), id: "m2", name: "原本 太郎", status: "confirmed", sources: [{ file: "r.pdf", name: "履歴書.pdf", mime: "application/pdf" }] });
  await t.backend.dispatch("cropPortrait", { id: "m1", page: 0, x: 0.7, y: 0.05, w: 0.2, h: 0.2 });
  const p = t.store.person("m1");
  assert.match(String(await t.store.readMedia(p.portrait)), /^face-of-PAGE1/);
  assert.strictEqual(t.backend.state().photoMissing, 1, "the PDF-only one can have its photo cut too");
  await t.backend.dispatch("pdfPages", { id: "m2" });
  const q = t.store.person("m2");
  assert.strictEqual(q.pages.length, 2);
  assert.strictEqual(q.pages[0].source, "r.pdf");
  assert.strictEqual(String(await t.store.readMedia(q.pages[0].file)), "PDF");
});

test("AI again with another model (many at once), and memos pinned to the list", async () => {
  const t = setup((prompt) => (/顔写真/.test(prompt) && /box/.test(prompt) ? { box: "100,700,300,950" } : { ...RESUME, name: "読み直し 花子" }));
  t.setKey("k");
  const model = require("../lib/model");
  await t.store.writeMedia("p1.jpg", Buffer.from("PAGE1"));
  t.store.put({ ...model.empty(), id: "a1", name: "保存済み 花子", status: "confirmed", pages: [{ file: "p1.jpg", name: "1" }], portrait: "x.jpg", portraitSource: "resume" });
  t.store.put({ ...model.empty(), id: "a2", name: "手動 太郎", status: "confirmed", pages: [{ file: "p1.jpg", name: "1" }], portrait: "y.jpg" });
  await t.backend.dispatch("retryAI", { ids: ["a1", "a2"], what: "read", model: "gemini-3.8-flash" });
  await t.settle();
  const a1 = t.store.person("a1");
  assert.strictEqual(a1.name, "保存済み 花子", "saved data stays until checked");
  assert.strictEqual(a1.status, "review");
  assert.strictEqual(a1.suggestion.name, "読み直し 花子");
  assert.ok(!a1.queueModel && !a1.queue);
  const used = t.calls.map((c) => String(c.url));
  assert.ok(used.length >= 2 && used.every((u) => /gemini-3\.8-flash/.test(u)), "the chosen model: " + used.join(" "));
  await t.backend.dispatch("retryAI", { ids: ["a1", "a2"], what: "photo" });
  await t.settle();
  assert.notStrictEqual(t.store.person("a1").portrait, "x.jpg", "the automatic photo is cut again");
  assert.strictEqual(t.store.person("a2").portrait, "y.jpg", "a photo set by hand stays");
  // 📌 memos
  await t.backend.dispatch("note", { id: "a1", text: "夜勤可、車通勤" });
  const n = t.store.person("a1").notes[0];
  await t.backend.dispatch("pinNote", { id: "a1", noteId: n.id, pin: true });
  const codec = require("../lib/vault-codec");
  const back = codec.parse(codec.render(t.store.person("a1")), "x.md");
  assert.strictEqual(back.notes[0].pin, true);
  assert.strictEqual(back.notes[0].text, "夜勤可、車通勤");
  await t.backend.dispatch("pinNote", { id: "a1", noteId: n.id, pin: false });
  assert.ok(!t.store.person("a1").notes[0].pin);
});

test("shifts kept in the vault; the AI's notes made from job-related facts only", async () => {
  const t = setup((prompt) => (/面接官向けの参考メモ/.test(prompt) ? { summary: "病棟経験8年", strengths: "・急性期の経験", concerns: "・夜勤の回数", questions: "・夜勤は月何回まで可能ですか（ねらい：勤務条件）" } : { ...RESUME }));
  t.setKey("k");
  const model = require("../lib/model");
  t.store.put({ ...model.empty(), id: "s1", name: "勤務 花子", birthDate: "1980-01-01", address: "東京都秘密区1-1", category: "看護師", career: "2015-04 ○○病院 病棟 入職", status: "confirmed", shiftDays: "月、水、土", shiftKinds: "日勤、夜勤", shiftHours: "週4日まで" });
  const codec = require("../lib/vault-codec");
  const md = codec.render(t.store.person("s1"));
  assert.match(md, /shift_days:\n- 月\n- 水\n- 土/);
  const back = codec.parse(md, "x.md");
  assert.strictEqual(back.shiftKinds, "日勤、夜勤");
  assert.strictEqual(back.shiftHours, "週4日まで");
  await t.backend.dispatch("retryAI", { ids: ["s1"], what: "review", model: "gemini-3.8-flash" });
  await t.settle();
  const p = t.store.person("s1");
  assert.strictEqual(p.aiReview.strengths, "・急性期の経験");
  assert.strictEqual(p.aiReview.model, "gemini-3.8-flash");
  const sent = t.calls.at(-1);
  assert.match(sent.prompt, /週4日まで/);
  assert.doesNotMatch(sent.prompt, /勤務 花子|秘密区|1980/, "name, address and birth date stay out");
  assert.strictEqual(sent.body.contents[0].parts.length, 1, "no images");
  const again = codec.parse(codec.render(p), "x.md");
  assert.strictEqual(again.aiReview.questions, "・夜勤は月何回まで可能ですか（ねらい：勤務条件）");
});
