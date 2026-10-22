// IndexedDB, shared by the page and the service worker (which serves media/ from it).
// people: one record per applicant; media: image / PDF bytes by file name; kv: settings, sync index.
"use strict";
const NAME = "theta-mensetsu";

function open() {
  return new Promise((ok, ng) => {
    const r = indexedDB.open(NAME, 1);
    r.onupgradeneeded = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains("people")) db.createObjectStore("people", { keyPath: "id" });
      if (!db.objectStoreNames.contains("media")) db.createObjectStore("media");
      if (!db.objectStoreNames.contains("kv")) db.createObjectStore("kv");
    };
    r.onsuccess = () => ok(r.result);
    r.onerror = () => ng(r.error);
  });
}

const req = (r) => new Promise((ok, ng) => ((r.onsuccess = () => ok(r.result)), (r.onerror = () => ng(r.error))));

// The small interface WebStore and the sync engine use; MemoryDb (tests) has the same one.
class Idb {
  constructor(db) {
    this.db = db;
  }
  static async open() {
    return new Idb(await open());
  }
  tx(store, mode) {
    return this.db.transaction(store, mode).objectStore(store);
  }
  get(store, key) {
    return req(this.tx(store, "readonly").get(key));
  }
  all(store) {
    return req(this.tx(store, "readonly").getAll());
  }
  keys(store) {
    return req(this.tx(store, "readonly").getAllKeys());
  }
  put(store, value, key) {
    return req(key === undefined ? this.tx(store, "readwrite").put(value) : this.tx(store, "readwrite").put(value, key));
  }
  del(store, key) {
    return req(this.tx(store, "readwrite").delete(key));
  }
}

class MemoryDb {
  constructor() {
    this.s = { people: new Map(), media: new Map(), kv: new Map() };
  }
  async get(store, key) {
    const v = this.s[store].get(key);
    return v === undefined ? undefined : structuredClone(v);
  }
  async all(store) {
    return [...this.s[store].values()].map((v) => structuredClone(v));
  }
  async keys(store) {
    return [...this.s[store].keys()];
  }
  async put(store, value, key) {
    this.s[store].set(key === undefined ? value.id : key, structuredClone(value));
  }
  async del(store, key) {
    this.s[store].delete(key);
  }
}

module.exports = { Idb, MemoryDb };
