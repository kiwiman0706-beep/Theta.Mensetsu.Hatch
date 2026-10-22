// Builds the browser version into dist/: the shared UI (../ui), the bridge (src/main.js, bundling
// the desktop backend for the browser), the service worker, pdf.js and the home-screen manifest.
// dist/ is what GitHub Pages serves. `node build.js --android` builds the same page for the Android
// app instead (android/app/src/main/assets/www: the phone bridge, no service worker).
"use strict";
const fs = require("fs");
const path = require("path");
const esbuild = require("esbuild");

const here = __dirname;
const ANDROID = process.argv.includes("--android");
const dist = ANDROID ? path.resolve(here, "../android/app/src/main/assets/www") : path.join(here, "dist");
const assets = path.resolve(here, "../ui");
const version = require("./package.json").version;

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });
for (const f of ["app.js", "style.css"]) fs.copyFileSync(path.join(assets, f), path.join(dist, f));
for (const f of fs.readdirSync(path.join(here, "public"))) fs.copyFileSync(path.join(here, "public", f), path.join(dist, f));

// The same page, with what a browser app needs: a CSP for Google and Gemini, the manifest, and
// the bridge before app.js.
const CSP = (ANDROID ? [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "media-src 'self' blob:",
  "connect-src 'self' https://generativelanguage.googleapis.com https://www.googleapis.com https://people.googleapis.com",
  "worker-src 'self' blob:",
  "base-uri 'self'",
  "form-action 'none'",
] : [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://accounts.google.com",
  "style-src 'self' 'unsafe-inline' https://accounts.google.com",
  "img-src 'self' data: blob: https://*.googleusercontent.com",
  "media-src 'self' blob:",
  "connect-src 'self' https://generativelanguage.googleapis.com https://www.googleapis.com https://people.googleapis.com https://oauth2.googleapis.com https://accounts.google.com",
  "frame-src https://accounts.google.com",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "base-uri 'self'",
  "form-action 'none'",
]).join("; ");
let html = fs.readFileSync(path.join(assets, "index.html"), "utf8");
html = html.replace(/<meta\s+http-equiv="Content-Security-Policy"[\s\S]*?\/>/, `<meta http-equiv="Content-Security-Policy" content="${CSP}" />`);
html = html.replace(
  "<title>",
  [
    '<meta name="theme-color" content="#2b5f8c" />',
    '<meta name="apple-mobile-web-app-capable" content="yes" />',
    '<meta name="mobile-web-app-capable" content="yes" />',
    '<meta name="apple-mobile-web-app-status-bar-style" content="default" />',
    '<meta name="apple-mobile-web-app-title" content="面接Hatch" />',
    '<link rel="manifest" href="manifest.webmanifest" />',
    '<link rel="apple-touch-icon" href="apple-touch-icon.png" />',
    "<title>",
  ].join("\n    "),
);
if (!html.includes('<script src="app.js"></script>')) throw new Error("index.html: app.js script tag not found");
html = html.replace('<script src="app.js"></script>', '<script src="bridge.js"></script>\n    <script src="app.js"></script>');
fs.writeFileSync(path.join(dist, "index.html"), html);

fs.writeFileSync(
  path.join(dist, "manifest.webmanifest"),
  JSON.stringify(
    {
      name: "Theta Mensetsu Hatch",
      short_name: "面接Hatch",
      description: "履歴書を取り込み → Geminiで読み取り → 応募者を職種別に管理。PCと同じTheta Vault（Googleドライブ）を使う面接管理。",
      lang: "ja",
      start_url: "./",
      scope: "./",
      display: "standalone",
      background_color: "#f4f6f9",
      theme_color: "#2b5f8c",
      icons: [
        { src: "icon-192.png", sizes: "192x192", type: "image/png" },
        { src: "icon-512.png", sizes: "512x512", type: "image/png" },
        { src: "icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      ],
    },
    null,
    2,
  ),
);

// pdf.js (loaded only when a PDF is imported).
const pdf = path.join(here, "node_modules/pdfjs-dist");
fs.mkdirSync(path.join(dist, "pdf"), { recursive: true });
for (const f of ["pdf.min.mjs", "pdf.worker.min.mjs"]) fs.copyFileSync(path.join(pdf, "legacy/build", f), path.join(dist, "pdf", f));
fs.cpSync(path.join(pdf, "cmaps"), path.join(dist, "pdf/cmaps"), { recursive: true });
fs.cpSync(path.join(pdf, "standard_fonts"), path.join(dist, "pdf/standard_fonts"), { recursive: true });

// The shared JS (desktop/lib) runs in the browser with small stand-ins for Node's modules.
const common = {
  bundle: true,
  platform: "browser",
  target: ["safari16", "chrome110"],
  format: "iife",
  alias: { fs: path.join(here, "src/shim-fs.js"), path: path.join(here, "src/shim-path.js"), crypto: path.join(here, "src/shim-crypto.js") },
  inject: [path.join(here, "src/inject-buffer.js")],
  nodePaths: [path.join(here, "node_modules")],
  legalComments: "none",
  logLevel: "warning",
};
esbuild.buildSync({ ...common, entryPoints: [path.join(here, ANDROID ? "src/android-main.js" : "src/main.js")], outfile: path.join(dist, "bridge.js"), minify: true });
if (ANDROID) {
  console.log(`android ${version} built → ${path.relative(process.cwd(), dist)}`);
  process.exit(0);
}

// Everything but media/ and pdf.js is cached for offline use; a new version replaces the cache.
const shell = ["./", "index.html", "app.js", "style.css", "bridge.js", "manifest.webmanifest", "icon-192.png", "apple-touch-icon.png"];
const stamp = version + "-" + Date.now().toString(36);
esbuild.buildSync({
  ...common,
  entryPoints: [path.join(here, "src/sw.js")],
  outfile: path.join(dist, "sw.js"),
  define: { VERSION: JSON.stringify(stamp), SHELL: JSON.stringify(shell) },
  minify: true,
});
fs.writeFileSync(path.join(dist, ".nojekyll"), "");
console.log(`web ${stamp} built → ${path.relative(process.cwd(), dist) || "dist"}`);
