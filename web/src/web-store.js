// The browser version's store: the same interface as desktop/lib/vault-store.js, kept in IndexedDB.
// Records deleted here leave a tombstone until the next sync moves their note to the vault's trash.
// Media missing locally (synced from another device) are downloaded on first use.
"use strict";

const SAFE = /^[A-Za-z0-9_.-]+$/;
const clone = (x) => JSON.parse(JSON.stringify(x));

class WebStore {
  constructor(db) {
    this.db = db;
    this.root = "このブラウザ（Googleドライブと同期）";
    this.warnings = [];
    this.byId = new Map();
    this.tombs = new Map(); // id -> deleted at
    this.listeners = new Set();
    this.remoteMedia = null; // async (name) => bytes | null, set by the sync engine
    this.saving = Promise.resolve();
    this.eagerMedia = false; // pictures from other devices are fetched when first shown
  }

  async load() {
    this.byId = new Map((await this.db.all("people")).map((p) => [p.id, p]));
    this.tombs = new Map((await this.db.get("kv", "tombstones")) || []);
    return this;
  }

  // Writes are queued in order; flush() waits for them.
  queue(fn) {
    this.saving = this.saving.then(fn).catch((e) => console.error("save failed", e));
    return this.saving;
  }
  flush() {
    return this.saving;
  }

  people() {
    return [...this.byId.values()].map((p) => ({ ...p }));
  }

  peek(id) {
    const p = this.byId.get(id);
    return p ? { ...p } : undefined;
  }

  person(id) {
    const p = this.byId.get(id);
    if (!p) throw new Error("応募者が見つかりません（他の端末で削除された可能性があります）");
    return clone(p);
  }

  put(p, touch = true) {
    p = clone(p);
    if (touch) p.updated = Date.now();
    this.byId.set(p.id, p);
    this.queue(() => this.db.put("people", p));
    this.emit();
  }

  // From sync: no new timestamp; the caller emits once at the end.
  putSynced(p) {
    p = clone(p);
    this.byId.set(p.id, p);
    this.queue(() => this.db.put("people", p));
  }

  remove(id) {
    if (!this.byId.has(id)) return;
    this.byId.delete(id);
    this.tombs.set(id, Date.now());
    const tombs = [...this.tombs];
    this.queue(async () => {
      await this.db.del("people", id);
      await this.db.put("kv", tombs, "tombstones");
    });
    this.emit();
  }

  // Deleted on another device: no tombstone (nothing to tell the vault).
  removeQuietly(id) {
    this.byId.delete(id);
    this.queue(() => this.db.del("people", id));
  }

  forgetTomb(id) {
    this.tombs.delete(id);
    const tombs = [...this.tombs];
    this.queue(() => this.db.put("kv", tombs, "tombstones"));
  }

  mediaFile(name) {
    if (!SAFE.test(name) || name.includes("..")) throw new Error("不正なファイル名");
    return name;
  }

  async hasMedia(name) {
    return (await this.db.get("media", this.mediaFile(name))) !== undefined;
  }

  async readMedia(name) {
    let b = await this.db.get("media", this.mediaFile(name));
    if (b === undefined && this.remoteMedia) {
      b = await this.remoteMedia(name);
      if (b) await this.db.put("media", new Uint8Array(b), name);
    }
    if (b === undefined || b === null) throw new Error("画像がありません：" + name);
    return Buffer.from(b instanceof ArrayBuffer ? new Uint8Array(b) : b);
  }

  async writeMedia(name, bytes) {
    await this.db.put("media", new Uint8Array(bytes), this.mediaFile(name));
  }

  hashes() {
    const s = new Set();
    for (const p of this.byId.values()) for (const src of p.sources || []) if (src.hash) s.add(src.hash);
    return s;
  }

  on(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit() {
    for (const fn of this.listeners) fn();
  }
}

module.exports = { WebStore };
