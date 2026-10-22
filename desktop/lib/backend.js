// Answers the shared UI's Native.call actions (ui/app.js) against a store: the Vault folder on the
// PC (vault-store.js) or IndexedDB in the browser (web/). Platform services (dialogs, images,
// secrets, browser, Google sign-in) are injected, so this also runs under plain Node in tests.
"use strict";
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const model = require("./model");
const importer = require("./importer");
const gemini = require("./gemini");
const contacts = require("./contacts");
const V = require("./vault-codec");
const { DriveVault } = require("./drive-vault");

// Features the PC offers; the UI hides the rest (docs/THETA_HATCH_SPEC.md §4.1).
const CAPS = ["pick", "folder", "gemini", "vault", "export", "attach", "contacts", "sync", "google", "camera", "record", "windows", "commute"];
const SYNC_EVERY = 3 * 60 * 1000;

class Backend {
  // google(purpose) → a GoogleApi ("sync" or "contacts") or null; kv: { get, put } for the sync index.
  constructor({ store, settings, secrets, services, fetchImpl, info, platform = "desktop", caps = CAPS, google, kv }) {
    this.info = info || (() => ({}));
    this.platform = platform;
    this.caps = caps;
    this.store = store;
    this.settings = settings; // { get(k, d), set(obj) }
    this.secrets = secrets; // { get(), set(v) }
    this.svc = services; // { imaging, openFiles, openFolder, saveFile, openExternal, openPath, showInFolder }
    this.fetch = fetchImpl || ((...a) => fetch(...a));
    this.makeGoogle = google || (() => null);
    this.kv = kv;
    this.listeners = new Set();
    this.processing = "";
    this.running = false;
    this.syncing = null;
    this.syncTimer = null;
    this.syncState = "";
    this.resetGoogle();
    store.on(() => {
      this.refresh();
      this.scheduleSync(5000);
    });
  }

  on(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  event(type, data) {
    for (const fn of this.listeners) fn({ type, data });
  }
  toast(t) {
    this.event("toast", t);
  }

  // ---- Google accounts ------------------------------------------------------------------
  resetGoogle() {
    this.gSync = this.makeGoogle("sync");
    this.gContacts = this.settings.get("contactsSeparate", false) ? this.makeGoogle("contacts") : this.gSync;
    this.groupCache = null;
  }
  account(purpose) {
    return purpose === "contacts" ? this.gContacts : this.gSync;
  }
  // The PC syncs through the Drive API ("drive") or leaves it to a sync tool on the folder ("folder").
  syncMode() {
    // A new PC syncs directly, unless its Vault already sits in a sync tool's folder.
    return this.platform === "web" ? "drive" : this.settings.get("syncMode", this.info().vaultInCloud ? "folder" : "drive");
  }
  syncOn() {
    return this.syncMode() === "drive" && this.settings.get("syncEnabled", false) && !!this.gSync;
  }
  categories() {
    const c = this.settings.get("categories", null);
    return Array.isArray(c) && c.length ? c : model.CATEGORIES;
  }
  contactOptions() {
    const s = this.settings;
    return {
      label: String(s.get("contactLabel", "面接応募者") || "").trim(),
      byCategory: s.get("contactLabelByCategory", true),
      suffix: s.get("contactSuffix", true),
      org: String(s.get("contactOrg", "") || "").trim(),
    };
  }

  state() {
    const s = this.settings;
    const people = this.store.people();
    const acc = (g) => (g ? { email: g.email || "", signedIn: g.signedIn() } : null);
    return {
      platform: this.platform,
      caps: this.caps,
      people,
      categories: this.categories(),
      keySet: !!this.secrets.get(),
      model: s.get("model", "gemini-2.5-flash"),
      format: s.get("format", "legacy"),
      autoRecognize: s.get("autoRecognize", true),
      folder: s.get("folder", ""),
      vaultPath: this.store.root,
      vaultWarnings: this.store.warnings,
      processing: this.processing,
      lastReport: s.get("lastReport", ""),
      // Google
      googleClientId: s.get("googleClientId", ""),
      googleClientSecretSet: !!s.get("googleClientSecret", ""),
      googleSync: acc(this.gSync),
      googleContacts: acc(this.gContacts),
      contactsSeparate: s.get("contactsSeparate", false),
      googleNeeded: this.googleNeeded(people),
      // Sync
      syncMode: this.syncMode(),
      syncEnabled: s.get("syncEnabled", false),
      syncing: this.syncState,
      lastSync: s.get("lastSync", 0),
      syncError: s.get("syncError", ""),
      // Contacts
      autoContact: s.get("autoContact", false),
      contactPhoto: s.get("contactPhoto", "portrait"),
      contactLabel: this.contactOptions().label,
      contactLabelByCategory: this.contactOptions().byCategory,
      contactSuffix: this.contactOptions().suffix,
      contactOrg: this.contactOptions().org,
      workplace: s.get("workplace", ""),
      ...this.info(), // app version, a pending update, where the vault folder is (main.js)
    };
  }
  googleNeeded(people) {
    const pending = people.some((p) => p.contactPending);
    const sync = this.syncOn() && !this.gSync.signedIn();
    const cont = pending && this.gContacts && !this.gContacts.signedIn();
    return !!(this.settings.get("googleClientId", "") && (sync || cont));
  }
  refresh() {
    this.event("state", this.state());
  }

  async handle(action, q = {}) {
    try {
      await this.dispatch(action, q);
    } catch (e) {
      this.event("error", e.message || String(e));
    }
  }

  // ---- actions --------------------------------------------------------------------------
  async dispatch(action, q) {
    const id = q.id || "";
    const st = this.store;
    switch (action) {
      case "boot":
        this.refresh();
        return this.scheduleSync(1500);
      case "opened":
        return;
      case "focus": // the window came back to the front: catch up with other PCs
        if (Date.now() - this.settings.get("lastSync", 0) > 30000) this.scheduleSync(300);
        return;
      case "new": {
        const p = model.empty();
        st.put(p);
        return this.event("open", p.id);
      }
      case "save": {
        const p = model.edit(st.person(id), q.person || {});
        delete p.queueError;
        st.put(p);
        this.event("saved", id);
        if (q.thenContact) await this.registerContact(st.person(id));
        else await this.contactChanged(id);
        return;
      }
      case "set": {
        // A quick change from the detail screen (stage, rating, interview time).
        const p = model.edit(st.person(id), q.fields || {});
        st.put(p);
        return this.contactChanged(id);
      }
      case "delete": {
        const p = st.person(id);
        if (q.withContact && p.contactId) await this.removeContact(p);
        st.remove(id);
        return this.event("home", "");
      }
      case "note": {
        const p = st.person(id);
        p.notes.push({ id: crypto.randomUUID(), time: Date.now(), text: String(q.text) });
        return st.put(p);
      }
      case "editNote": {
        const p = st.person(id);
        for (const n of p.notes) if (n.id === q.noteId) n.text = String(q.text);
        return st.put(p);
      }
      case "removeItem": {
        if (!["notes", "pages", "documents", "recordings", "evaluations"].includes(q.key)) throw new Error("不正な項目");
        const p = st.person(id);
        const list = p[q.key] || [];
        if (q.index >= 0 && q.index < list.length) list.splice(q.index, 1);
        p[q.key] = list;
        if (q.key === "pages" && !p.pages.length) {
          p.status = "new";
          delete p.suggestion;
        }
        return st.put(p);
      }
      case "reorder": {
        const p = st.person(id);
        const a = p.pages;
        if (q.from >= 0 && q.from < a.length && q.to >= 0 && q.to < a.length) [a[q.from], a[q.to]] = [a[q.to], a[q.from]];
        return st.put(p);
      }
      case "merge": {
        const t = model.merge(st.person(id), st.person(q.sourceId));
        st.put(t);
        st.remove(q.sourceId);
        return q.stay ? undefined : this.event("open", id);
      }
      case "mergeBatch": {
        const gone = new Map();
        let done = 0;
        for (let [t, src] of q.pairs || []) {
          while (gone.has(t)) t = gone.get(t);
          while (gone.has(src)) src = gone.get(src);
          if (t === src) continue;
          st.put(model.merge(st.person(t), st.person(src)));
          st.remove(src);
          gone.set(src, t);
          done++;
        }
        return this.toast(done + "件をまとめました");
      }
      case "notDuplicate": {
        for (const [a, b] of [[id, q.other], [q.other, id]]) {
          const p = st.person(a);
          p.notDuplicate = [...new Set([...(p.notDuplicate || []), b])];
          st.put(p);
        }
        return;
      }
      case "evalSave": {
        // A staff evaluation after hiring (or any assessment worth keeping on file).
        const e = q.evaluation || {};
        const p = st.person(id);
        p.evaluations = p.evaluations || [];
        const clean = { id: e.id || crypto.randomUUID() };
        for (const k of ["date", "period", "evaluator", "score", "text"]) clean[k] = String(e[k] || "").trim();
        if (!clean.date) clean.date = model.today(Date.now());
        const i = p.evaluations.findIndex((x) => x.id === clean.id);
        if (i >= 0) p.evaluations[i] = clean;
        else p.evaluations.push(clean);
        return st.put(p);
      }
      case "docEdit": {
        const p = st.person(id);
        const d = (p.documents || []).find((x) => x.id === q.did);
        if (d) {
          if ("kind" in q) d.kind = String(q.kind || "").trim();
          if ("title" in q) d.title = String(q.title || "").trim();
          if (/^\d{4}-\d{2}-\d{2}$/.test(q.date || "")) d.date = q.date;
        }
        return st.put(p);
      }
      case "recEdit": {
        const p = st.person(id);
        const r = (p.recordings || []).find((x) => x.id === q.rid);
        if (r) for (const k of ["title", "transcript", "summary"]) if (k in q) r[k] = String(q[k] || "");
        return st.put(p);
      }
      case "recTranscribe":
        this.needKey();
        return this.transcribe(id, q.rid);
      case "commute":
        this.needKey();
        return this.estimateCommute(id);
      case "recognize":
        this.needKey();
        this.enqueue([id], "recognize");
        return this.toast("読み取り中（バックグラウンド）。終わると自動で反映します");
      case "recognizeAll": {
        this.needKey();
        const ids = st.people().filter((p) => p.status === "new" && p.pages.length && !p.queue).map((p) => p.id);
        this.enqueue(ids, "recognize");
        return this.toast(ids.length + "件をバックグラウンドで読み取ります");
      }
      case "photoOne":
        this.needKey();
        this.enqueue([id], "photo");
        return this.toast("履歴書から顔写真を切り出しています");
      case "reread": {
        this.needKey();
        this.event("busy", "Geminiで履歴書を読み取り中");
        try {
          const r = await this.read(st.person(id));
          const p = st.person(id);
          p.suggestion = r;
          p.status = "review";
          st.put(p, false);
          this.refresh();
          this.event("review", id);
        } finally {
          this.event("busy", "");
        }
        return;
      }
      case "discardRecognition": {
        const p = st.person(id);
        delete p.suggestion;
        return st.put(p, false);
      }
      case "settings":
        return this.saveSettings(q);
      case "models":
        this.needKey();
        return this.event("models", await gemini.models(this.secrets.get(), this.fetch));
      case "export": {
        const stamp = model.today(Date.now()).replace(/-/g, "");
        const list = q.ids ? st.people().filter((p) => q.ids.includes(p.id)) : st.people();
        const file = await this.svc.saveFile(`mensetsu-${stamp}.csv`, model.csv(list));
        if (file) this.toast("書き出しました");
        return;
      }
      case "quickScan":
      case "scan":
      case "pick": {
        // The action tells a phone browser whether to open the camera or the photo library.
        const files = await this.svc.openFiles(false, action);
        if (files && files.length) await this.importFiles(files, q);
        return;
      }
      case "folder":
      case "rescan": {
        const dir = action === "rescan" ? this.settings.get("folder", "") : await this.svc.openFolder("取り込むフォルダ（履歴書のPDF・画像を保存した場所）");
        if (!dir) return;
        this.settings.set({ folder: dir });
        const files = [];
        const walk = (d, depth) => {
          if (depth > 8) return;
          for (const e of fs.readdirSync(d, { withFileTypes: true })) {
            const f = path.join(d, e.name);
            if (e.isDirectory()) walk(f, depth + 1);
            else if (/\.pdf$/i.test(e.name) || importer.IMAGE.test(e.name)) files.push(f);
          }
        };
        walk(dir, 0);
        if (!files.length) throw new Error("画像・PDFが見つかりませんでした");
        return this.importFiles(files.slice(0, 200), q);
      }
      case "asset": {
        const files = await this.svc.openFiles(true);
        if (!files || !files.length) return;
        const name = crypto.randomUUID() + ".jpg";
        const src = typeof files[0] === "string" ? fs.readFileSync(files[0]) : await files[0].read();
        await st.writeMedia(name, await this.svc.imaging.toJpeg(src, 900));
        const p = st.person(id);
        p.portrait = name;
        delete p.portraitSource; // picked by hand: the automatic cut-out never replaces it
        st.put(p);
        return this.contactChanged(id, true);
      }
      case "clearAsset": {
        const p = st.person(id);
        delete p.portrait;
        delete p.portraitSource;
        p.photoTried = true;
        return st.put(p);
      }
      case "openUrl": {
        const u = String(q.url || "");
        if (!/^(https?|tel|mailto):/i.test(u)) throw new Error("このリンクは開けません");
        return this.svc.openExternal(u);
      }
      case "playMedia":
      case "openMedia":
        return this.svc.openPath(st.mediaFile(q.file));
      case "shareImage":
        return this.svc.showInFolder(st.mediaFile(st.person(id).pages[q.index].file));
      case "installUpdate":
        return this.svc.installUpdate && this.svc.installUpdate();
      case "chooseVault": {
        const dir = await this.svc.openFolder("Theta Vault のフォルダ");
        if (dir) this.event("chooseVault", dir);
        return;
      }
      // ---- Google ----
      case "googleSignIn": {
        const g = this.account(q.purpose === "contacts" ? "contacts" : "sync");
        if (!g) throw new Error("先にGoogle CloudのOAuthクライアントIDを設定してください（メニュー →「Googleアカウント」）");
        this.event("busy", "ブラウザでGoogleアカウントを選んでください");
        let email;
        try {
          email = await g.signIn({ hint: q.hint || "" });
        } finally {
          this.event("busy", "");
        }
        this.groupCache = null;
        this.refresh();
        this.toast("Googleにログインしました：" + email);
        await this.afterSignIn();
        return this.scheduleSync(500);
      }
      case "googleSignOut": {
        const g = this.account(q.purpose === "contacts" ? "contacts" : "sync");
        if (g) await g.signOut();
        this.groupCache = null;
        this.refresh();
        return this.toast("Googleからログアウトしました");
      }
      case "syncNow":
        if (this.syncMode() !== "drive") return this.toast("このPCはフォルダ同期（Googleドライブ パソコン版など）を使っています");
        if (!this.gSync || !this.gSync.signedIn()) throw new Error("先にメニューの「Googleアカウント」でログインしてください");
        this.settings.set({ syncEnabled: true });
        return this.sync(true);
      case "syncStop":
        this.settings.set({ syncEnabled: false, syncError: "" });
        this.refresh();
        return this.toast("同期をやめました。Googleドライブのデータはそのまま残ります");
      case "contacts": {
        await this.registerContact(st.person(id), true);
        this.refresh();
        return this.toast("Google連絡先に登録しました");
      }
      case "unlinkContact": {
        const p = st.person(id);
        if (p.contactId) await this.removeContact(p);
        p.contactUnlinked = true;
        st.put(p);
        return this.toast("Google連絡先から削除しました");
      }
      case "viewContact": {
        const p = st.person(id);
        return this.svc.openExternal("https://contacts.google.com/" + String(p.contactId || "").replace(/^people\//, "person/"));
      }
      case "contactsRelabel": {
        // After changing the label settings: every registered applicant gets the new labels.
        const list = st.people().filter((p) => p.contactId);
        let n = 0;
        for (const p of list) {
          this.event("busy", `連絡先を更新中 ${++n} / ${list.length}`);
          try {
            await this.updateContact(st.person(p.id));
          } catch (e) {
            if (e.needLogin) throw e;
          } finally {
            this.event("busy", "");
          }
        }
        return this.toast(`${list.length}件の連絡先を更新しました`);
      }
      case "contactsCleanup": {
        // Selection over: the contacts of applicants not hired are removed (the records stay).
        const stages = Array.isArray(q.stages) && q.stages.length ? q.stages : ["rejected", "declined"];
        const list = st.people().filter((p) => p.contactId && stages.includes(p.stage));
        let n = 0;
        for (const p of list) {
          this.event("busy", `連絡先を削除中 ${++n} / ${list.length}`);
          try {
            const x = st.person(p.id);
            await this.removeContact(x);
            x.contactUnlinked = true;
            st.put(x);
          } finally {
            this.event("busy", "");
          }
        }
        return this.toast(`${list.length}件の連絡先を削除しました（応募者の記録は残ります）`);
      }
      default:
        return this.toast("この操作はこの版では使えません");
    }
  }

  saveSettings(q) {
    if (q.clearKey) this.secrets.set("");
    else if (String(q.key || "").trim()) this.secrets.set(String(q.key).trim());
    const set = {};
    if ("model" in q) {
      const m = String(q.model || "").trim().replace("models/", "");
      if (!/^[A-Za-z0-9._-]+$/.test(m)) throw new Error("モデル名を確認してください");
      set.model = m;
      set.format = q.format || "legacy";
    }
    for (const k of ["autoRecognize", "autoContact", "contactLabelByCategory", "contactSuffix", "contactsSeparate"]) if (k in q) set[k] = !!q[k];
    if ("contactPhoto" in q) set.contactPhoto = q.contactPhoto === "none" ? "none" : "portrait";
    if ("contactLabel" in q) set.contactLabel = String(q.contactLabel || "").trim().slice(0, 60);
    if ("contactOrg" in q) set.contactOrg = String(q.contactOrg || "").trim().slice(0, 80);
    if ("workplace" in q) set.workplace = String(q.workplace || "").trim().slice(0, 200);
    if ("categories" in q) {
      const list = [...new Set(String(q.categories || "").split(/[\n,、]/).map((x) => x.trim()).filter(Boolean))].slice(0, 60);
      set.categories = list.length ? list : null;
    }
    if ("syncMode" in q) set.syncMode = q.syncMode === "drive" ? "drive" : "folder";
    if ("googleClientId" in q) {
      const v = String(q.googleClientId || "").trim();
      if (v && !/^[0-9]+-[a-z0-9]+\.apps\.googleusercontent\.com$/.test(v)) throw new Error("OAuthクライアントIDの形式が違います（…apps.googleusercontent.com）");
      set.googleClientId = v;
    }
    if ("googleClientSecret" in q && String(q.googleClientSecret || "").trim()) set.googleClientSecret = String(q.googleClientSecret).trim();
    this.settings.set(set);
    if ("googleClientId" in q || "googleClientSecret" in q || "contactsSeparate" in q) this.resetGoogle();
    this.refresh();
    if ("syncMode" in q && set.syncMode === "drive" && this.gSync && this.gSync.signedIn()) this.scheduleSync(500);
    return this.toast("設定を保存しました");
  }

  needKey() {
    if (!this.secrets.get()) throw new Error("先にメニューの「Gemini APIキー・モデル」でAPIキーを設定してください");
  }

  // ---- importing ----------------------------------------------------------------------
  async importFiles(files, q = {}) {
    this.event("busy", "応募書類を取り込み中");
    let r;
    try {
      r = await importer.run(this.store, this.svc.imaging, files, q.mode || "file", q.attachTo ? "" : q.id || "", (t) => this.event("busy", t));
    } finally {
      this.event("busy", "");
    }
    return this.afterImport(r, q);
  }

  afterImport(r, q) {
    const st = this.store;
    if (q.attachTo && !q.id) {
      for (const tid of r.ids) this.attach(tid, q.attachTo, q.title, q.kind);
      this.event("open", q.attachTo);
      return this.toast("書類を添付しました");
    }
    if (q.category && !q.id)
      for (const tid of r.ids) {
        const p = st.person(tid);
        p.category = String(q.category);
        st.put(p);
      }
    if (!q.id && r.ids.length && this.settings.get("autoRecognize", true) && this.secrets.get()) {
      this.enqueue(r.ids, "recognize");
      this.event("queued", r);
    } else this.event("imported", r);
  }

  attach(tempId, targetId, title, kind) {
    const st = this.store;
    const temp = st.person(tempId), p = st.person(targetId);
    const files = temp.pages.map((x) => ({ file: x.file, name: x.name || x.file }));
    for (const s of temp.sources || []) if (s.file.endsWith(".pdf")) files.push({ file: s.file, name: s.name || s.file, original: true });
    p.documents = p.documents || [];
    p.documents.push({ id: crypto.randomUUID(), date: model.today(Date.now()), kind: kind || "", title: title || "", files });
    st.put(p);
    st.remove(tempId);
    st.forgetTomb && st.forgetTomb(tempId); // never synced: nothing to delete elsewhere
  }

  // Files from the page itself: the camera (pictures of documents) and the microphone (an
  // interview recording). files: [{ name, read() }]
  async receive(files, q = {}) {
    if (q.as !== "recording") return this.importFiles(files, q);
    const p = this.store.person(q.id);
    const bytes = await files[0].read();
    const ext = /\.(webm|ogg|m4a|mp3|wav)$/i.exec(files[0].name)?.[1]?.toLowerCase() || "webm";
    const name = crypto.randomUUID() + "." + ext;
    await this.store.writeMedia(name, bytes);
    p.recordings = p.recordings || [];
    const rec = { id: crypto.randomUUID(), file: name, time: Date.now(), seconds: Math.max(0, q.seconds | 0), title: String(q.title || "").trim() };
    p.recordings.push(rec);
    this.store.put(p);
    this.toast("録音を保存しました");
    if (q.transcribe && this.secrets.get()) await this.transcribe(p.id, rec.id);
  }

  async transcribe(id, rid) {
    const p = this.store.person(id);
    const r = (p.recordings || []).find((x) => x.id === rid);
    if (!r) throw new Error("録音が見つかりません");
    const mime = { webm: "audio/webm", ogg: "audio/ogg", m4a: "audio/mp4", mp3: "audio/mp3", wav: "audio/wav" }[r.file.split(".").pop()] || "audio/webm";
    this.event("busy", "Geminiで文字起こし中（録音の長さによっては数分かかります）");
    let out;
    try {
      out = await gemini.transcribe(this.cfg(), await this.store.readMedia(r.file), mime, this.fetch);
    } finally {
      this.event("busy", "");
    }
    const x = this.store.person(id);
    const y = (x.recordings || []).find((z) => z.id === rid);
    if (!y) return;
    y.transcript = out.transcript;
    y.summary = out.summary;
    this.store.put(x);
    this.toast("文字起こしができました");
  }

  // Rough commute from the applicant's address to the workplace (Gemini + Google Search).
  async estimateCommute(id) {
    const to = this.settings.get("workplace", "");
    if (!to) throw new Error("先にメニューの「勤務先の住所」を設定してください");
    const p = this.store.person(id);
    const from = String(p.address || "").split("\n")[0].trim();
    if (!from) throw new Error("住所が入っていません");
    this.event("busy", "通勤経路を調べています");
    let r;
    try {
      r = await gemini.commute(this.cfg(), from, to, this.fetch);
    } finally {
      this.event("busy", "");
    }
    const yen = (v) => (String(v || "").replace(/[^0-9]/g, "") ? Number(String(v).replace(/[^0-9]/g, "")).toLocaleString("ja-JP") + "円" : "");
    const parts = [];
    if (r.minutes) parts.push(`公共交通 約${String(r.minutes).replace(/[^0-9]/g, "")}分`);
    if (r.route) parts.push(String(r.route));
    if (r.carMinutes || r.carKm) parts.push(`車 ${r.carKm ? "約" + String(r.carKm).replace(/[^0-9.]/g, "") + "km " : ""}${r.carMinutes ? "約" + String(r.carMinutes).replace(/[^0-9]/g, "") + "分" : ""}`.trim());
    const cost = [r.pass ? `定期 1か月 約${yen(r.pass)}` : "", r.fare ? `片道 ${yen(r.fare)}` : ""].filter(Boolean).join("・");
    const x = this.store.person(id);
    const stamp = `（概算 ${model.today(Date.now())}）`;
    x.commute = parts.join(" ・ ") + (r.note ? `\n${r.note}` : "") + (parts.length ? " " + stamp : "");
    if (cost) x.commuteCost = cost + " " + stamp;
    this.store.put(x);
    this.toast("通勤を概算しました（乗換案内で確認してください）");
  }

  // ---- background queue ------------------------------------------------------------------
  enqueue(ids, step) {
    for (const id of ids) {
      const p = this.store.person(id);
      p.queue = step;
      delete p.queueError;
      this.store.put(p, false);
    }
    this.work();
  }

  cfg() {
    const s = this.settings;
    return { key: this.secrets.get(), model: s.get("model", "gemini-2.5-flash"), format: s.get("format", "legacy") };
  }

  async read(p) {
    const images = [];
    for (const pg of p.pages.slice(0, 20)) images.push(await this.svc.imaging.toJpeg(await this.store.readMedia(pg.file), 2000));
    return gemini.generate(this.cfg(), "resume", images, this.fetch, { categories: this.categories().join("、") });
  }

  async work() {
    if (this.running) return;
    this.running = true;
    let done = 0, failed = 0;
    const errors = [];
    try {
      for (;;) {
        const next = this.store.people().find((p) => p.queue);
        if (!next) break;
        const left = this.store.people().filter((p) => p.queue).length;
        this.processing = `${next.queue === "photo" ? "顔写真を切り出し中" : "履歴書を読み取り中"}（残り${left}件）`;
        this.refresh();
        try {
          if (next.queue === "photo") await this.cutPhoto(next.id, null);
          else {
            const r = await this.read(next);
            const p = model.applyResult(this.store.person(next.id), r);
            delete p.queue;
            this.store.put(p);
            await this.cutPhoto(next.id, r.photoBox).catch(() => {});
            await this.afterRecognized(this.store.person(next.id)).catch((e) => errors.push(`${p.name || "応募者"}（連絡先）: ${e.message}`));
          }
          done++;
        } catch (e) {
          const m = String(e.message);
          if (/HTTP (429|401|403)|APIキー/.test(m)) {
            errors.push(m + "\n残りは後で「未読み取りをまとめて読み取る」から再開できます");
            break;
          }
          failed++;
          errors.push(`${next.name || "応募者"}: ${m}`);
          try {
            const p = this.store.person(next.id);
            delete p.queue;
            p.queueError = m;
            this.store.put(p, false);
          } catch {}
        }
      }
    } finally {
      this.running = false;
      this.processing = "";
      if (done + failed) {
        const text = `処理 ${done}件${failed ? ` / 失敗 ${failed}件` : ""}` + (errors.length ? "\n" + errors.join("\n") : "");
        this.settings.set({ lastReport: text });
        if (errors.length) this.event("report", text);
        else this.toast(text);
      } else if (errors.length) this.event("report", errors.join("\n"));
      this.refresh();
    }
  }

  // The ID photo on the first page becomes the thumbnail (and the contact's picture). The box
  // comes with the reading; "photo" asks Gemini again. A picture chosen by hand stays.
  async cutPhoto(id, box) {
    const st = this.store, im = this.svc.imaging;
    const p = st.person(id);
    const ask = box === null;
    if (ask) {
      delete p.queue;
      st.put(p, false);
    }
    if (!(p.pages || []).length || (p.portrait && !p.portraitSource)) return false;
    const front = await im.toJpeg(await st.readMedia(p.pages[0].file), 2000);
    if (ask) box = (await gemini.generate(this.cfg(), "photo", [front], this.fetch)).box;
    const jpeg = box ? await im.crop(front, (w, h) => model.photoRect(box, w, h), 600, model.trimPhotoRect) : null;
    const x = st.person(id);
    x.photoTried = true;
    if (!jpeg) {
      st.put(x, false);
      if (ask) this.toast("顔写真が見つかりませんでした");
      return false;
    }
    const name = crypto.randomUUID() + ".jpg";
    await st.writeMedia(name, jpeg);
    x.portrait = name;
    x.portraitSource = "resume";
    st.put(x);
    return true;
  }

  // ---- Google contacts --------------------------------------------------------------------
  // Read in the background: registered at once when signed in, else when next signed in.
  async afterRecognized(p) {
    if (!this.settings.get("autoContact", false) || !this.gContacts || !String(p.name || "").trim()) return;
    if (p.contactRegistered || p.contactUnlinked || p.contactId) return;
    if (!this.gContacts.signedIn()) {
      p.contactPending = true;
      return this.store.put(p, false);
    }
    await this.registerContact(p);
  }

  async afterSignIn() {
    for (const p of this.store.people().filter((x) => x.contactPending)) {
      try {
        await this.registerContact(this.store.person(p.id));
      } catch (e) {
        this.event("report", `${p.name}: ${e.message}`);
        if (e.needLogin) break;
      }
    }
  }

  // After an edit: the Google contact follows (later, if not signed in now).
  async contactChanged(id, photo = false) {
    const p = this.store.person(id);
    if (!p.contactId) return;
    if (!this.gContacts || !this.gContacts.signedIn()) {
      p.contactPending = true;
      return this.store.put(p, false);
    }
    await this.updateContact(p, photo);
    this.toast("Google連絡先にも反映しました");
  }

  contactApi() {
    if (!this.gContacts) throw new Error("先にメニューの「Googleアカウント」でOAuthクライアントIDを設定してください");
    return this.gContacts.people();
  }

  async registerContact(p, explicit = false) {
    if (!this.gContacts || !this.gContacts.signedIn()) {
      if (!explicit) {
        p.contactPending = true;
        return this.store.put(p, false);
      }
      throw new Error("先にメニューの「Googleアカウント」で、連絡先を登録するアカウントにログインしてください");
    }
    // Registered before in this same account: update it instead of adding a second one.
    if (p.contactId && (!p.contactAccount || p.contactAccount === this.gContacts.email)) return this.updateContact(p, true);
    const api = this.contactApi();
    const r = await api.create(contacts.body(p, this.contactOptions()));
    const x = this.store.person(p.id);
    x.contactId = r.resourceName;
    x.contactAccount = this.gContacts.email;
    x.contactRegistered = true;
    delete x.contactPending;
    delete x.contactUnlinked;
    this.store.put(x);
    await this.labelContact(x, r.memberships || []);
    await this.contactPhoto(x).catch(() => {});
  }

  async updateContact(p, photo = false) {
    const api = this.contactApi();
    try {
      await api.update(p.contactId, contacts.body(p, this.contactOptions()));
    } catch (e) {
      if (e.status !== 404) throw e;
      // Deleted in Google Contacts meanwhile: forget it (registering again makes a new one).
      const x = this.store.person(p.id);
      delete x.contactId;
      delete x.contactAccount;
      delete x.contactRegistered;
      delete x.contactPending;
      this.store.put(x);
      throw new Error("Google連絡先から削除されていたため、つながりを外しました。必要なら登録し直してください");
    }
    const cur = await api.get(p.contactId).catch(() => ({}));
    await this.labelContact(p, cur.memberships || []);
    if (photo) await this.contactPhoto(p).catch(() => {});
    if (p.contactPending) {
      const x = this.store.person(p.id);
      delete x.contactPending;
      this.store.put(x, false);
    }
  }

  // Labels keep applicants apart from business-card and everyday contacts: "面接応募者" and,
  // per job category, "面接応募者・看護師". Labels of ours that no longer apply are taken off.
  async labelContact(p, memberships) {
    const o = this.contactOptions();
    if (!o.label) return;
    const api = this.contactApi();
    const want = contacts.labels(p, o);
    const groups = await this.groups(api);
    for (const name of want)
      if (!groups.has(name)) {
        const g = await api.createGroup(name);
        groups.set(name, g.resourceName);
      }
    const have = new Set(memberships.map((m) => m.contactGroupMembership?.contactGroupResourceName).filter(Boolean));
    const ours = [...groups].filter(([name]) => contacts.isOurs(name, o));
    for (const [name, res] of ours) {
      const should = want.includes(name);
      if (should && !have.has(res)) await api.modifyGroup(res, [p.contactId], []);
      if (!should && have.has(res)) await api.modifyGroup(res, [], [p.contactId]);
    }
  }

  async groups(api) {
    const acct = this.gContacts.email;
    if (!this.groupCache || this.groupCache.acct !== acct)
      this.groupCache = { acct, map: new Map((await api.groups()).filter((g) => g.groupType === "USER_CONTACT_GROUP").map((g) => [g.name, g.resourceName])) };
    return this.groupCache.map;
  }

  async contactPhoto(p) {
    if (this.settings.get("contactPhoto", "portrait") !== "portrait" || !p.portrait || !this.svc.imaging.square) return;
    const jpeg = await this.svc.imaging.square(await this.store.readMedia(p.portrait), 720);
    await this.contactApi().photo(p.contactId, Buffer.from(jpeg).toString("base64"));
  }

  async removeContact(p) {
    if (!this.gContacts || !this.gContacts.signedIn()) throw new Error("連絡先を削除するには、先にGoogleアカウントにログインしてください");
    if (p.contactAccount && this.gContacts.email && p.contactAccount !== this.gContacts.email)
      throw new Error(`この連絡先は ${p.contactAccount} に登録されています。そのアカウントでログインしてから削除してください`);
    await this.contactApi()
      .remove(p.contactId)
      .catch((e) => {
        if (e.status !== 404) throw e;
      });
    for (const k of ["contactId", "contactAccount", "contactRegistered", "contactPending"]) delete p[k];
  }

  // ---- Theta Vault on Google Drive ----------------------------------------------------------
  // The PC syncs right after a change, every few minutes and when its window comes to the front,
  // so whichever PC is used next already has the latest.
  startSync() {
    clearInterval(this.syncEvery);
    this.syncEvery = setInterval(() => this.scheduleSync(0), SYNC_EVERY);
    this.scheduleSync(1500);
  }
  stopSync() {
    clearInterval(this.syncEvery);
    clearTimeout(this.syncTimer);
  }

  scheduleSync(delay = 5000) {
    if (!this.syncOn() || !this.gSync.signedIn() || this.syncing) return;
    clearTimeout(this.syncTimer);
    this.syncTimer = setTimeout(() => this.sync(false), delay);
  }

  async sync(shown) {
    if (this.syncing) return this.syncing;
    this.syncing = (async () => {
      this.syncState = "同期中";
      this.refresh();
      let again = false;
      try {
        if (!this.gSync.email) await this.gSync.whoami();
        const vault = new DriveVault(this.store, this.kv, this.gSync.drive(), this.gSync.email);
        const r = await vault.run((t) => {
          this.syncState = t;
          if (shown) this.event("busy", t);
        });
        again = r.retry;
        this.settings.set({ lastSync: Date.now(), syncError: r.warnings.length ? `読み込めないノート ${r.warnings.length}件` : "" });
        if (shown) this.toast(`同期しました（受信 ${r.down}・送信 ${r.up}${r.merged ? `・統合 ${r.merged}` : ""}${r.deleted ? `・削除 ${r.deleted}` : ""}）`);
        if (shown && r.warnings.length) this.event("report", "読み込めないノートがあります：\n" + r.warnings.join("\n"));
      } catch (e) {
        this.settings.set({ syncError: e.needLogin ? "Googleへの再ログインが必要です" : e.message });
        if (shown) this.event("report", e.message);
      } finally {
        if (shown) this.event("busy", "");
        this.syncState = "";
        this.syncing = null;
        this.refresh();
      }
      if (again) this.scheduleSync(15000);
    })();
    return this.syncing;
  }
}

module.exports = { Backend, CAPS };
