// The Theta Vault folder *is* the database on the PC: one Markdown note per applicant, read on
// start and re-read when the folder changes (Obsidian, a sync tool). Device-only fields (queue,
// a pending Gemini result…) live in an overlay file outside the vault, and so do the deletions
// not yet sent to Google Drive (when the app syncs through the Drive API).
"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const V = require("./vault-codec");

const SAFE = /^[A-Za-z0-9_.-]+$/;

class VaultStore {
  constructor(root, overlayFile) {
    this.root = root;
    this.app = path.join(root, V.APP_DIR);
    this.top = path.join(this.app, V.FOLDER);
    this.media = path.join(this.app, "_files");
    this.overlayFile = overlayFile;
    this.tombFile = overlayFile.replace(/\.json$/, "") + "-deleted.json";
    this.byId = new Map(); // id -> { file, person }
    this.warnings = [];
    this.selfWrites = new Map(); // file -> content we just wrote (ignore our own watch events)
    this.listeners = new Set();
    this.eagerMedia = true; // the sync downloads every picture (Obsidian shows them)
    this.remoteMedia = null;
    this.overlay = this.readJson(overlayFile, {});
    this.tombs = new Map(Object.entries(this.readJson(this.tombFile, {})));
  }

  readJson(file, fallback) {
    try {
      return JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
      return fallback;
    }
  }

  ensure() {
    for (const d of [this.root, path.join(this.root, ".theta"), path.join(this.root, ".theta", "trash"), this.app, this.top, this.media])
      fs.mkdirSync(d, { recursive: true });
    const spec = path.join(this.root, ".theta", "vault.json");
    const cur = this.readJson(spec, null);
    if (!cur) fs.writeFileSync(spec, JSON.stringify({ spec: 1, apps: ["mensetsu"] }, null, 2));
    else if (Array.isArray(cur.apps) && !cur.apps.includes("mensetsu")) fs.writeFileSync(spec, JSON.stringify({ ...cur, apps: [...cur.apps, "mensetsu"] }, null, 2));
  }

  // Every .md under Mensetsu/ except _files (subfolders are fine: people organise in Obsidian).
  notes(dir = this.app, out = []) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name.startsWith(".")) continue;
      const f = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (f !== this.media) this.notes(f, out);
      } else if (e.name.endsWith(".md")) out.push(f);
    }
    return out;
  }

  load() {
    this.ensure();
    const next = new Map();
    this.warnings = [];
    for (const file of this.notes()) {
      let md;
      try {
        md = fs.readFileSync(file, "utf8");
      } catch {
        continue;
      }
      let p;
      try {
        p = V.parse(md, true);
      } catch (e) {
        this.warnings.push(`${path.relative(this.root, file)}：読み込めません（${e.message}）`);
        continue;
      }
      if (next.has(p.id)) {
        this.warnings.push(`${path.relative(this.root, file)}：同じidのノートが既にあります（無視しました）`);
        continue;
      }
      // Edited in Obsidian: the file's time is the time of the edit.
      if (V.editedOutside(md)) {
        try {
          p.updated = Math.max(p.updated || 0, fs.statSync(file).mtimeMs | 0);
        } catch {}
      }
      next.set(p.id, { file, person: p });
      if (p.vaultNewId) {
        // A note typed by hand in Obsidian: give it an id and the app layout once.
        delete p.vaultNewId;
        this.write(file, V.render(p));
      }
    }
    this.byId = next;
    return this;
  }

  withOverlay(p) {
    const o = this.overlay[p.id];
    return o ? { ...p, ...o } : { ...p };
  }

  people() {
    return [...this.byId.values()].map((x) => this.withOverlay(x.person));
  }

  peek(id) {
    const x = this.byId.get(id);
    return x ? this.withOverlay(x.person) : undefined;
  }

  person(id) {
    const x = this.byId.get(id);
    if (!x) throw new Error("応募者が見つかりません（他の端末で削除された可能性があります）");
    return JSON.parse(JSON.stringify(this.withOverlay(x.person)));
  }

  saveOverlay() {
    for (const [k, v] of Object.entries(this.overlay)) if (!v || !Object.keys(v).length) delete this.overlay[k];
    this.writeJson(this.overlayFile, this.overlay);
  }

  writeJson(file, value) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file + ".tmp", JSON.stringify(value));
    fs.renameSync(file + ".tmp", file);
  }

  write(file, md) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = path.join(path.dirname(file), "." + path.basename(file) + "." + process.pid + ".tmp");
    fs.writeFileSync(tmp, md);
    fs.renameSync(tmp, file);
    this.selfWrites.set(file, md);
  }

  uniquePath(dir, name, except) {
    let f = path.join(dir, name);
    for (let i = 2; fs.existsSync(f) && f !== except; i++) f = path.join(dir, name.replace(/\.md$/, ` (${i}).md`));
    return f;
  }

  // Saves a record: device-only fields go to the overlay, the rest to its note (renamed as the
  // name or the job category changes; notes the user filed in a subfolder stay there).
  put(p, touch = true, quiet = false) {
    p = JSON.parse(JSON.stringify(p));
    if (touch) p.updated = Date.now();
    const overlay = {};
    for (const k of V.LOCAL) if (p[k] != null && p[k] !== "") overlay[k] = p[k];
    this.overlay[p.id] = overlay;
    this.saveOverlay();
    for (const k of V.LOCAL) delete p[k];
    const cur = this.byId.get(p.id);
    let file;
    if (!cur) file = this.uniquePath(this.top, V.fileName(p));
    else {
      const dir = path.dirname(cur.file);
      file = path.basename(cur.file) === V.fileName(p) ? cur.file : this.uniquePath(dir, V.fileName(p), cur.file);
    }
    this.write(file, V.render(p));
    if (cur && cur.file !== file) {
      try {
        fs.unlinkSync(cur.file);
      } catch {}
    }
    this.byId.set(p.id, { file, person: p });
    if (!quiet) this.emit();
  }

  // From the sync: keeps the record's own times; the sync emits once at the end.
  putSynced(p) {
    this.put(p, false, true);
  }

  moveToTrash(id) {
    const cur = this.byId.get(id);
    if (!cur) return false;
    const trash = path.join(this.root, ".theta", "trash");
    fs.mkdirSync(trash, { recursive: true });
    try {
      fs.renameSync(cur.file, this.uniquePath(trash, path.basename(cur.file)));
    } catch {}
    this.byId.delete(id);
    delete this.overlay[id];
    this.saveOverlay();
    return true;
  }

  // Deleting moves the note into .theta/trash (the vault's own recycle bin) and remembers it, so
  // the next Drive sync moves the note there too.
  remove(id) {
    if (!this.moveToTrash(id)) return;
    this.tombs.set(id, Date.now());
    this.writeJson(this.tombFile, Object.fromEntries(this.tombs));
    this.emit();
  }

  // Deleted on another device.
  removeQuietly(id) {
    this.moveToTrash(id);
  }

  forgetTomb(id) {
    if (!this.tombs.delete(id)) return;
    this.writeJson(this.tombFile, Object.fromEntries(this.tombs));
  }

  async flush() {}

  mediaFile(name) {
    if (!SAFE.test(name) || name.includes("..")) throw new Error("不正なファイル名");
    fs.mkdirSync(this.media, { recursive: true });
    return path.join(this.media, name);
  }

  async hasMedia(name) {
    return fs.existsSync(this.mediaFile(name));
  }

  // Media go through the store, so the same backend runs on the browser store (web/). A picture
  // another device uploaded is fetched from Drive on first use.
  async readMedia(name) {
    const f = this.mediaFile(name);
    try {
      return await fs.promises.readFile(f);
    } catch (e) {
      if (!this.remoteMedia) throw e;
      const b = await this.remoteMedia(name);
      if (!b) throw new Error("画像がありません：" + name);
      await this.writeMedia(name, b);
      return Buffer.from(b);
    }
  }

  async writeMedia(name, bytes) {
    const f = this.mediaFile(name);
    await fs.promises.writeFile(f + ".tmp", bytes);
    await fs.promises.rename(f + ".tmp", f);
  }

  hashes() {
    const s = new Set();
    for (const { person } of this.byId.values()) for (const src of person.sources || []) if (src.hash) s.add(src.hash);
    return s;
  }

  on(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit() {
    for (const fn of this.listeners) fn();
  }

  // Reload when anything under Mensetsu/ changes from outside (debounced; our own writes ignored).
  watch() {
    let timer = null;
    const reload = () => {
      const before = new Map([...this.byId].map(([id, x]) => [id, V.render(x.person)]));
      this.load();
      const changed =
        before.size !== this.byId.size || [...this.byId].some(([id, x]) => before.get(id) !== V.render(x.person));
      if (changed) this.emit();
    };
    try {
      this.watcher = fs.watch(this.app, { recursive: true }, (ev, name) => {
        const f = name && path.join(this.app, name.toString());
        if (f && (f.startsWith(this.media) || /\.tmp$/.test(f))) return;
        if (f && this.selfWrites.has(f)) {
          let now = null;
          try {
            now = fs.readFileSync(f, "utf8");
          } catch {}
          if (now === this.selfWrites.get(f)) return;
          this.selfWrites.delete(f);
        }
        clearTimeout(timer);
        timer = setTimeout(reload, 700);
      });
    } catch {
      // No recursive watch on this platform: poll instead.
      this.poll = setInterval(reload, 15000);
    }
  }

  close() {
    if (this.watcher) this.watcher.close();
    if (this.poll) clearInterval(this.poll);
  }
}

const newId = () => crypto.randomUUID();
module.exports = { VaultStore, newId };
