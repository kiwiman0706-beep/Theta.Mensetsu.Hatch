// The PC's Google sign-in: the browser comes back to a one-time loopback address with the code;
// PKCE, the refresh token kept (encrypted by main.js), and a refresh when the access token ends.
"use strict";
const test = require("node:test");
const assert = require("node:assert");
const crypto = require("crypto");
const http = require("http");
const { DesktopGoogle } = require("../lib/google-desktop");

test("sign-in with PKCE, saved refresh token, refresh, sign-out", async () => {
  let saved = null, verifier = "", refreshes = 0;
  const fetchImpl = async (url, opt) => {
    const ok = (o) => ({ ok: true, status: 200, json: async () => o });
    if (url.endsWith("/token")) {
      const b = new URLSearchParams(opt.body);
      if (b.get("grant_type") === "authorization_code") {
        verifier = b.get("code_verifier");
        assert.strictEqual(b.get("code"), "CODE");
        return ok({ access_token: "A1", expires_in: 3600, refresh_token: "R1" });
      }
      refreshes++;
      assert.strictEqual(b.get("refresh_token"), "R1");
      return ok({ access_token: "A2", expires_in: 3600 });
    }
    if (url.includes("userinfo")) return ok({ email: "hr@example.com" });
    if (url.includes("revoke")) return ok({});
    throw new Error("unexpected " + url);
  };
  let challenge = "";
  const openExternal = async (u) => {
    const q = new URL(u).searchParams;
    challenge = q.get("code_challenge");
    assert.match(q.get("prompt"), /select_account/, "the account chooser opens");
    assert.match(q.get("scope"), /drive/);
    // The browser, after the user picked an account:
    http.get(`${q.get("redirect_uri")}/?state=${q.get("state")}&code=CODE`, (r) => r.resume());
  };
  const g = new DesktopGoogle({ client: { id: "1-x.apps.googleusercontent.com", secret: "s" }, persist: { get: () => saved, set: (v) => (saved = v) }, openExternal, fetchImpl });
  assert.strictEqual(await g.signIn(), "hr@example.com");
  assert.strictEqual(challenge, crypto.createHash("sha256").update(verifier).digest("base64url"));
  assert.deepStrictEqual(saved, { refresh: "R1", email: "hr@example.com" });
  // A new start of the app: signed in from the saved token, a fresh access token on first use.
  const again = new DesktopGoogle({ client: { id: "1-x.apps.googleusercontent.com" }, persist: { get: () => saved, set: (v) => (saved = v) }, fetchImpl });
  assert.ok(again.signedIn());
  assert.strictEqual(await again.accessToken(), "A2");
  assert.strictEqual(await again.accessToken(), "A2");
  assert.strictEqual(refreshes, 1);
  await again.signOut();
  assert.strictEqual(saved, null);
  assert.ok(!again.signedIn());
});
