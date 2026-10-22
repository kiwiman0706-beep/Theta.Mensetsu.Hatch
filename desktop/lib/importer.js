// Files → people. Mirrors Importer.java: the original is kept (".pdf" / ".original"), each page is
// stored as a JPEG, files already imported (same SHA-256) are skipped, and pages are grouped into
// people by mode: file (1 file = 1 person), pair, page, all.
"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const model = require("./model");

const IMAGE = /\.(jpe?g|png|webp|gif|bmp|heic|heif|tiff?)$/i;

async function run(store, imaging, files, mode = "file", target = "", progress = () => {}) {
  if (files.length > 200) throw new Error("一度に200ファイルまで選択してください");
  if (mode !== "file" && mode !== "pair" && mode !== "page" && mode !== "all") mode = "file";
  if (target) mode = "all";
  // A file is a path (desktop) or { name, read() } (browser).
  files = files
    .map((f) => (typeof f === "string" ? { name: path.basename(f), read: () => fs.promises.readFile(f) } : f))
    .sort((a, b) => a.name.localeCompare(b.name, "ja", { numeric: true }));
  const seen = store.hashes();
  const docs = [], sources = [], errors = [];
  let skipped = 0;
  for (let i = 0; i < files.length; i++) {
    const f = files[i], original = f.name;
    progress(`画像を保存中 ${i + 1} / ${files.length}\n${original}`);
    try {
      const buf = await f.read();
      if (buf.length > 100 * 1024 * 1024) throw new Error("ファイルが大きすぎます");
      const hash = crypto.createHash("sha256").update(buf).digest("hex");
      if (seen.has(hash)) {
        skipped++;
        continue;
      }
      const pdf = /\.pdf$/i.test(original);
      if (!pdf && !IMAGE.test(original)) throw new Error("画像かPDFではありません");
      const base = crypto.randomUUID();
      const srcName = base + (pdf ? ".pdf" : ".original");
      const jpegs = pdf ? await imaging.pdfPages(buf, 2400) : [await imaging.toJpeg(buf, 2400)];
      if (!jpegs.length) throw new Error("空のPDFです");
      if (jpegs.length > 100) throw new Error("PDFは100ページまでです");
      await store.writeMedia(srcName, buf);
      const pages = [];
      for (const [n, j] of jpegs.entries()) {
        const name = pdf ? `${base}-${n}.jpg` : `${base}.jpg`;
        await store.writeMedia(name, j);
        pages.push({ file: name, name: pdf ? `${original} / ${n + 1}` : original, source: srcName });
      }
      docs.push(pages);
      sources.push({ file: srcName, name: original, hash, mime: pdf ? "application/pdf" : "image/jpeg" });
      seen.add(hash);
    } catch (e) {
      errors.push(`${original}: ${e.message}`);
    }
  }
  const flat = docs.flat();
  let groups = [];
  if (mode === "all") groups = flat.length ? [flat] : [];
  else if (mode === "file") groups = docs;
  else {
    const size = mode === "pair" ? 2 : 1;
    for (let i = 0; i < flat.length; i += size) groups.push(flat.slice(i, i + size));
  }
  const ids = [];
  for (const group of groups) {
    const p = target ? store.person(target) : model.empty();
    const used = new Set(group.map((x) => x.source));
    p.pages = [...(p.pages || []), ...group];
    p.sources = [...(p.sources || []), ...sources.filter((s) => used.has(s.file))];
    if (!target) p.status = "new";
    store.put(p);
    ids.push(p.id);
  }
  return { ids, skipped, errors, pages: groups.reduce((n, g) => n + g.length, 0) };
}

module.exports = { run, IMAGE };
