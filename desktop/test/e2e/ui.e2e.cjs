// The shared UI over the PC's HTTP bridge, in Chromium: real VaultStore + Backend, fake imaging.
// Run: NODE_PATH=$(npm root -g) node test/e2e/ui.e2e.cjs   (needs Playwright; not part of npm test)
"use strict";
const { chromium } = require("playwright");
const assert = require("assert");
const fs = require("fs"), os = require("os"), path = require("path");
const { VaultStore } = require("../../lib/vault-store");
const { Backend } = require("../../lib/backend");
const server = require("../../lib/server");
const model = require("../../lib/model");

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mensetsu-e2e-"));
  const store = new VaultStore(path.join(dir, "Theta Vault"), path.join(dir, "overlay.json")).load();
  // A few applicants to look at.
  const today = new Date().toLocaleDateString("sv-SE");
  const seed = [
    ["山田 花子", "看護師", "scheduled", today + " 14:00", "4"],
    ["佐藤 一郎", "医療事務", "received", "", ""],
    ["鈴木 次郎", "看護師", "hired", "2026-09-01 10:00", "5"],
    ["高橋 三奈", "介護職", "rejected", "", "2"],
  ];
  for (const [name, category, stage, interview, rating] of seed)
    store.put({ ...model.empty(), name, kana: "てすと", category, stage, interview, rating, status: "confirmed", birthDate: "1990-05-01", mobile: "090-0000-0000", licenses: "2012-04 看護師免許\n2015-03 認定看護師", career: "2012-04 ○○病院 入職", address: "東京都中野区1-1" });
  const values = {};
  const saved = {}, cropped = {};
  const backend = new Backend({
    store,
    settings: { get: (k, d) => (k in values ? values[k] : d), set: (o) => Object.assign(values, o) },
    secrets: { get: () => "", set: () => {} },
    services: {
      imaging: { toJpeg: async (b) => b, pdfPages: async (b) => [b], crop: async (b, rectOf) => ((cropped.rect = rectOf(1000, 1400)), Buffer.from(b)) },
      openFiles: async (single, action) => (action === "zip" && saved.zip ? [{ name: "export.zip", read: async () => saved.zip }] : []),
      saveBytes: async (name, bytes) => ((saved.zip = Buffer.from(bytes)), name),
    },
  });
  const port = 47000 + Math.floor(Math.random() * 900), token = "e2e";
  const srv = await new Promise((ok) => {
    const s = server.start({ backend, store, uiDir: path.join(__dirname, "../../../ui"), port, token, onReady: () => ok(s) });
  });
  const shots = process.env.SCREENSHOTS || path.join(dir, "shots");
  fs.mkdirSync(shots, { recursive: true });
  const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
  try {
    for (const width of [360, 1280]) {
      const page = await browser.newPage({ viewport: { width, height: 860 } });
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      page.on("dialog", (d) => d.accept());
      const noScroll = async (what) => assert.ok((await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)) <= 0, `no horizontal scroll: ${what} at ${width}`);
      await page.goto(`http://127.0.0.1:${port}/?token=${token}`);
      await page.getByText("今日の面接 1件").waitFor();
      await page.screenshot({ path: path.join(shots, `home-${width}.png`) });
      await noScroll("home");
      // Filters and views.
      await page.getByRole("button", { name: /すべて 4/ }).click();
      await page.getByRole("tab", { name: "職種別" }).click();
      await page.getByRole("button", { name: /医療事務 1人/ }).click();
      assert.strictEqual(await page.locator(".person").count(), 1);
      await page.getByRole("button", { name: /医療事務 ✕/ }).click();
      await page.getByRole("tab", { name: "表" }).click();
      await page.screenshot({ path: path.join(shots, `table-${width}.png`) });
      await page.getByRole("tab", { name: "面接予定" }).click();
      await page.getByText("これからの面接").waitFor();
      await page.screenshot({ path: path.join(shots, `calendar-${width}.png`) });
      await noScroll("calendar");
      // Detail: stage, rating, sections.
      await page.getByRole("tab", { name: "リスト" }).click();
      await page.locator(".person", { hasText: "山田 花子" }).click();
      await page.getByText("学歴・職歴・資格").waitFor();
      await page.getByLabel("4", { exact: true }).waitFor();
      await page.locator(".selection select").selectOption("interviewed");
      for (let i = 0; i < 50 && store.people().find((p) => p.name === "山田 花子").stage !== "interviewed"; i++) await page.waitForTimeout(50);
      assert.strictEqual(store.people().find((p) => p.name === "山田 花子").stage, "interviewed");
      await page.screenshot({ path: path.join(shots, `detail-${width}.png`), fullPage: true });
      await noScroll("detail");
      // Edit: history rows and a new job category typed in.
      await page.getByLabel("編集").click();
      await page.locator("#hist-licenses").getByRole("button", { name: "行を追加" }).click();
      await page.locator("#hist-licenses .histrow input:not([type=month])").last().fill("2020-01 BLS");
      await page.locator("input[list=catlist]").fill("認定看護師");
      await page.screenshot({ path: path.join(shots, `edit-${width}.png`), fullPage: true });
      await noScroll("edit");
      await page.getByRole("button", { name: /^保存$|保存$/ }).first().click();
      for (let i = 0; i < 50 && store.people().find((p) => p.name === "山田 花子").category !== "認定看護師"; i++) await page.waitForTimeout(50);
      const saved = store.people().find((p) => p.name === "山田 花子");
      assert.strictEqual(saved.category, "認定看護師");
      assert.match(saved.licenses, /BLS/);
      assert.match(saved.licenses, /認定看護師/, "the other rows stay");
      // Staff evaluation on the hired one.
      await page.goto(`http://127.0.0.1:${port}/`);
      await page.getByRole("button", { name: /すべて/ }).click();
      await page.locator(".person", { hasText: "鈴木 次郎" }).click();
      // Onboarding checklist (made when hired): tick the health check.
      if (width === 360) await page.getByText("採用手続きのチェックリストを作る").click();
      const box = page.locator(".check", { hasText: "入職前の健康診断" }).locator("input");
      await box.waitFor();
      await box.setChecked(width === 360);
      const ticked = () => store.people().find((p) => p.name === "鈴木 次郎").checklist.find((c) => /健康診断/.test(c.item)).done;
      for (let i = 0; i < 50 && ticked() !== (width === 360); i++) await page.waitForTimeout(50);
      assert.strictEqual(ticked(), width === 360, "ticked, then unticked");
      await page.locator(".panel h3", { hasText: `採用手続き ${width === 360 ? 1 : 0}/` }).waitFor(); // the count follows at once
      await page.screenshot({ path: path.join(shots, `checklist-${width}.png`), fullPage: true });
      await page.getByRole("button", { name: /評価を記録/ }).click();
      await page.locator("#ev-score").fill("A");
      await page.getByRole("button", { name: /保存/ }).last().click();
      for (let i = 0; i < 50 && !(store.people().find((p) => p.name === "鈴木 次郎").evaluations || []).length; i++) await page.waitForTimeout(50);
      assert.strictEqual(store.people().find((p) => p.name === "鈴木 次郎").evaluations[0].score, "A");
      // A handwritten memo: a mouse line, then a pen line with pressure (fingers ignored after).
      const before = (store.people().find((p) => p.name === "鈴木 次郎").sketches || []).length;
      await page.getByRole("button", { name: /手書きで書く/ }).click();
      const cv = page.locator("#sk-canvas");
      await cv.waitFor();
      const r = await cv.boundingBox();
      await page.mouse.move(r.x + 30, r.y + 40);
      await page.mouse.down();
      await page.mouse.move(r.x + 120, r.y + 60, { steps: 8 });
      await page.mouse.up();
      await page.evaluate(() => {
        const c = document.getElementById("sk-canvas"), b = c.getBoundingClientRect();
        const ev = (type, x, y, extra = {}) => c.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 7, pointerType: "pen", pressure: 0.9, clientX: b.left + x, clientY: b.top + y, buttons: 1, ...extra }));
        ev("pointerdown", 40, 100);
        for (let i = 1; i < 10; i++) ev("pointermove", 40 + i * 10, 100 + i * 3);
        ev("pointerup", 140, 130, { buttons: 0 });
        // A palm after the pen: ignored.
        c.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerId: 9, pointerType: "touch", clientX: b.left + 50, clientY: b.top + 200 }));
      });
      await page.locator("#sk-title").fill("一次面接メモ");
      await page.getByRole("button", { name: /^保存$/ }).last().click();
      const sketched = () => (store.people().find((p) => p.name === "鈴木 次郎").sketches || [])[before];
      for (let i = 0; i < 300 && !sketched(); i++) await page.waitForTimeout(50);
      const k = sketched();
      assert.ok(k && k.file.endsWith(".png") && k.strokes.endsWith(".json"), "saved as picture + strokes");
      const strokes = JSON.parse(fs.readFileSync(store.mediaFile(k.strokes), "utf8")).strokes;
      if (width === 360) assert.strictEqual(strokes.length, 2, "mouse + pen; the palm drew nothing");
      assert.ok(strokes.some((x) => x.p.length >= 10 && x.p.every((pt) => pt[2] === 0.9)), "the whole pen line, with its pressure");
      assert.ok(fs.statSync(store.mediaFile(k.file)).size > 1000, "a real PNG");
      await page.locator(".sketchthumb").first().waitFor();
      await page.screenshot({ path: path.join(shots, `sketch-list-${width}.png`) });
      // Opening it again brings the strokes back for editing.
      await page.locator(".sketchthumb").first().click();
      await page.locator("#sk-canvas").waitFor();
      await page.screenshot({ path: path.join(shots, `sketch-${width}.png`) });
      await page.getByLabel("閉じる").click();
      // Menu and its sheets.
      await page.getByRole("button", { name: "メニュー" }).click();
      await page.screenshot({ path: path.join(shots, `menu-${width}.png`), fullPage: true });
      for (const [row, text] of [["採用手続きのひな形", "1行に1つ"], ["同期", "同期の方法"], ["Googleアカウント", "OAuthクライアントID"], ["Google連絡先への登録", "ラベル名"], ["職種の一覧", "1行に1つ"], ["勤務先の住所", "通勤時間"]]) {
        await page.getByRole("button", { name: new RegExp("^" + row) }).first().click();
        await page.getByText(text).first().waitFor();
        await page.screenshot({ path: path.join(shots, `sheet-${row}-${width}.png`) });
        await noScroll(row);
        await page.getByLabel("閉じる").click();
      }
      assert.deepStrictEqual(errors, []);
      await page.close();
    }
    // Everything out to a zip and back in (the preview first, then the import).
    {
      const page = await browser.newPage({ viewport: { width: 1100, height: 860 } });
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      page.on("dialog", (d) => d.accept());
      await page.goto(`http://127.0.0.1:${port}/?token=${token}`);
      await page.getByRole("button", { name: "メニュー" }).click();
      await page.getByRole("button", { name: /^すべてを書き出す/ }).click();
      await page.getByRole("button", { name: /^書き出す$/ }).click();
      await page.getByText(/人・ファイル .*個を書き出しました/).waitFor();
      assert.ok(saved.zip && saved.zip.length > 100);
      const gone = store.people().find((p) => p.name === "佐藤 一郎");
      await page.getByLabel("閉じる").click();
      store.remove(gone.id);
      await page.getByText(/すべてを書き出す/).waitFor();
      await page.waitForTimeout(300); // the menu redraws with the new state
      await page.getByRole("button", { name: /^書き出したファイルを読み込む/ }).click();
      await page.getByText("読み込む前の確認").waitFor();
      await page.getByText("新しく加わる 1人").waitFor();
      await page.screenshot({ path: path.join(shots, "import-preview.png") });
      await page.getByRole("button", { name: /^読み込む$/ }).click();
      await page.getByText("読み込みました").waitFor();
      assert.ok(store.people().some((p) => p.name === "佐藤 一郎"), "brought back from the zip");
      assert.deepStrictEqual(errors, []);
      await page.close();
    }
    // The face photo cut out by hand: the page moves under the frame.
    {
      const page = await browser.newPage({ viewport: { width: 1100, height: 860 } });
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto(`http://127.0.0.1:${port}/?token=${token}`);
      const jpeg = await page.evaluate(() => {
        const c = document.createElement("canvas");
        c.width = 1000;
        c.height = 1400;
        const g = c.getContext("2d");
        g.fillStyle = "#fff";
        g.fillRect(0, 0, 1000, 1400);
        g.fillStyle = "#88a";
        g.fillRect(760, 90, 150, 200); // the photo
        return c.toDataURL("image/jpeg").split(",")[1];
      });
      await store.writeMedia("page-face.jpg", Buffer.from(jpeg, "base64"));
      store.put({ ...model.empty(), name: "顔 写子", category: "看護師", status: "confirmed", pages: [{ file: "page-face.jpg", name: "1" }] });
      await page.locator(".person", { hasText: "顔 写子" }).click();
      await page.getByLabel("顔写真").click();
      await page.getByRole("button", { name: /履歴書から自分で切り出す/ }).click();
      await page.locator("#cropframe").waitFor();
      await page.waitForTimeout(200);
      const b = await page.locator("#cropbox").boundingBox();
      await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
      await page.mouse.down();
      await page.mouse.move(b.x + b.width / 2 + 10, b.y + b.height / 2 + 5, { steps: 3 });
      await page.mouse.up();
      await page.mouse.wheel(0, -100);
      await page.screenshot({ path: path.join(shots, "crop.png") });
      await page.getByRole("button", { name: /顔写真にする/ }).click();
      for (let i = 0; i < 100 && !store.people().find((p) => p.name === "顔 写子").portrait; i++) await page.waitForTimeout(50);
      const r = cropped.rect;
      assert.ok(store.people().find((p) => p.name === "顔 写子").portrait, "portrait saved");
      assert.ok(r.x > 600 && r.x < 860 && r.y >= 0 && r.y < 200 && r.width > 50 && r.width < 300, "frame lands near the top right: " + JSON.stringify(r));
      // Shifts: a tap on a chip saves it.
      await page.locator(".shiftchips button", { hasText: "夜勤" }).click();
      await page.locator(".shiftchips button", { hasText: "土" }).click();
      for (let i = 0; i < 60 && store.people().find((p) => p.name === "顔 写子").shiftDays !== "土"; i++) await page.waitForTimeout(50);
      const sh = store.people().find((p) => p.name === "顔 写子");
      assert.strictEqual(sh.shiftKinds, "夜勤");
      assert.strictEqual(sh.shiftDays, "土");
      await page.getByText("AIの見立て").waitFor();
      await page.screenshot({ path: path.join(shots, "shift.png"), fullPage: true });
      // With a photo, tapping it opens the photo sheet (cut again, cut by hand, remove).
      await page.waitForTimeout(300);
      await page.getByLabel("顔写真").first().click();
      await page.getByRole("button", { name: /顔写真を外す/ }).waitFor();
      await page.getByLabel("閉じる").click();
      // 📌 memos on the card, and ticking applicants in the list.
      const face = store.people().find((p) => p.name === "顔 写子");
      store.put({ ...face, notes: [{ id: "n1", time: Date.now(), text: "夜勤可・車通勤", pin: true }, { id: "n2", time: Date.now(), text: "見せないメモ" }] });
      await page.goto(`http://127.0.0.1:${port}/?token=${token}`);
      await page.getByRole("tab", { name: "リスト" }).click();
      await page.locator(".pinnotes", { hasText: "夜勤可・車通勤" }).waitFor();
      assert.strictEqual(await page.locator(".pinnotes", { hasText: "見せないメモ" }).count(), 0);
      await page.getByRole("button", { name: /^選ぶ$/ }).click();
      await page.locator(".person", { hasText: "顔 写子" }).click();
      await page.locator(".person", { hasText: "佐藤 一郎" }).click();
      await page.getByText("2人を選択").waitFor();
      await page.screenshot({ path: path.join(shots, "pick.png") });
      assert.ok(await page.getByRole("button", { name: /AIに頼む・やり直す/ }).isEnabled());
      assert.deepStrictEqual(errors, []);
      await page.close();
    }
    // A second window for one applicant ("#p=<id>"): just that person, no navigation bar.
    const id = store.people().find((p) => p.name === "佐藤 一郎").id;
    const solo = await browser.newPage({ viewport: { width: 900, height: 860 } });
    await solo.goto(`http://127.0.0.1:${port}/?token=${token}`);
    await solo.goto(`http://127.0.0.1:${port}/#p=${id}`);
    await solo.reload(); // a hash change alone does not load the page again
    await solo.getByRole("heading", { name: "佐藤 一郎" }).waitFor();
    assert.strictEqual(await solo.locator("nav.nav").count(), 0);
    assert.match(await solo.title(), /佐藤 一郎/);
    console.log("PASS", shots);
  } finally {
    await browser.close();
    srv.close();
    store.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
