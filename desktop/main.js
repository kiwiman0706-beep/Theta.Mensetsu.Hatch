// Theta Mensetsu Hatch for Windows / Mac. Lives in the tray, serves the shared UI on 127.0.0.1
// (the app window and DeskHatch drawers both use it), keeps the Theta Vault folder as its data and
// syncs it with Google Drive (directly through the Drive API, or through a sync tool's folder).
"use strict";
const { app, BrowserWindow, Tray, Menu, Notification, dialog, shell, nativeImage, safeStorage, clipboard, ipcMain } = require("electron");
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { VaultStore } = require("./lib/vault-store");
const { Backend } = require("./lib/backend");
const { DesktopGoogle } = require("./lib/google-desktop");
const server = require("./lib/server");

// THETA_USER_DATA / THETA_VAULT: point a test run at throwaway folders (test/e2e/electron-smoke.sh).
if (process.env.THETA_USER_DATA) app.setPath("userData", process.env.THETA_USER_DATA);
if (!app.requestSingleInstanceLock()) app.quit();

const userData = app.getPath("userData");
const settingsFile = path.join(userData, "settings.json");
let settingsData = {};
try {
  settingsData = JSON.parse(fs.readFileSync(settingsFile, "utf8"));
} catch {}
const settings = {
  get: (k, d) => (k in settingsData ? settingsData[k] : d),
  set: (obj) => {
    Object.assign(settingsData, obj);
    fs.mkdirSync(userData, { recursive: true });
    fs.writeFileSync(settingsFile, JSON.stringify(settingsData, null, 2));
  },
};
// The Gemini key is encrypted with the OS keychain (DPAPI / Keychain) and never leaves this PC.
const secrets = {
  get: () => {
    const enc = settings.get("apiKeyEnc", "");
    if (!enc) return "";
    try {
      return safeStorage.decryptString(Buffer.from(enc, "base64"));
    } catch {
      return "";
    }
  },
  set: (v) => settings.set({ apiKeyEnc: v ? safeStorage.encryptString(v).toString("base64") : "" }),
};
// Google refresh tokens, encrypted the same way (one per account: Drive sync, contacts).
const sealed = (key) => ({
  get: () => {
    const enc = settings.get(key, "");
    if (!enc) return null;
    try {
      return JSON.parse(safeStorage.decryptString(Buffer.from(enc, "base64")));
    } catch {
      return null;
    }
  },
  set: (v) => settings.set({ [key]: v ? safeStorage.encryptString(JSON.stringify(v)).toString("base64") : "" }),
});
// The sync index (which note is which Drive file) for this PC.
const kvFile = path.join(userData, "sync-index.json");
const kv = {
  get: async (k) => {
    try {
      return JSON.parse(fs.readFileSync(kvFile, "utf8"))[k];
    } catch {
      return undefined;
    }
  },
  put: async (k, v) => {
    let all = {};
    try {
      all = JSON.parse(fs.readFileSync(kvFile, "utf8"));
    } catch {}
    all[k] = v;
    fs.writeFileSync(kvFile + ".tmp", JSON.stringify(all));
    fs.renameSync(kvFile + ".tmp", kvFile);
  },
};
// A Vault inside a sync tool's folder (Google Drive for desktop, OneDrive, Dropbox).
const inCloudFolder = (v) => /([\\/](マイドライブ|My Drive|OneDrive[^\\/]*|Dropbox)([\\/]|$))|CloudStorage/i.test(v);

// Google Drive for desktop puts "My Drive" here; the phone syncs "Theta Vault" into it.
function findVault() {
  const names = ["マイドライブ", "My Drive"];
  const roots = [];
  if (process.platform === "win32") for (const d of "GHIJKLMNOPQRSTUVWXYZ") roots.push(d + ":\\");
  else {
    const cloud = path.join(os.homedir(), "Library", "CloudStorage");
    try {
      for (const e of fs.readdirSync(cloud)) if (e.startsWith("GoogleDrive")) roots.push(path.join(cloud, e));
    } catch {}
    roots.push(path.join(os.homedir(), "Google Drive"));
  }
  for (const r of roots) for (const n of names) {
    const v = path.join(r, n, "Theta Vault");
    if (fs.existsSync(v)) return v;
  }
  return "";
}

async function resolveVault() {
  let v = process.env.THETA_VAULT || "";
  if (!v) {
    const saved = settings.get("vaultPath", "");
    if (saved && fs.existsSync(saved)) return saved;
    v = findVault();
  }
  if (!v) {
    const r = await dialog.showMessageBox({
      type: "question",
      buttons: ["書類フォルダに作る", "フォルダを選ぶ"],
      message: "Theta Vault の場所",
      detail: "データ（応募者ごとのMarkdownと履歴書の画像）を置くフォルダです。ふつうは書類フォルダに作り、Googleドライブとはアプリが直接同期します（メニュー →「同期」）。Googleドライブ（パソコン版）の「マイドライブ/Theta Vault」を選ぶと、その同期に任せることもできます。後から変えられます。",
    });
    if (r.response === 1) {
      const pick = await dialog.showOpenDialog({ title: "Theta Vault のフォルダ", properties: ["openDirectory", "createDirectory"] });
      v = pick.canceled ? "" : pick.filePaths[0];
    }
    if (!v) v = path.join(app.getPath("documents"), "Theta Vault");
  }
  fs.mkdirSync(v, { recursive: true });
  settings.set({ vaultPath: v });
  return v;
}

// ---- images ---------------------------------------------------------------------------
let pdfWin = null, pdfReady = null;
const pdfJobs = new Map();
ipcMain.on("pdf-done", (_e, id, result) => {
  const job = pdfJobs.get(id);
  if (!job) return;
  pdfJobs.delete(id);
  result.error ? job.ng(new Error(result.error)) : job.ok(result.pages.map((b) => Buffer.from(b, "base64")));
});
function pdfWindow(base) {
  if (pdfReady) return pdfReady;
  pdfReady = new Promise((ok) => {
    pdfWin = new BrowserWindow({ show: false, webPreferences: { preload: path.join(__dirname, "assets", "pdf-preload.js"), contextIsolation: true, sandbox: false } });
    ipcMain.once("pdf-ready", () => ok(pdfWin));
    pdfWin.webContents.on("console-message", (_e, level, message) => level >= 2 && console.error("pdf:", message));
    pdfWin.loadURL(base + "/pdf/render.html?token=" + settings.get("token"));
  });
  return pdfReady;
}
function imaging(base) {
  return {
    toJpeg: async (buf, max) => {
      let img = nativeImage.createFromBuffer(buf);
      if (img.isEmpty()) throw new Error("この画像形式は読み込めません（JPEG・PNGをお使いください）");
      const { width, height } = img.getSize();
      const s = Math.min(1, max / Math.max(width, height));
      if (s < 1) img = img.resize({ width: Math.round(width * s), height: Math.round(height * s), quality: "best" });
      return img.toJPEG(85);
    },
    // rectOf(width, height) → { x, y, width, height } or null; the cut-out is downscaled to max.
    // refine(px, w, h, rect): corrects the rectangle with the picture's pixels (the photo's edges).
    crop: async (buf, rectOf, max, refine) => {
      const img = nativeImage.createFromBuffer(buf);
      const { width, height } = img.getSize();
      let r = rectOf(width, height);
      if (r && refine) {
        const bgra = img.toBitmap();
        r = refine((x, y) => {
          const i = (y * width + x) * 4;
          return [bgra[i + 2], bgra[i + 1], bgra[i]];
        }, width, height, r);
      }
      if (!r || r.width < 8 || r.height < 8) return null;
      let out = img.crop(r);
      const s = Math.min(1, max / Math.max(r.width, r.height));
      if (s < 1) out = out.resize({ width: Math.round(r.width * s), height: Math.round(r.height * s), quality: "best" });
      return out.toJPEG(92);
    },
    // The face photo as a square (top-centred), for the Google contact.
    square: async (buf, size) => {
      const img = nativeImage.createFromBuffer(Buffer.from(buf));
      const { width, height } = img.getSize();
      const s = Math.min(width, height);
      const out = img.crop({ x: Math.floor((width - s) / 2), y: height > width ? Math.floor((height - s) * 0.2) : 0, width: s, height: s });
      return out.resize({ width: size, height: size, quality: "best" }).toJPEG(90);
    },
    pdfPages: async (buf, max) => {
      const win = await pdfWindow(base);
      return new Promise((ok, ng) => {
        const id = crypto.randomUUID();
        pdfJobs.set(id, { ok, ng });
        win.webContents.send("pdf-job", { id, data: buf.toString("base64"), max });
      });
    },
  };
}

// ---- updates (GitHub Releases) ----------------------------------------------------------
// Windows downloads in the background and installs on restart. The Mac build is not signed by
// Apple, which Squirrel.Mac requires, so there the app only points to the new download.
const RELEASES = "https://github.com/kiwiman0706-beep/Theta.Mensetsu.Hatch/releases/latest";
let update = null, // { version, ready }
  onUpdate = () => {};
function setupUpdates() {
  if (!app.isPackaged || process.env.THETA_NO_UPDATE) return;
  const { autoUpdater } = require("electron-updater");
  autoUpdater.autoDownload = process.platform === "win32";
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on("update-available", (i) => {
    update = { version: i.version, ready: false };
    onUpdate();
    if (process.platform !== "win32" && Notification.isSupported())
      new Notification({ title: "Theta Mensetsu Hatch", body: `新しい版 ${i.version} があります。トレイのメニューからダウンロードできます。` }).show();
  });
  autoUpdater.on("update-downloaded", (i) => {
    update = { version: i.version, ready: true };
    onUpdate();
    if (Notification.isSupported()) new Notification({ title: "Theta Mensetsu Hatch", body: `新しい版 ${i.version} の準備ができました。次の起動時に更新されます。` }).show();
  });
  autoUpdater.on("error", (e) => console.warn("update check:", e.message));
  const check = () => autoUpdater.checkForUpdates().catch(() => {});
  setTimeout(check, 15000);
  setInterval(check, 6 * 3600 * 1000);
  return { check, install: () => (update?.ready ? ((app.isQuitting = true), autoUpdater.quitAndInstall()) : shell.openExternal(RELEASES)) };
}

// ---- app ------------------------------------------------------------------------------
// Applicants opened "in a new window" from the list are more windows of this same page (each
// one its own connection to the backend); other links leave the app.
function windowOpen({ url: u }) {
  if (url && u.startsWith(url.replace(/\/\?token=.*$/, "/"))) {
    return {
      action: "allow",
      overrideBrowserWindowOptions: { width: 920, height: 900, autoHideMenuBar: true, icon: path.join(__dirname, "assets", "icon.png"), webPreferences: { contextIsolation: true, sandbox: true } },
    };
  }
  if (/^(https?|mailto|tel):/i.test(u)) shell.openExternal(u);
  return { action: "deny" };
}
app.on("web-contents-created", (_e, wc) => wc.setWindowOpenHandler(windowOpen));

let win = null, tray = null, url = "", backendRef = null;
function show() {
  if (!win) {
    win = new BrowserWindow({ width: 1100, height: 820, title: "Theta Mensetsu Hatch", autoHideMenuBar: true, icon: path.join(__dirname, "assets", "icon.png"), webPreferences: { contextIsolation: true, sandbox: true } });
    win.loadURL(url);
    win.on("focus", () => backendRef && backendRef.handle("focus"));
    win.on("close", (e) => {
      if (!app.isQuitting) {
        e.preventDefault();
        win.hide(); // keep serving DeskHatch drawers from the tray
      }
    });
    win.webContents.setWindowOpenHandler(windowOpen);
  }
  win.show();
  win.focus();
}

app.on("second-instance", show);
app.on("activate", () => url && show()); // macOS: clicking the Dock icon
app.on("window-all-closed", (e) => e.preventDefault && e.preventDefault());

app.whenReady().then(async () => {
  if (!settings.get("token")) settings.set({ token: crypto.randomBytes(24).toString("hex") });
  // The camera (documents) and the microphone (interview recordings), for our own page only.
  const { session } = require("electron");
  const ours = (u) => /^http:\/\/(127\.0\.0\.1|localhost):\d+\//.test(u || "");
  session.defaultSession.setPermissionRequestHandler((wc, perm, cb, details) => cb(perm === "media" && ours(details.requestingUrl || wc.getURL())));
  session.defaultSession.setPermissionCheckHandler((wc, perm, origin) => perm === "media" && ours(origin + "/"));
  const vault = await resolveVault();
  const store = new VaultStore(vault, path.join(userData, "overlay.json")).load();
  store.watch();
  const port0 = settings.get("port", 47860);
  const services = {
    imaging: null,
    openFiles: async (single) => {
      const r = await dialog.showOpenDialog(win || undefined, {
        properties: single ? ["openFile"] : ["openFile", "multiSelections"],
        filters: [{ name: "画像・PDF", extensions: ["jpg", "jpeg", "png", "pdf", "webp", "gif", "bmp"] }],
      });
      return r.canceled ? [] : r.filePaths;
    },
    openFolder: async (title) => {
      const r = await dialog.showOpenDialog(win || undefined, { title, properties: ["openDirectory"] });
      return r.canceled ? "" : r.filePaths[0];
    },
    saveFile: async (name, text) => {
      const r = await dialog.showSaveDialog(win || undefined, { defaultPath: path.join(app.getPath("downloads"), name) });
      if (r.canceled || !r.filePath) return "";
      fs.writeFileSync(r.filePath, text);
      return r.filePath;
    },
    openExternal: (u) => shell.openExternal(u),
    openPath: (f) => shell.openPath(f),
    showInFolder: (f) => shell.showItemInFolder(f),
  };
  const updater = setupUpdates();
  services.installUpdate = () => (updater ? updater.install() : shell.openExternal(RELEASES));
  const google = (purpose) => {
    const id = settings.get("googleClientId", "");
    if (!id) return null;
    return new DesktopGoogle({ client: { id, secret: settings.get("googleClientSecret", "") }, persist: sealed(purpose === "contacts" ? "googleContactsEnc" : "googleSyncEnc"), purpose, openExternal: (u) => shell.openExternal(u) });
  };
  const backend = new Backend({ store, settings, secrets, services, google, kv, info: () => ({ update, version: app.getVersion(), vaultInCloud: inCloudFolder(vault) }) });
  backend.startSync();
  backendRef = backend;
  backend.on((msg) => {
    if (msg.type === "error" || msg.type === "report") console.error(msg.data);
    if (msg.type === "imported" && msg.data.errors.length) console.error(msg.data.errors.join("\n"));
    if (msg.type === "chooseVault") {
      settings.set({ vaultPath: msg.data });
      app.relaunch();
      app.isQuitting = true;
      app.quit();
    }
  });
  const pdfDir = path.join(__dirname, "node_modules", "pdfjs-dist");
  const listen = (port) =>
    new Promise((ok, ng) => {
      const s = server.start({ backend, store, uiDir: fs.existsSync(path.join(__dirname, "ui")) ? path.join(__dirname, "ui") : path.join(__dirname, "..", "ui"), pdfDir, port, token: settings.get("token"), onReady: (p) => ok(p) });
      s.on("error", ng);
    });
  let port;
  try {
    port = await listen(port0);
  } catch {
    port = await listen(0); // the usual port is taken: any free one (DeskHatch URL changes)
  }
  if (port !== port0) console.warn(`port ${port0} is in use; serving on ${port} for this run`);
  const base = `http://127.0.0.1:${port}`;
  services.imaging = imaging(base);
  url = `${base}/?token=${settings.get("token")}`;

  const icon = nativeImage.createFromPath(path.join(__dirname, "assets", "tray.png"));
  tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon);
  tray.setToolTip("Theta Mensetsu Hatch");
  const menu = () =>
    tray.setContextMenu(
      Menu.buildFromTemplate([
        ...(update
          ? [{ label: update.ready ? `再起動して ${update.version} に更新` : `新しい版 ${update.version} をダウンロード`, click: () => services.installUpdate() }, { type: "separator" }]
          : []),
        { label: "開く", click: show },
        { label: "DeskHatch用のURLをコピー", click: () => clipboard.writeText(url) },
        { label: "Theta Vault フォルダを開く", click: () => shell.openPath(vault) },
        { type: "separator" },
        { label: "ログイン時に起動", type: "checkbox", checked: app.getLoginItemSettings().openAtLogin, click: (m) => app.setLoginItemSettings({ openAtLogin: m.checked, args: ["--hidden"] }) },
        ...(updater ? [{ label: `更新を確認（${app.getVersion()}）`, click: () => updater.check() }] : []),
        { label: "終了", click: () => ((app.isQuitting = true), app.quit()) },
      ]),
    );
  menu();
  onUpdate = () => {
    menu();
    backend.refresh();
  };
  tray.on("click", show);
  console.log("serving " + base);
  if (!process.argv.includes("--hidden")) show();
});

app.on("before-quit", (e) => {
  app.isQuitting = true;
  // Changes not yet on Drive go up before the app closes (at most 15 seconds).
  if (backendRef && backendRef.syncOn() && !backendRef.lastFlush) {
    e.preventDefault();
    backendRef.lastFlush = true;
    backendRef.stopSync();
    Promise.race([backendRef.sync(false), new Promise((ok) => setTimeout(ok, 15000))]).finally(() => app.quit());
  }
});
