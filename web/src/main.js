// Runs before the shared app.js: provides window.Native backed by WebBackend in this page, with
// IndexedDB for data, the camera / photo library for import, and Google for contacts and the
// Theta Vault.
"use strict";
const { Idb } = require("./idb");
const { WebStore } = require("./web-store");
const { WebBackend } = require("./web-backend");
const { imaging } = require("./imaging");
const { WebGoogle } = require("./google");

let backend = null;
const early = []; // calls made before the database is open
window.Native = {
  call(json) {
    const { action, ...q } = JSON.parse(json);
    if (backend) backend.handle(action, q);
    else early.push([action, q]);
  },
};

// Camera for a quick scan, the photo library (several at once) otherwise.
function openFiles(single, action) {
  return new Promise((ok) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*,application/pdf";
    if (action === "quickScan" || action === "scan") input.capture = "environment";
    else if (!single) input.multiple = true;
    input.style.display = "none";
    document.body.appendChild(input);
    const done = (files) => {
      input.remove();
      ok(files);
    };
    input.addEventListener("change", () =>
      done([...input.files].map((f, i) => ({ name: f.name || `photo-${i + 1}.jpg`, read: async () => Buffer.from(await f.arrayBuffer()) }))),
    );
    input.addEventListener("cancel", () => done([]));
    input.click(); // still inside the tap
  });
}

const TYPES = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", pdf: "application/pdf", webm: "audio/webm", ogg: "audio/ogg", m4a: "audio/mp4", mp3: "audio/mpeg", wav: "audio/wav", json: "application/json" };
const typeOf = (name) => TYPES[String(name).split(".").pop().toLowerCase()] || "application/octet-stream";

async function blobOf(store, name) {
  return new Blob([await store.readMedia(name)], { type: typeOf(name) });
}

function services(store) {
  return {
    imaging,
    openFiles,
    openFolder: async () => "",
    saveFile: async (name, text) => {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
      a.download = name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 60000);
      return name;
    },
    openExternal: (u) => window.open(u, "_blank", "noopener"),
    openPath: async (name) => window.open(URL.createObjectURL(await blobOf(store, name)), "_blank"),
    showInFolder: async (name) => {
      const file = new File([await blobOf(store, name)], name, { type: typeOf(name) });
      if (navigator.canShare && navigator.canShare({ files: [file] })) return navigator.share({ files: [file] });
      window.open(URL.createObjectURL(file), "_blank");
    },
  };
}

(async () => {
  const db = await Idb.open();
  const saved = (await db.get("kv", "settings")) || {};
  let key = (await db.get("kv", "geminiKey")) || "";
  const settings = {
    get: (k, d) => (k in saved ? saved[k] : d),
    set: (o) => {
      Object.assign(saved, o);
      db.put("kv", { ...saved }, "settings");
    },
  };
  // The Gemini key stays in this browser's storage (it is never synced or sent anywhere but Google).
  const secrets = {
    get: () => key,
    set: (v) => {
      key = v;
      db.put("kv", v, "geminiKey");
    },
  };
  const store = await new WebStore(db).load();
  const kv = { get: (k) => db.get("kv", k), put: (k, v) => db.put("kv", v, k) };
  // The account chosen last time is remembered (by address only), so a new sign-in asks nothing.
  const google = (purpose) => {
    const id = settings.get("googleClientId", "");
    if (!id) return null;
    const key = purpose === "contacts" ? "googleContactsEmail" : "googleSyncEmail";
    return new WebGoogle(id, purpose, { get: () => settings.get(key, ""), set: (v) => settings.set({ [key]: v }) });
  };
  backend = new WebBackend({ store, settings, secrets, services: services(store), google, kv });
  backend.startSync();
  backend.on((msg) => window.onNative && window.onNative(msg));
  // Camera pictures and interview recordings made on the page.
  window.ThetaUpload = (files, q = {}) =>
    backend.receive(files.map((f) => ({ name: f.name, read: async () => Buffer.from(await f.blob.arrayBuffer()) })), q).catch((e) => window.onNative({ type: "error", data: e.message }));

  // Pictures synced from another device arrive on first view (media/ is served by the
  // service worker from IndexedDB; a miss is fetched from the vault here).
  document.addEventListener(
    "error",
    async (e) => {
      const t = e.target;
      const m = t && t.tagName === "IMG" && /(?:^|\/)media\/([^?#]+)/.exec(t.getAttribute("src") || "");
      if (!m || t.dataset.fetched) return;
      t.dataset.fetched = "1";
      try {
        t.src = URL.createObjectURL(await blobOf(store, decodeURIComponent(m[1])));
      } catch {}
    },
    true,
  );

  for (const [action, q] of early.splice(0)) backend.handle(action, q);
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
})();
