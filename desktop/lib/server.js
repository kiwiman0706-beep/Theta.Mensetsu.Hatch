// Serves the shared UI on 127.0.0.1 for the app window and for DeskHatch's web drawer.
// Bridge: POST /api/call (UI → backend), GET /api/events (server-sent events, backend → UI),
// POST /api/upload (files dropped on the page, camera pictures, recordings). Access needs the token (once via ?token=,
// then a cookie); requests with another Host are refused (DNS-rebinding guard).
"use strict";
const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "application/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".jpg": "image/jpeg", ".png": "image/png", ".pdf": "application/pdf", ".original": "application/octet-stream", ".webm": "audio/webm", ".ogg": "audio/ogg", ".m4a": "audio/mp4", ".mp3": "audio/mpeg", ".wav": "audio/wav", ".json": "application/json" };

// Runs before app.js: the HTTP flavour of Native.call / onNative, plus drag-and-drop import.
const BRIDGE = `"use strict";
window.Native = { call: (json) => fetch("/api/call", { method: "POST", headers: { "Content-Type": "application/json" }, body: json }) };
(function () {
  let es;
  const connect = () => {
    es = new EventSource("/api/events");
    es.onmessage = (e) => { try { window.onNative && window.onNative(JSON.parse(e.data)); } catch (err) { console.error(err); } };
    es.onerror = () => { es.close(); setTimeout(connect, 2000); };
  };
  connect();
  addEventListener("dragover", (e) => { e.preventDefault(); document.body.classList.add("dropping"); });
  addEventListener("dragleave", (e) => { if (!e.relatedTarget) document.body.classList.remove("dropping"); });
  // Pictures from the camera and interview recordings: [{ name, blob }], q = what to do with them.
  window.ThetaUpload = async (files, q = {}) => {
    const batch = crypto.randomUUID();
    for (const [i, f] of files.entries()) {
      const last = i === files.length - 1;
      await fetch("/api/upload?batch=" + batch + "&last=" + (last ? 1 : 0) + "&name=" + encodeURIComponent(f.name) + (last ? "&q=" + encodeURIComponent(JSON.stringify(q)) : ""), { method: "POST", body: f.blob });
    }
  };
  addEventListener("drop", async (e) => {
    e.preventDefault();
    document.body.classList.remove("dropping");
    const files = [...(e.dataTransfer?.files || [])];
    if (!files.length) return;
    const batch = crypto.randomUUID();
    for (const [i, f] of files.entries())
      await fetch("/api/upload?batch=" + batch + "&last=" + (i === files.length - 1 ? 1 : 0) + "&name=" + encodeURIComponent(f.name), { method: "POST", body: f });
  });
})();
`;

function start({ backend, store, uiDir, pdfDir, port, token, onReady }) {
  const clients = new Set();
  backend.on((msg) => {
    const line = "data: " + JSON.stringify(msg) + "\n\n";
    for (const res of clients) res.write(line);
  });
  const uploads = new Map(); // batch -> [paths]
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "theta-upload-"));

  const server = http.createServer(async (req, res) => {
    const u = new URL(req.url, "http://127.0.0.1");
    const host = String(req.headers.host || "");
    if (host !== `127.0.0.1:${port}` && host !== `localhost:${port}`) return send(res, 403, "forbidden");
    const cookie = /(?:^|;\s*)theta=([0-9a-f]+)/.exec(String(req.headers.cookie || ""));
    const authed = cookie && cookie[1] === token;
    if (!authed) {
      if (u.searchParams.get("token") === token && req.method === "GET") {
        u.searchParams.delete("token");
        res.writeHead(302, { "Set-Cookie": `theta=${token}; HttpOnly; SameSite=Strict; Path=/`, Location: u.pathname + u.search });
        return res.end();
      }
      return send(res, 401, "トークンが必要です。Theta Mensetsu Hatch のトレイメニューからURLをコピーしてください。");
    }
    try {
      if (u.pathname === "/api/events") {
        res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-store", Connection: "keep-alive" });
        res.write("retry: 2000\n\n");
        clients.add(res);
        req.on("close", () => clients.delete(res));
        return;
      }
      if (u.pathname === "/api/call" && req.method === "POST") {
        const body = JSON.parse((await read(req, 8 * 1024 * 1024)).toString("utf8"));
        send(res, 204);
        const { action, ...q } = body;
        return backend.handle(String(action || ""), q);
      }
      if (u.pathname === "/api/upload" && req.method === "POST") {
        const name = path.basename(u.searchParams.get("name") || "file").replace(/[^\p{L}\p{N}._ -]/gu, "_");
        const f = path.join(tmp, crypto.randomUUID() + "-" + name);
        fs.writeFileSync(f, await read(req, 100 * 1024 * 1024));
        const batch = u.searchParams.get("batch") || "x";
        uploads.set(batch, [...(uploads.get(batch) || []), f]);
        send(res, 204);
        if (u.searchParams.get("last") === "1") {
          const files = uploads.get(batch);
          uploads.delete(batch);
          let q = { mode: "file" };
          try {
            q = { ...q, ...JSON.parse(u.searchParams.get("q") || "{}") };
          } catch {}
          const named = files.map((f) => ({ name: path.basename(f).replace(/^[0-9a-f-]{36}-/, ""), read: () => fs.promises.readFile(f) }));
          await backend.receive(named, q).catch((e) => backend.event("error", e.message));
          for (const x of files) fs.rmSync(x, { force: true });
        }
        return;
      }
      if (u.pathname.startsWith("/media/")) {
        const name = decodeURIComponent(u.pathname.slice(7));
        const file = store.mediaFile(name);
        // Not here yet (uploaded by another PC): fetched from the vault on Drive first.
        if (!fs.existsSync(file) && store.remoteMedia) await store.readMedia(name).catch(() => {});
        return sendFile(res, file);
      }
      if (u.pathname === "/bridge.js") return send(res, 200, BRIDGE, TYPES[".js"]);
      // PDF page rendering (pdf.js) for the hidden helper window; pdfDir is the pdfjs-dist package.
      if (pdfDir && u.pathname.startsWith("/pdf/")) {
        const name = u.pathname.slice(5);
        let f = "";
        if (name === "render.html") f = path.join(__dirname, "..", "assets", name);
        else if (name === "pdf.mjs" || name === "pdf.worker.mjs") f = path.join(pdfDir, "legacy", "build", name);
        else if (/^(cmaps\/[A-Za-z0-9-]+\.bcmap|standard_fonts\/[A-Za-z0-9_-]+\.(pfb|ttf))$/.test(name)) f = path.join(pdfDir, name);
        if (!f) return send(res, 404, "not found");
        return sendFile(res, f, name.endsWith(".html") ? TYPES[".html"] : name.endsWith(".mjs") ? TYPES[".js"] : "application/octet-stream");
      }
      if (u.pathname === "/" || u.pathname === "/index.html") {
        // Same page as on Android, plus the HTTP bridge, and a CSP that lets it reach this server.
        let html = fs.readFileSync(path.join(uiDir, "index.html"), "utf8");
        html = html.replace("connect-src 'none'", "connect-src 'self'").replace('<script src="app.js"></script>', '<script src="bridge.js"></script><script src="app.js"></script>');
        return send(res, 200, html, TYPES[".html"]);
      }
      const rel = path.normalize(decodeURIComponent(u.pathname)).replace(/^([/\\])+/, "");
      if (!/^(app\.js|style\.css)$/.test(rel)) return send(res, 404, "not found");
      return sendFile(res, path.join(uiDir, rel));
    } catch (e) {
      return send(res, 500, String(e.message || e));
    }
  });
  server.listen(port, "127.0.0.1", () => onReady && onReady(server.address().port));
  return server;
}

function send(res, status, body = "", type = "text/plain; charset=utf-8") {
  res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
  res.end(body);
}
function sendFile(res, file, type) {
  if (!fs.existsSync(file)) return send(res, 404, "not found");
  res.writeHead(200, { "Content-Type": type || TYPES[path.extname(file).toLowerCase()] || "application/octet-stream", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
  fs.createReadStream(file).on("error", () => res.destroy()).pipe(res);
}
function read(req, max) {
  return new Promise((ok, ng) => {
    const parts = [];
    let n = 0;
    req.on("data", (c) => {
      n += c.length;
      if (n > max) {
        ng(new Error("too large"));
        req.destroy();
      } else parts.push(c);
    });
    req.on("end", () => ok(Buffer.concat(parts)));
    req.on("error", ng);
  });
}

module.exports = { start };
