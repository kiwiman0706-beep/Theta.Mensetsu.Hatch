// The Android app's page bridge (android/: MainActivity.java hosts the page). Like main.js for the
// browser, but the phone does the device parts: pictures and PDFs are files on the phone (served
// at media/), Google access comes from Play services (no sign-in window, no hourly expiry), the
// document scanner, saving and sharing files, and the encrypted Gemini key.
"use strict";
const { Idb } = require("./idb");
const { WebStore } = require("./web-store");
const { Backend } = require("../../desktop/lib/backend");
const { GoogleApi, NeedLogin } = require("../../desktop/lib/google-api");
const { imaging } = require("./imaging");

const A = window.AndroidNative;
const CAPS = ["pick", "scan", "gemini", "export", "attach", "contacts", "sync", "google", "camera", "record", "commute"];

// Native calls answer through window.AndroidReply(id, json).
const waiting = new Map();
let seq = 0;
window.AndroidReply = (id, data) => {
  const w = waiting.get(id);
  if (!w) return;
  waiting.delete(id);
  data && data.error ? w.ng(new Error(data.error)) : w.ok(data || {});
};
function native(method, args = {}) {
  return new Promise((ok, ng) => {
    const id = "r" + ++seq;
    waiting.set(id, { ok, ng });
    A.call(method, JSON.stringify(args), id);
  });
}

// Records in IndexedDB (as in the browser); media as files on the phone.
class AndroidStore extends WebStore {
  async hasMedia(name) {
    return A.hasMedia(this.mediaFile(name));
  }
  async readMedia(name) {
    const r = await fetch("media/" + encodeURIComponent(this.mediaFile(name)));
    if (r.ok) return Buffer.from(await r.arrayBuffer());
    const b = this.remoteMedia ? await this.remoteMedia(name) : null;
    if (!b) throw new Error("画像がありません：" + name);
    await this.writeMedia(name, b);
    return Buffer.from(b);
  }
  async writeMedia(name, bytes) {
    const err = A.writeMedia(this.mediaFile(name), Buffer.from(bytes).toString("base64"));
    if (err) throw new Error("ファイルを保存できませんでした：" + err);
  }
}

// Google through Play services: the account is chosen once; later tokens come silently.
class AndroidGoogle extends GoogleApi {
  constructor(purpose, persist) {
    super(purpose);
    this.persist = persist;
    this.email = persist.get() || "";
    this.access = null;
    this.blocked = false; // Google wants the user again (a tap on "ログイン")
  }
  configured() {
    return true;
  }
  signedIn() {
    return !!this.email && !this.blocked;
  }
  expire() {
    this.access = null;
  }
  async accessToken() {
    if (this.access && this.access.until > Date.now()) return this.access.token;
    if (!this.email) throw new NeedLogin();
    const r = await native("token", { purpose: this.purpose, email: this.email, interactive: false });
    if (r.needLogin) {
      this.blocked = true;
      throw new NeedLogin("もう一度許可が必要です");
    }
    this.access = { token: r.token, until: Date.now() + 45 * 60 * 1000 };
    return r.token;
  }
  async signIn() {
    const r = await native("token", { purpose: this.purpose, email: this.email || this.hint || "", interactive: true, chooser: true });
    this.email = r.email || this.email;
    this.access = { token: r.token, until: Date.now() + 45 * 60 * 1000 };
    this.blocked = false;
    this.persist.set(this.email);
    return this.email;
  }
  async signOut() {
    this.email = "";
    this.access = null;
    this.persist.set("");
  }
}

let backend = null;
const early = [];
window.Native = {
  call(json) {
    const { action, ...q } = JSON.parse(json);
    if (backend) backend.handle(action, q);
    else early.push([action, q]);
  },
};

const fromIncoming = (list) => list.map((f) => ({ name: f.name, read: async () => Buffer.from(await (await fetch(f.path)).arrayBuffer()) }));

function pickFiles(single, zip = false) {
  return new Promise((ok) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = zip ? ".zip,application/zip" : "image/*,application/pdf";
    input.multiple = !single;
    input.style.display = "none";
    document.body.appendChild(input);
    const done = (files) => {
      input.remove();
      ok(files);
    };
    input.addEventListener("change", () => done([...input.files].map((f) => ({ name: f.name || "file.jpg", read: async () => Buffer.from(await f.arrayBuffer()) }))));
    input.addEventListener("cancel", () => done([]));
    input.click();
  });
}

const services = (store) => ({
  imaging,
  // "Scan": Google's document scanner; else the system's file picker.
  openFiles: async (single, action) => {
    if (action === "scan" || action === "quickScan") {
      const r = await native("scan", {});
      if (!r.unavailable) return fromIncoming(r.files || []);
      // No scanner on this phone (or Play services too old): the page's own camera instead.
      window.onNative({ type: "toast", data: "スキャナーを使えないため、カメラで撮影します" });
      if (window.cameraSheet) window.cameraSheet({});
      return [];
    }
    return pickFiles(single, action === "zip");
  },
  saveBytes: async (name, bytes, type) => ((await native("saveFile", { name, b64: Buffer.from(bytes).toString("base64"), type: type || "application/zip" })).saved ? name : ""),
  openFolder: async () => "",
  saveFile: async (name, text) => ((await native("saveFile", { name, text, type: "text/csv" })).saved ? name : ""),
  openExternal: (url) => native("openUrl", { url }),
  openPath: (name) => native("openFile", { name }),
  showInFolder: (name) => native("share", { name }),
});

(async () => {
  const db = await Idb.open();
  const saved = (await db.get("kv", "settings")) || {};
  const settings = {
    get: (k, d) => (k in saved ? saved[k] : d),
    set: (o) => {
      Object.assign(saved, o);
      db.put("kv", { ...saved }, "settings");
    },
  };
  const secrets = { get: () => A.secretGet(), set: (v) => A.secretSet(v || "") };
  const store = await new AndroidStore(db).load();
  store.root = "このスマホ（Googleドライブと同期）";
  const kv = { get: (k) => db.get("kv", k), put: (k, v) => db.put("kv", v, k) };
  const google = (purpose) => {
    const key = purpose === "contacts" ? "googleContactsEmail" : "googleSyncEmail";
    const g = new AndroidGoogle(purpose, { get: () => settings.get(key, ""), set: (v) => settings.set({ [key]: v }) });
    g.hint = shared["google.account"] || ""; // the account the hub uses, offered first
    return g;
  };
  let info = {};
  try {
    info = JSON.parse(A.info());
  } catch {}
  // The series' hub (Home / KidsHome) on this phone: its shared settings come first.
  let hub = {};
  try {
    hub = JSON.parse(A.hub());
  } catch {}
  const shared = hub.info || {};
  if (shared["gemini.model"] && !settings.get("model", "")) settings.set({ model: shared["gemini.model"] });
  const HUB_NAMES = { "app.thetahatch.home": "Home Hatch", "app.thetahatch.kidshome": "KidsHome Hatch" };
  backend = new Backend({
    store,
    settings,
    secrets,
    services: services(store),
    google,
    kv,
    platform: "android",
    caps: CAPS,
    info: () => ({ version: info.version, appPackage: info.package, appSha1: info.sha1, hubName: HUB_NAMES[hub.hub] || "", hubGeminiKey: !!hub.hasGeminiKey && !A.secretGet(), hubAccount: shared["google.account"] || "" }),
  });
  // What only the phone does: ask the hub to update this app, borrow the hub's Gemini key, and
  // tell the hub about settings this app changed (model, Google account).
  const handle = backend.handle.bind(backend);
  backend.handle = async (action, q = {}) => {
    if (action === "checkUpdate") return native("update", {});
    if (action === "useHubKey") {
      const ok = A.useHubGeminiKey();
      backend.refresh();
      return backend.toast(ok ? `${HUB_NAMES[hub.hub] || "ハブ"} の Gemini APIキーを使います` : "APIキーを受け取れませんでした");
    }
    await handle(action, q);
    if (action === "settings" && q.model) A.hubWrite(JSON.stringify({ "gemini.model": settings.get("model", "") }));
    if (action === "googleSignIn" && q.purpose !== "contacts" && backend.gSync && backend.gSync.email) A.hubWrite(JSON.stringify({ "google.account": backend.gSync.email }));
  };
  backend.on((msg) => window.onNative && window.onNative(msg));
  window.ThetaCopy = (text) => native("copyText", { text });
  window.ThetaUpload = (files, q = {}) =>
    backend.receive(files.map((f) => ({ name: f.name, read: async () => Buffer.from(await f.blob.arrayBuffer()) })), q).catch((e) => window.onNative({ type: "error", data: e.message }));
  // Files shared to the app from Gmail, Files, Google Drive…
  window.AndroidShared = (list) => backend.receive(fromIncoming(list), { mode: "file" }).catch((e) => window.onNative({ type: "error", data: e.message }));
  backend.startSync();
  for (const [action, q] of early.splice(0)) backend.handle(action, q);
})();
