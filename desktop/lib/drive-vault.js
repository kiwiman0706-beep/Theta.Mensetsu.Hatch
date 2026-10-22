// Syncs this device's records with the Theta Vault on Google Drive (docs/SYNC.md). The same engine
// runs on the PC (records in a local Vault folder, vault-store.js) and in the browser (IndexedDB,
// web/src/web-store.js).
//
// The index (kv "vaultIndex") remembers, per record, its note's Drive file, the file's md5 when
// last seen and a hash of what this device last wrote or read. Remote changed = md5 differs;
// local changed = hash differs; both = merged field by field (model.syncMerge).
// Safety: deletions move notes into .theta/trash (never deleted), an edit wins over a deletion,
// many notes missing at once stops the sync, a note changed on Drive between reading and writing
// is not overwritten (merged on the next round), and an index made for another account or another
// vault folder is not trusted.
"use strict";
const crypto = require("crypto");
const V = require("./vault-codec");
const model = require("./model");

const FOLDER = "application/vnd.google-apps.folder";
const ROOT = "Theta Vault";
const hash = (p) => crypto.createHash("sha256").update(V.render(p)).digest("hex");
const decode = (b) => new TextDecoder().decode(b instanceof Uint8Array ? b : new Uint8Array(b));
const MIME = (name) =>
  /\.png$/i.test(name) ? "image/png" : /\.pdf$/i.test(name) ? "application/pdf" : /\.jpe?g$/i.test(name) ? "image/jpeg" : "application/octet-stream";

class DriveVault {
  // store: peek(id), people(), putSynced(p), removeQuietly(id), tombs (Map), forgetTomb(id),
  //        hasMedia, readMedia, writeMedia, flush(), emit(), eagerMedia
  // kv: { get(key), put(key, value) }; api: GoogleApi.drive(); account: the signed-in e-mail
  constructor(store, kv, api, account = "") {
    this.store = store;
    this.kv = kv;
    this.api = api;
    this.account = account;
  }

  async child(parent, name, create = true) {
    const q = `name='${name.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}' and '${parent}' in parents and mimeType='${FOLDER}' and trashed=false`;
    const found = await this.api.list(q);
    if (found.length) return found[0].id;
    if (!create) return null;
    return (await this.api.create({ name, parents: [parent], mimeType: FOLDER })).id;
  }

  async folders() {
    const root = await this.child("root", ROOT);
    const theta = await this.child(root, ".theta");
    const app = await this.child(root, V.APP_DIR);
    return {
      root,
      trash: await this.child(theta, "trash"),
      app,
      notes: await this.child(app, V.FOLDER),
      files: await this.child(app, "_files"),
    };
  }

  // Every note under Mensetsu/ (subfolders too: people organise in Obsidian), except _files.
  async notes(f) {
    const out = [];
    const walk = async (id, depth) => {
      for (const x of await this.api.list(`'${id}' in parents and trashed=false`)) {
        if (x.mimeType === FOLDER) {
          if (x.id !== f.files && !x.name.startsWith(".") && depth < 6) await walk(x.id, depth + 1);
        } else if (x.name.endsWith(".md")) out.push(x);
      }
    };
    await walk(f.app, 0);
    return out;
  }

  async mediaIndex(f) {
    if (!this.remoteFiles) this.remoteFiles = new Map((await this.api.list(`'${f.files}' in parents and trashed=false`)).map((x) => [x.name, x.id]));
    return this.remoteFiles;
  }

  // Lets the store fetch a picture that another device uploaded.
  attach(f) {
    this.store.remoteMedia = async (name) => {
      const id = (await this.mediaIndex(f)).get(name);
      return id ? new Uint8Array(await this.api.download(id)) : null;
    };
  }

  async index(f) {
    let ix = (await this.kv.get("vaultIndex")) || null;
    // Another Google account or a recreated vault folder: what we remember is about other files.
    if (!ix || (ix.account && this.account && ix.account !== this.account) || (ix.root && ix.root !== f.root)) ix = { notes: {} };
    ix.account = this.account || ix.account || "";
    ix.root = f.root;
    return ix;
  }

  async run(progress = () => {}) {
    const st = this.store;
    progress("Googleドライブを確認しています");
    const f = await this.folders();
    const ix = await this.index(f);
    this.remoteFiles = null;
    this.attach(f);
    const remote = await this.notes(f);
    const byFile = new Map(Object.entries(ix.notes).map(([id, n]) => [n.fileId, id]));
    const seen = new Set();
    const r = { down: 0, up: 0, merged: 0, deleted: 0, media: 0, retry: false, warnings: [] };

    // 1. Drive → here.
    for (const [i, file] of remote.entries()) {
      const knownId = byFile.get(file.id);
      if (knownId && ix.notes[knownId].md5 === file.md5Checksum) {
        seen.add(knownId);
        if (!st.peek(knownId) && st.tombs.has(knownId)) await this.trash(f, ix, knownId, file, r);
        continue;
      }
      progress(`受信 ${i + 1} / ${remote.length}`);
      let rp;
      try {
        rp = V.parse(decode(await this.api.download(file.id)), true);
      } catch (e) {
        r.warnings.push(`${file.name}：読み込めません（${e.message}）`);
        if (knownId) seen.add(knownId); // a broken note is not a deleted one
        continue;
      }
      if (seen.has(rp.id)) {
        r.warnings.push(`${file.name}：同じidのノートが既にあります（無視しました）`);
        continue;
      }
      seen.add(rp.id);
      const handWritten = !!rp.vaultNewId;
      delete rp.vaultNewId;
      const entry = { fileId: file.id, md5: file.md5Checksum, name: file.name, parent: (file.parents || [])[0] };
      const lp = st.peek(rp.id);
      if (!lp) {
        // Deleted here: the note goes to the trash, unless it was edited elsewhere since (edit wins).
        if (st.tombs.has(rp.id) && !ix.notes[rp.id]) {
          ix.notes[rp.id] = { ...entry, hash: "" };
          await this.trash(f, ix, rp.id, file, r);
          continue;
        }
        if (st.tombs.has(rp.id)) st.forgetTomb(rp.id);
        st.putSynced(rp);
        // A note typed by hand in Obsidian gets its id written back (hash "" = send it up).
        ix.notes[rp.id] = { ...entry, hash: handWritten ? "" : hash(rp) };
        r.down++;
        continue;
      }
      const old = ix.notes[rp.id];
      const localChanged = !old || hash(lp) !== old.hash;
      if (localChanged) {
        const merged = model.syncMerge(lp, rp);
        st.putSynced(merged);
        // Unchanged by the merge: nothing to send back.
        ix.notes[rp.id] = { ...entry, hash: hash(merged) === hash(rp) && !handWritten ? hash(merged) : "" };
        r.merged++;
      } else {
        const keep = {};
        for (const k of V.LOCAL) if (lp[k] !== undefined) keep[k] = lp[k];
        const next = { ...rp, ...keep };
        st.putSynced(next);
        ix.notes[rp.id] = { ...entry, hash: handWritten ? "" : hash(next) };
        r.down++;
      }
    }

    // 2. Known notes no longer under Mensetsu/: deleted elsewhere (unless edited here since).
    const missing = Object.keys(ix.notes).filter((id) => !seen.has(id));
    const known = Object.keys(ix.notes).length;
    if (missing.length > Math.max(5, Math.floor((known * 3) / 10)))
      throw new Error(`Googleドライブで多くのノート（${missing.length}件）が見つかりません。消えたのでなければ「Theta Vault」フォルダの移動・アカウントを確認してください。安全のため同期を止めました`);
    for (const id of missing) {
      const lp = st.peek(id);
      if (lp && hash(lp) !== ix.notes[id].hash) {
        delete ix.notes[id]; // edited here: it goes up again as a new note
        continue;
      }
      if (lp) {
        st.removeQuietly(id);
        r.deleted++;
      }
      if (st.tombs.has(id)) st.forgetTomb(id);
      delete ix.notes[id];
    }

    // 3. Here → Drive.
    const changed = st.people().filter((p) => !ix.notes[p.id] || hash(p) !== ix.notes[p.id].hash);
    for (const [i, p] of changed.entries()) {
      progress(`送信 ${i + 1} / ${changed.length}`);
      const e = ix.notes[p.id];
      // Changed on Drive since we read it (another PC is saving right now): merge next round.
      if (e && e.fileId) {
        const now = await this.api.meta(e.fileId).catch(() => null);
        if (now && (now.trashed || now.md5Checksum !== e.md5)) {
          r.retry = true;
          continue;
        }
      }
      await this.uploadMedia(f, p);
      const md = new TextEncoder().encode(V.render(p));
      const name = V.fileName(p);
      let file;
      if (!e) file = await this.api.create({ name, parents: [f.notes], mimeType: "text/markdown" }, md, "text/markdown");
      else file = await this.api.update(e.fileId, { name }, md, "text/markdown");
      ix.notes[p.id] = { fileId: file.id, md5: file.md5Checksum, name, parent: e ? e.parent : f.notes, hash: hash(p) };
      r.up++;
      await this.kv.put("vaultIndex", ix); // progress survives an interrupted run
    }

    // 4. Records deleted here whose notes were never synced: nothing to tell Drive.
    for (const id of [...st.tombs.keys()]) if (!ix.notes[id]) st.forgetTomb(id);
    await this.kv.put("vaultIndex", ix);

    // 5. The PC keeps every picture locally (Obsidian shows them); the browser fetches on view.
    if (st.eagerMedia) {
      const want = [];
      for (const p of st.people()) for (const name of model.media(p)) if (!(await st.hasMedia(name))) want.push(name);
      const remoteMedia = await this.mediaIndex(f);
      for (const [i, name] of want.entries()) {
        const id = remoteMedia.get(name);
        if (!id) continue;
        progress(`画像を受信 ${i + 1} / ${want.length}`);
        await st.writeMedia(name, await this.api.download(id));
        r.media++;
      }
    }

    await st.flush();
    st.warnings = r.warnings;
    st.emit();
    return r;
  }

  async trash(f, ix, id, file, r) {
    await this.api.update(file.id, {}, null, null, { add: f.trash, remove: (file.parents || []).join(",") });
    delete ix.notes[id];
    this.store.forgetTomb(id);
    r.deleted++;
  }

  async uploadMedia(f, p) {
    const remote = await this.mediaIndex(f);
    for (const name of model.media(p)) {
      if (remote.has(name) || !(await this.store.hasMedia(name))) continue;
      const bytes = await this.store.readMedia(name);
      const file = await this.api.create({ name, parents: [f.files] }, new Uint8Array(bytes), MIME(name));
      remote.set(name, file.id);
    }
  }
}

module.exports = { DriveVault, hash, ROOT };
