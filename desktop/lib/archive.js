// One zip with everything: applicants as Vault notes plus their pictures, PDFs and recordings
// (docs/IMPORT_FORMAT.md). Opening the zip shows an ordinary Theta Vault (Obsidian reads it).
// The same format is read back: an export from another device, or applicants prepared elsewhere.
"use strict";
const crypto = require("crypto");
const { zipSync, unzipSync, strToU8, strFromU8 } = require("fflate");
const V = require("./vault-codec");
const model = require("./model");

const FORMAT = "theta-export-1";
const NOTES = V.APP_DIR + "/" + V.FOLDER + "/";
const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");
const AUDIO = /\.(webm|ogg|m4a|mp3|wav)$/i;

// people: records; readMedia(name) → bytes; opts: { recordings (default true), settings, version }
async function build(people, readMedia, opts = {}) {
  const files = {}, list = [], missing = [];
  const add = (path, bytes, level) => {
    files[path] = [bytes, { level }];
    list.push({ path, size: bytes.length, sha256: sha(bytes) });
  };
  const used = new Set();
  for (const p of people) {
    let name = V.fileName(p);
    for (let i = 2; used.has(name); i++) name = V.fileName(p).replace(/\.md$/, ` (${i}).md`);
    used.add(name);
    const x = opts.recordings === false ? { ...p, recordings: [] } : p;
    add(NOTES + name, strToU8(V.render(x)), 6);
  }
  const media = new Set();
  for (const p of people) for (const m of model.media(p)) if (opts.recordings !== false || !AUDIO.test(m)) media.add(m);
  for (const m of media) {
    try {
      add(V.FILES + m, new Uint8Array(await readMedia(m)), /\.(json|md|txt)$/i.test(m) ? 6 : 0);
    } catch {
      missing.push(m);
    }
  }
  if (opts.settings) add(".theta/mensetsu-settings.json", strToU8(JSON.stringify(opts.settings, null, 2)), 6);
  const manifest = { format: FORMAT, app: "mensetsu", version: opts.version || "", created: new Date().toISOString(), count: people.length, files: list, missing };
  files["manifest.json"] = [strToU8(JSON.stringify(manifest, null, 2)), { level: 6 }];
  return { bytes: zipSync(files), count: people.length, media: media.size - missing.length, missing };
}

// Reads a zip: notes (.md anywhere outside .theta/), files by their name (any folder named _files,
// or anywhere at all), the optional settings. Returns what is in it without changing anything.
function read(bytes) {
  let entries;
  try {
    entries = unzipSync(new Uint8Array(bytes));
  } catch (e) {
    throw new Error("zip ファイルを開けません（" + e.message + "）");
  }
  const notes = [], media = new Map(), warnings = [];
  let manifest = null, settings = null;
  for (const [path, data] of Object.entries(entries)) {
    if (path.endsWith("/") || /(^|\/)(__MACOSX|\.DS_Store)/.test(path)) continue;
    const base = path.slice(path.lastIndexOf("/") + 1);
    if (path === "manifest.json") {
      try {
        manifest = JSON.parse(strFromU8(data));
      } catch {}
      continue;
    }
    if (/(^|\/)mensetsu-settings\.json$/.test(path)) {
      try {
        settings = JSON.parse(strFromU8(data));
      } catch {}
      continue;
    }
    if (path.startsWith(".theta/") || path.includes("/.theta/")) continue;
    if (/\.md$/i.test(base)) {
      try {
        notes.push({ path, person: V.parse(strFromU8(data), true) });
      } catch (e) {
        warnings.push(`${path}：読み込めません（${e.message}）`);
      }
      continue;
    }
    if (/\.base$/i.test(base)) continue;
    if (/^[A-Za-z0-9_.-]+$/.test(base) && !base.includes("..")) media.set(base, data);
    else warnings.push(`${path}：ファイル名は英数字と _ . - だけにしてください（読み込みませんでした）`);
  }
  if (manifest && manifest.format && manifest.format !== FORMAT) warnings.push(`形式が違います（${manifest.format}）。読める所だけ読み込みます`);
  // A note listed twice (same id): the newer one.
  const byId = new Map();
  for (const n of notes) {
    const cur = byId.get(n.person.id);
    if (!cur || (n.person.updated || 0) > (cur.person.updated || 0)) byId.set(n.person.id, n);
    if (cur) warnings.push(`${n.path}：同じ id の応募者が zip の中に 2 つあります（新しい方を使います）`);
  }
  return { people: [...byId.values()].map((n) => n.person), media, warnings, manifest, settings };
}

// Adds what a zip holds to the store: new applicants, newer versions of known ones (older ones are
// skipped), and the files they refer to (a file already here is not written again).
async function apply(store, parsed) {
  const r = { added: 0, updated: 0, skipped: 0, files: 0, missing: [], unread: 0, warnings: [...parsed.warnings] };
  for (const p of parsed.people) {
    delete p.vaultNewId;
    for (const m of model.media(p)) {
      if (await store.hasMedia(m)) continue;
      const b = parsed.media.get(m);
      if (!b) {
        r.missing.push(`${p.name || p.id}：${m}`);
        continue;
      }
      await store.writeMedia(m, b);
      r.files++;
    }
    const cur = store.peek(p.id);
    if (cur && (cur.updated || 0) >= (p.updated || 0)) {
      r.skipped++;
      continue;
    }
    if (cur) for (const k of V.LOCAL) if (cur[k] !== undefined) p[k] = cur[k];
    if (store.tombs && store.tombs.has(p.id)) store.forgetTomb(p.id);
    store.putSynced(p);
    cur ? r.updated++ : r.added++;
    if (p.status === "new" && (p.pages || []).length) r.unread++;
  }
  await store.flush();
  store.emit();
  return r;
}

module.exports = { FORMAT, build, read, apply };
