// The built browser version (dist/) in Chromium: it starts, adds an applicant, keeps it in
// IndexedDB across a reload, and shows no errors. Run after `npm run build`:
//   NODE_PATH=$(npm root -g) node test/e2e.cjs
"use strict";
const { chromium } = require("playwright");
const assert = require("assert");
const http = require("http");
const fs = require("fs");
const path = require("path");

const dist = path.join(__dirname, "..", "dist");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".png": "image/png", ".webmanifest": "application/manifest+json" };
const srv = http.createServer((req, res) => {
  const u = decodeURIComponent(new URL(req.url, "http://x").pathname);
  const f = path.join(dist, u === "/" ? "index.html" : u);
  if (!f.startsWith(dist) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) return res.writeHead(404).end();
  res.writeHead(200, { "Content-Type": TYPES[path.extname(f)] || "application/octet-stream" });
  fs.createReadStream(f).pipe(res);
});

(async () => {
  await new Promise((ok) => srv.listen(0, "127.0.0.1", ok));
  const url = `http://127.0.0.1:${srv.address().port}/`;
  const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(url);
    await page.getByText("最初の履歴書を、ここへ。").waitFor();
    await page.getByRole("button", { name: "メニュー" }).click();
    await page.getByRole("button", { name: /手入力で追加/ }).click();
    await page.locator("input").first().waitFor();
    await page.locator("label", { hasText: "氏名" }).first().locator("input").fill("ブラウザ 花子");
    await page.getByRole("button", { name: /^保存$/ }).click();
    await page.getByRole("heading", { name: "ブラウザ 花子" }).waitFor();
    await page.reload();
    await page.getByRole("button", { name: /すべて 1/ }).click();
    await page.getByText("ブラウザ 花子").waitFor();
    await page.getByRole("button", { name: "メニュー" }).click();
    await page.getByRole("button", { name: /^Googleアカウント/ }).click();
    await page.getByText("種類：ウェブ アプリケーション").waitFor();
    assert.deepStrictEqual(errors, []);
    console.log("PASS");
  } finally {
    await browser.close();
    srv.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
