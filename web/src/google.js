// Google sign-in in the browser (Google Identity Services, token model) for the shared API client.
// The OAuth client is the user's own "Web application" client (docs/WEB_SETUP.md). Tokens live in
// memory only (about an hour); a new one needs a tap, because Safari blocks pop-ups otherwise.
// The chosen account's address is remembered, so renewing asks no question.
"use strict";
const { GoogleApi, NeedLogin, SCOPES } = require("../../desktop/lib/google-api");

let gis = null;
function loadGis() {
  if (!gis)
    gis = new Promise((ok, ng) => {
      const s = document.createElement("script");
      s.src = "https://accounts.google.com/gsi/client";
      s.onload = () => ok(window.google.accounts.oauth2);
      s.onerror = () => {
        gis = null;
        ng(new Error("Googleのログイン画面を読み込めませんでした（通信を確認してください）"));
      };
      document.head.appendChild(s);
    });
  return gis;
}

class WebGoogle extends GoogleApi {
  // persist: { get() → email, set(email) }
  constructor(clientId, purpose = "sync", persist) {
    super(purpose);
    this.clientId = clientId;
    this.persist = persist;
    this.email = (persist && persist.get()) || "";
    this.access = null; // { token, until }
    if (clientId) loadGis().catch(() => {});
  }

  valid() {
    return !!(this.access && this.access.until > Date.now() + 60000);
  }
  // "Signed in" for the UI: an account was chosen and the token is still good.
  signedIn() {
    return this.valid();
  }
  expire() {
    this.access = null;
  }

  async accessToken() {
    if (this.valid()) return this.access.token;
    throw new NeedLogin(this.email);
  }

  // Must be called synchronously inside a tap. chooser: show Google's account chooser.
  token(chooser = false) {
    if (this.valid() && !chooser) return Promise.resolve(this.access.token);
    if (!this.clientId) return Promise.reject(new Error("先にメニューの「Googleアカウント」で、OAuthクライアントIDを設定してください"));
    const oauth = window.google?.accounts?.oauth2;
    if (!oauth) return loadGis().then(() => Promise.reject(new Error("もう一度押してください（Googleの準備ができました）")));
    return new Promise((ok, ng) => {
      const client = oauth.initTokenClient({
        client_id: this.clientId,
        scope: SCOPES[this.purpose].join(" "),
        callback: async (r) => {
          if (r.error) return ng(new Error("Googleにログインできませんでした：" + r.error));
          this.access = { token: r.access_token, until: Date.now() + (r.expires_in || 3600) * 1000 };
          try {
            await this.whoami();
            if (this.persist) this.persist.set(this.email);
          } catch {}
          ok(r.access_token);
        },
        error_callback: (e) => ng(new Error("Googleのログインを中止しました" + (e && e.type ? `（${e.type}）` : ""))),
      });
      client.requestAccessToken(chooser || !this.email ? { prompt: "select_account consent" } : { prompt: "", hint: this.email });
    });
  }

  async signIn({ chooser = true } = {}) {
    await this.token(chooser);
    return this.email;
  }

  async signOut() {
    if (this.access && window.google?.accounts?.oauth2) window.google.accounts.oauth2.revoke(this.access.token, () => {});
    this.access = null;
    this.email = "";
    if (this.persist) this.persist.set("");
  }
}

module.exports = { WebGoogle, NeedLogin };
