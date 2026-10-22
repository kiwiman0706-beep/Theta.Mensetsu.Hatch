// The browser version and a PC on the same Theta Vault: the browser keeps records in IndexedDB
// (in memory here) and fetches pictures on first view; the PC keeps a local folder.
"use strict";
require("./setup");
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { MemoryDb } = require("../src/idb");
const { WebStore } = require("../src/web-store");
const { DriveVault } = require("../../desktop/lib/drive-vault");
const { VaultStore } = require("../../desktop/lib/vault-store");
const model = require("../../desktop/lib/model");
const { FakeDrive, memoryKv } = require("../../desktop/test/fakes");

async function browser(drive) {
  const db = new MemoryDb();
  const store = await new WebStore(db).load();
  const kv = { get: (k) => db.get("kv", k), put: (k, v) => db.put("kv", v, k) };
  return { store, run: () => new DriveVault(store, kv, drive, "hr@example.com").run() };
}
function pc(drive) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mensetsu-web-"));
  const store = new VaultStore(path.join(dir, "Theta Vault"), path.join(dir, "overlay.json")).load();
  const kv = memoryKv();
  return { store, run: () => new DriveVault(store, kv, drive, "hr@example.com").run() };
}

test("PC → browser (pictures on first view) → PC; deletion in the browser reaches the PC", async () => {
  const drive = new FakeDrive();
  const a = pc(drive), w = await browser(drive);
  const p = { ...model.empty(), name: "山田 花子", status: "confirmed", pages: [{ file: "img1.jpg", name: "1" }] };
  await a.store.writeMedia("img1.jpg", Buffer.from("JPEG1"));
  a.store.put(p);
  await a.run();
  const r = await w.run();
  assert.deepStrictEqual([r.down, r.media], [1, 0], "the browser waits until a picture is shown");
  assert.strictEqual(String(await w.store.readMedia("img1.jpg")), "JPEG1");
  const e = w.store.person(p.id);
  e.stage = "offered";
  w.store.put(e);
  await w.run();
  await a.run();
  assert.strictEqual(a.store.person(p.id).stage, "offered");
  w.store.remove(p.id);
  await w.run();
  await a.run();
  assert.ok(!a.store.peek(p.id));
});
