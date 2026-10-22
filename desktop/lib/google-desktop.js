// Google sign-in for the PC app: the user's own "Desktop app" OAuth client, the system browser and
// a one-time loopback address (http://127.0.0.1:<port>) with PKCE. The refresh token is kept
// encrypted by the OS (persist: main.js uses safeStorage), so the PC stays signed in and syncs in
// the background without asking again.
"use strict";
const crypto = require("crypto");
const http = require("http");
const { GoogleApi, NeedLogin, SCOPES } = require("./google-api");

const AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN = "https://oauth2.googleapis.com/token";
const b64url = (b) => Buffer.from(b).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

const PAGE = (ok, text) =>
  `<!doctype html><meta charset="utf-8"><title>Theta Mensetsu Hatch</title><body style="font-family:sans-serif;padding:40px;text-align:center"><h2>${ok ? "ログインしました" : "ログインできませんでした"}</h2><p>${text}</p></body>`;

class DesktopGoogle extends GoogleApi {
  // client: { id, secret }; persist: { get() → {refresh, email} | null, set(obj | null) }
  constructor({ client, persist, purpose = "sync", openExternal, fetchImpl }) {
    super(purpose, fetchImpl);
    this.client = client || {};
    this.persist = persist;
    this.openExternal = openExternal;
    const saved = (persist && persist.get()) || {};
    this.refresh = saved.refresh || "";
    this.email = saved.email || "";
    this.access = null; // { token, until }
    this.refreshing = null;
  }

  configured() {
    return !!this.client.id;
  }
  signedIn() {
    return !!this.refresh;
  }
  expire() {
    this.access = null;
  }

  async accessToken() {
    if (this.access && this.access.until > Date.now() + 60000) return this.access.token;
    if (!this.refresh) throw new NeedLogin();
    if (!this.refreshing)
      this.refreshing = this.token({ grant_type: "refresh_token", refresh_token: this.refresh })
        .catch((e) => {
          // The grant was revoked or expired (e.g. a "testing" consent screen after 7 days).
          if (e.grant) {
            this.refresh = "";
            this.save();
            throw new NeedLogin("ログインの有効期限が切れました");
          }
          throw e;
        })
        .finally(() => (this.refreshing = null));
    await this.refreshing;
    return this.access.token;
  }

  async token(params) {
    const body = new URLSearchParams({ client_id: this.client.id, ...(this.client.secret ? { client_secret: this.client.secret } : {}), ...params });
    let res;
    try {
      res = await this.fetch(TOKEN, { method: "POST", body, headers: { "Content-Type": "application/x-www-form-urlencoded" }, signal: AbortSignal.timeout(30000) });
    } catch (e) {
      throw new Error("Googleに接続できませんでした（通信を確認してください）");
    }
    const r = await res.json().catch(() => ({}));
    if (!res.ok) {
      const e = new Error("Googleのログインに失敗しました：" + (r.error_description || r.error || res.status));
      e.grant = r.error === "invalid_grant";
      throw e;
    }
    this.access = { token: r.access_token, until: Date.now() + (r.expires_in || 3600) * 1000 };
    if (r.refresh_token) this.refresh = r.refresh_token;
    return r;
  }

  save() {
    if (this.persist) this.persist.set(this.refresh ? { refresh: this.refresh, email: this.email } : null);
  }

  // Opens Google's sign-in in the browser (the account chooser first) and waits for the answer.
  async signIn({ hint = "", timeout = 5 * 60 * 1000 } = {}) {
    if (!this.client.id) throw new Error("先にGoogle CloudのOAuthクライアントID（種類：デスクトップ アプリ）を設定してください");
    const verifier = b64url(crypto.randomBytes(32));
    const challenge = b64url(crypto.createHash("sha256").update(verifier).digest());
    const state = b64url(crypto.randomBytes(16));
    let server;
    const code = await new Promise((ok, ng) => {
      const timer = setTimeout(() => ng(new Error("ログインが完了しませんでした（時間切れ）。もう一度お試しください")), timeout);
      server = http.createServer((req, res) => {
        const u = new URL(req.url, "http://127.0.0.1");
        if (u.pathname !== "/") return res.writeHead(404).end();
        if (u.searchParams.get("state") !== state) return res.writeHead(400).end();
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        const err = u.searchParams.get("error");
        res.end(PAGE(!err, err ? "アプリに戻って、もう一度お試しください。" : "このタブを閉じて、アプリに戻ってください。"));
        clearTimeout(timer);
        err ? ng(new Error("Googleのログインを中止しました（" + err + "）")) : ok(u.searchParams.get("code"));
      });
      server.on("error", ng);
      server.listen(0, "127.0.0.1", () => {
        this.redirect = `http://127.0.0.1:${server.address().port}`;
        const q = new URLSearchParams({
          client_id: this.client.id,
          redirect_uri: this.redirect,
          response_type: "code",
          scope: SCOPES[this.purpose].join(" "),
          code_challenge: challenge,
          code_challenge_method: "S256",
          state,
          access_type: "offline",
          prompt: "select_account consent",
        });
        if (hint) q.set("login_hint", hint);
        Promise.resolve(this.openExternal(`${AUTH}?${q}`)).catch(ng);
      });
    }).finally(() => server && server.close());
    await this.token({ grant_type: "authorization_code", code, code_verifier: verifier, redirect_uri: this.redirect });
    if (!this.refresh) throw new Error("Googleから更新用のトークンが返りませんでした。もう一度ログインしてください");
    await this.whoami();
    this.save();
    return this.email;
  }

  async signOut() {
    const t = this.refresh;
    this.refresh = "";
    this.access = null;
    this.email = "";
    this.save();
    if (t) await this.fetch("https://oauth2.googleapis.com/revoke?token=" + encodeURIComponent(t), { method: "POST" }).catch(() => {});
  }
}

module.exports = { DesktopGoogle };
