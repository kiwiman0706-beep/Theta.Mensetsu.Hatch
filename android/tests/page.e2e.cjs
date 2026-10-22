// The Android app's page (assets/www, built by `npm run build:android` in web/) in Chromium, with
// a stand-in for MainActivity's bridge: files written through the bridge land in a folder served
// at /www/media/, the scanner hands back a page at /www/incoming/, Google answers with a token.
// Run: NODE_PATH=$(npm root -g) node android/tests/page.e2e.cjs
"use strict";
const { chromium } = require("playwright");
const assert = require("assert");
const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");

const www = path.join(__dirname, "..", "app", "src", "main", "assets", "www");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mensetsu-android-"));
const media = path.join(tmp, "media"), incoming = path.join(tmp, "incoming");
fs.mkdirSync(media);
fs.mkdirSync(incoming);
fs.copyFileSync(path.join(__dirname, "resume.jpg"), path.join(incoming, "scan1.jpg"));
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".png": "image/png", ".jpg": "image/jpeg", ".json": "application/json" };

const srv = http.createServer((req, res) => {
  const u = new URL(req.url, "http://x");
  const p = decodeURIComponent(u.pathname);
  // The bridge's synchronous calls (writeMedia / hasMedia), as MainActivity.Bridge does them.
  if (p === "/bridge/write" && req.method === "POST") {
    const parts = [];
    req.on("data", (c) => parts.push(c));
    req.on("end", () => {
      fs.writeFileSync(path.join(media, path.basename(u.searchParams.get("name"))), Buffer.from(Buffer.concat(parts).toString(), "base64"));
      res.end("");
    });
    return;
  }
  if (p === "/bridge/has") return res.end(fs.existsSync(path.join(media, path.basename(u.searchParams.get("name")))) ? "1" : "0");
  let f = "";
  if (p.startsWith("/www/media/")) f = path.join(media, path.basename(p));
  else if (p.startsWith("/www/incoming/")) f = path.join(incoming, path.basename(p));
  else if (p.startsWith("/www/")) f = path.join(www, p.slice(5) || "index.html");
  if (!f || !fs.existsSync(f) || fs.statSync(f).isDirectory()) return res.writeHead(404).end();
  res.writeHead(200, { "Content-Type": TYPES[path.extname(f)] || "application/octet-stream" });
  fs.createReadStream(f).pipe(res);
});

const FAKE = () => {
  const sync = (method, url, body) => {
    const x = new XMLHttpRequest();
    x.open(method, url, false);
    x.send(body);
    return x.responseText;
  };
  window.__calls = [];
  window.AndroidNative = {
    info: () => JSON.stringify({ version: "0.2.0", package: "jp.yaegaki.theta.mensetsu", sha1: "AF:16:1A:37" }),
    secretGet: () => window.__key || "",
    secretSet: (v) => (window.__key = v),
    hasMedia: (name) => sync("GET", "/bridge/has?name=" + encodeURIComponent(name)) === "1",
    writeMedia: (name, b64) => (sync("POST", "/bridge/write?name=" + encodeURIComponent(name), b64), ""),
    call: (method, json, id) => {
      const a = JSON.parse(json);
      window.__calls.push([method, a]);
      const answer =
        method === "scan" ? { files: [{ name: "scan-01.jpg", path: "incoming/scan1.jpg" }] }
        : method === "token" ? (a.interactive || a.email ? { token: "TOKEN", email: a.email || "hr@example.com" } : { needLogin: true })
        : method === "saveFile" ? { saved: true }
        : {};
      setTimeout(() => window.AndroidReply(id, answer), 10);
    },
  };
};

(async () => {
  await new Promise((ok) => srv.listen(0, "127.0.0.1", ok));
  const base = `http://127.0.0.1:${srv.address().port}/www/index.html`;
  const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.addInitScript(FAKE);
    // Google APIs are not reachable in the test: answer them empty.
    await page.route(/googleapis\.com/, (r) => r.fulfill({ status: 200, contentType: "application/json", body: '{"files":[],"email":"hr@example.com"}' }));
    await page.goto(base);
    await page.getByText("最初の履歴書を、ここへ。").waitFor();
    // Scan a résumé with the "native" scanner → a new applicant with its page stored on the phone.
    await page.locator("nav .shutter").click();
    await page.getByRole("button", { name: /スキャン（書類を自動で切り抜き）/ }).click();
    await page.getByText(/1人・1ページを保存しました/).waitFor();
    assert.ok(fs.readdirSync(media).some((f) => f.endsWith(".jpg")), "the page is a file on the phone");
    const pg = page.locator("img.pageimg").first();
    await pg.waitFor({ state: "attached" });
    await pg.scrollIntoViewIfNeeded();
    await page.waitForFunction(() => { const i = document.querySelector("img.pageimg"); return i && i.complete && i.naturalWidth > 0; });
    // Back at the list the back button lets the app close.
    await page.getByRole("button", { name: "応募者" }).click();
    assert.strictEqual(await page.evaluate(() => window.handleBack()), false);
    // Google: no client ID on Android; the setup guide shows the package name and SHA-1.
    await page.getByRole("button", { name: "メニュー" }).click();
    await page.getByRole("button", { name: /^Googleアカウント/ }).click();
    await page.getByText("クライアントIDを入れる必要はありません").waitFor();
    assert.strictEqual(await page.locator("#gclient").count(), 0);
    await page.getByRole("button", { name: "ログイン", exact: true }).first().click();
    for (let i = 0; i < 50 && !(await page.evaluate(() => window.__calls.some(([m, a]) => m === "token" && a.chooser))); i++) await page.waitForTimeout(50);
    await page.getByText(/ログインしました：hr@example.com/).waitFor();
    await page.getByRole("button", { name: /^Googleアカウント/ }).click();
    await page.getByText("ログイン中：hr@example.com").waitFor();
    await page.getByLabel("閉じる").click();
    await page.getByRole("button", { name: /^Google連携の初期設定ガイド/ }).click();
    await page.getByText("jp.yaegaki.theta.mensetsu").waitFor();
    await page.getByText("AF:16:1A:37").waitFor();
    await page.getByLabel("閉じる").click();
    // The Gemini key goes to the phone's keystore through the bridge.
    await page.getByRole("button", { name: /^Gemini APIキー/ }).click();
    await page.locator("input[type=password]").fill("AIzaTEST");
    await page.getByRole("button", { name: "保存", exact: true }).click();
    assert.strictEqual(await page.evaluate(() => window.__key), "AIzaTEST");
    await page.screenshot({ path: path.join(tmp, "android-menu.png") });
    assert.deepStrictEqual(errors, []);
    console.log("PASS", tmp);
  } finally {
    await browser.close();
    srv.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
