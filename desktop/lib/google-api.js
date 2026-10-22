// The Google APIs the app uses (Drive for the Theta Vault, People for contacts and their labels),
// shared by the PC app (google-desktop.js: tokens refreshed in the background) and the browser
// (web/src/google.js: Google's sign-in window, about an hour per sign-in).
"use strict";

const SCOPES = {
  // The account that holds the Theta Vault (and, unless another one is chosen, the contacts).
  sync: ["https://www.googleapis.com/auth/drive", "https://www.googleapis.com/auth/contacts", "openid", "email"],
  // A separate account only for the applicants' contacts.
  contacts: ["https://www.googleapis.com/auth/contacts", "openid", "email"],
};

class NeedLogin extends Error {
  constructor(what = "") {
    super(`Googleへのログインが必要です${what ? "（" + what + "）" : ""}。メニューの「Googleアカウント」からログインしてください`);
    this.needLogin = true;
  }
}

class GoogleApi {
  constructor(purpose = "sync", fetchImpl) {
    this.purpose = purpose;
    this.email = "";
    this.fetch = fetchImpl || ((...a) => fetch(...a));
  }

  // Subclasses: a valid access token, or throw NeedLogin.
  async accessToken() {
    throw new NeedLogin();
  }
  signedIn() {
    return false;
  }

  async whoami() {
    const r = await this.call("https://www.googleapis.com/oauth2/v3/userinfo");
    this.email = r.email || "";
    return this.email;
  }

  async call(url, { method = "GET", body, headers = {}, raw = false, retry = 2 } = {}) {
    const token = await this.accessToken();
    let res;
    try {
      res = await this.fetch(url, { method, body, headers: { Authorization: "Bearer " + token, ...headers }, signal: AbortSignal.timeout(60000) });
    } catch (e) {
      if (retry > 0) return this.call(url, { method, body, headers, raw, retry: retry - 1 });
      throw new Error("Googleに接続できませんでした（通信を確認してください）：" + (e.message || e));
    }
    if (res.status === 401) {
      this.expire();
      throw new NeedLogin();
    }
    // Rate limits and Google's own hiccups: wait a little and try again.
    if ((res.status === 429 || res.status >= 500) && retry > 0) {
      await new Promise((ok) => setTimeout(ok, (3 - retry) * 1500 + 500));
      return this.call(url, { method, body, headers, raw, retry: retry - 1 });
    }
    if (!res.ok) {
      let msg = "";
      try {
        msg = (await res.json()).error.message;
      } catch {}
      const e = new Error(`Google HTTP ${res.status} ${msg}`);
      e.status = res.status;
      throw e;
    }
    if (raw) return res;
    return res.status === 204 ? {} : res.json();
  }
  expire() {}

  // ---- Drive (what drive-vault.js uses) ----------------------------------------------------
  drive() {
    const D = "https://www.googleapis.com/drive/v3/files";
    const U = "https://www.googleapis.com/upload/drive/v3/files";
    const multipart = (meta, bytes, mime) => {
      const b = "theta" + Math.random().toString(36).slice(2);
      const head = `--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${b}\r\nContent-Type: ${mime || "application/octet-stream"}\r\n\r\n`;
      const tail = `\r\n--${b}--`;
      const body = typeof Blob !== "undefined" ? new Blob([head, bytes, tail]) : Buffer.concat([Buffer.from(head), Buffer.from(bytes), Buffer.from(tail)]);
      return { body, type: `multipart/related; boundary=${b}` };
    };
    const FIELDS = "id,name,mimeType,parents,md5Checksum";
    return {
      list: async (q) => {
        const out = [];
        let page = "";
        do {
          const u = `${D}?q=${encodeURIComponent(q)}&pageSize=1000&spaces=drive&fields=nextPageToken,files(${FIELDS})${page ? "&pageToken=" + encodeURIComponent(page) : ""}`;
          const r = await this.call(u);
          out.push(...(r.files || []));
          page = r.nextPageToken || "";
        } while (page);
        return out;
      },
      meta: (id) => this.call(`${D}/${encodeURIComponent(id)}?fields=${FIELDS},trashed`),
      download: async (id) => new Uint8Array(await (await this.call(`${D}/${encodeURIComponent(id)}?alt=media`, { raw: true })).arrayBuffer()),
      create: async (meta, bytes, mime) => {
        if (!bytes) return this.call(`${D}?fields=id,md5Checksum`, { method: "POST", body: JSON.stringify(meta), headers: { "Content-Type": "application/json" } });
        const m = multipart(meta, bytes, mime);
        return this.call(`${U}?uploadType=multipart&fields=id,md5Checksum`, { method: "POST", body: m.body, headers: { "Content-Type": m.type } });
      },
      update: async (id, meta, bytes, mime, move) => {
        const q = move ? `&addParents=${encodeURIComponent(move.add)}&removeParents=${encodeURIComponent(move.remove)}` : "";
        if (!bytes)
          return this.call(`${D}/${encodeURIComponent(id)}?fields=id,md5Checksum${q}`, { method: "PATCH", body: JSON.stringify(meta || {}), headers: { "Content-Type": "application/json" } });
        const m = multipart(meta || {}, bytes, mime);
        return this.call(`${U}/${encodeURIComponent(id)}?uploadType=multipart&fields=id,md5Checksum${q}`, { method: "PATCH", body: m.body, headers: { "Content-Type": m.type } });
      },
    };
  }

  // ---- People (Google Contacts and labels) ---------------------------------------------------
  people() {
    const P = "https://people.googleapis.com/v1/";
    const FIELDS = "names,organizations,phoneNumbers,emailAddresses,addresses,biographies,birthdays";
    const json = { "Content-Type": "application/json" };
    return {
      create: (body) => this.call(`${P}people:createContact?personFields=names,memberships`, { method: "POST", body: JSON.stringify(body), headers: json }),
      get: (resource) => this.call(`${P}${resource}?personFields=names,memberships`),
      update: async (resource, body) => {
        const cur = await this.call(`${P}${resource}?personFields=names`);
        return this.call(`${P}${resource}:updateContact?updatePersonFields=${FIELDS}`, { method: "PATCH", body: JSON.stringify({ ...body, etag: cur.etag }), headers: json });
      },
      photo: (resource, base64) => this.call(`${P}${resource}:updateContactPhoto`, { method: "PATCH", body: JSON.stringify({ photoBytes: base64 }), headers: json }),
      deletePhoto: (resource) => this.call(`${P}${resource}:deleteContactPhoto`, { method: "DELETE" }),
      remove: (resource) => this.call(`${P}${resource}:deleteContact`, { method: "DELETE" }),
      groups: async () => {
        const out = [];
        let page = "";
        do {
          const r = await this.call(`${P}contactGroups?pageSize=1000&groupFields=name,groupType,memberCount${page ? "&pageToken=" + encodeURIComponent(page) : ""}`);
          out.push(...(r.contactGroups || []));
          page = r.nextPageToken || "";
        } while (page);
        return out;
      },
      createGroup: (name) => this.call(`${P}contactGroups`, { method: "POST", body: JSON.stringify({ contactGroup: { name } }), headers: json }),
      // Adds / removes people to a label (contactGroups/<id>).
      modifyGroup: (group, add = [], remove = []) =>
        this.call(`${P}${group}/members:modify`, { method: "POST", body: JSON.stringify({ resourceNamesToAdd: add, resourceNamesToRemove: remove }), headers: json }),
    };
  }
}

module.exports = { GoogleApi, NeedLogin, SCOPES };
