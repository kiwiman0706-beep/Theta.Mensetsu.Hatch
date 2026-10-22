// In-memory stand-ins for Google Drive and Google Contacts (People API), shaped like the calls
// drive-vault.js and backend.js make (google-api.js).
"use strict";
const crypto = require("crypto");

const FOLDER = "application/vnd.google-apps.folder";

class FakeDrive {
  constructor() {
    this.files = new Map();
    this.n = 0;
    this.onMeta = null; // (id) => void: lets a test change a file between reading and writing
  }
  md5(b) {
    return crypto.createHash("md5").update(Buffer.from(b)).digest("hex");
  }
  async list(q) {
    const name = /name='((?:[^'\\]|\\.)*)'/.exec(q)?.[1]?.replace(/\\'/g, "'");
    const parent = /'([^']+)' in parents/.exec(q)[1];
    const folder = q.includes(`mimeType='${FOLDER}'`);
    return [...this.files.values()]
      .filter((f) => !f.trashed && (f.parents || []).includes(parent) && (!name || f.name === name) && (!folder || f.mimeType === FOLDER))
      .map((f) => ({ id: f.id, name: f.name, mimeType: f.mimeType, parents: [...f.parents], md5Checksum: f.md5 }));
  }
  async meta(id) {
    if (this.onMeta) this.onMeta(id);
    const f = this.files.get(id);
    return { id, name: f.name, parents: [...f.parents], md5Checksum: f.md5, trashed: !!f.trashed };
  }
  async download(id) {
    return new Uint8Array(this.files.get(id).content);
  }
  async create(meta, bytes) {
    const id = "f" + ++this.n;
    const content = bytes ? Buffer.from(bytes) : null;
    this.files.set(id, { id, name: meta.name, parents: [...meta.parents], mimeType: meta.mimeType || "application/octet-stream", content, md5: content && this.md5(content) });
    return { id, md5Checksum: content && this.md5(content) };
  }
  async update(id, meta, bytes, mime, move) {
    const f = this.files.get(id);
    if (meta && meta.name) f.name = meta.name;
    if (bytes) {
      f.content = Buffer.from(bytes);
      f.md5 = this.md5(f.content);
    }
    if (move) f.parents = [...f.parents.filter((p) => !move.remove.split(",").includes(p)), move.add];
    return { id, md5Checksum: f.md5 };
  }
  // Helpers for "the other side".
  folderId(path) {
    let cur = "root";
    for (const part of path.split("/")) cur = [...this.files.values()].find((f) => f.name === part && f.parents.includes(cur) && f.mimeType === FOLDER && !f.trashed)?.id;
    return cur;
  }
  notesIn(path) {
    const id = this.folderId(path);
    return [...this.files.values()].filter((f) => f.parents.includes(id) && f.name.endsWith(".md") && !f.trashed);
  }
  text(f) {
    return f.content.toString("utf8");
  }
  write(f, text) {
    f.content = Buffer.from(text);
    f.md5 = this.md5(f.content);
  }
}

class FakePeople {
  constructor() {
    this.contacts = new Map();
    this.groupsList = [{ resourceName: "contactGroups/myContacts", name: "myContacts", groupType: "SYSTEM_CONTACT_GROUP" }];
    this.n = 0;
    this.photos = new Map();
  }
  async create(body) {
    const resourceName = "people/c" + ++this.n;
    this.contacts.set(resourceName, { ...body, memberships: [{ contactGroupMembership: { contactGroupResourceName: "contactGroups/myContacts" } }] });
    return { resourceName, memberships: this.contacts.get(resourceName).memberships };
  }
  async get(r) {
    const c = this.contacts.get(r);
    if (!c) throw Object.assign(new Error("Google HTTP 404"), { status: 404 });
    return { resourceName: r, ...c };
  }
  async update(r, body) {
    const c = await this.get(r);
    this.contacts.set(r, { ...body, memberships: c.memberships });
  }
  async photo(r, b64) {
    this.photos.set(r, b64);
  }
  async remove(r) {
    if (!this.contacts.delete(r)) throw Object.assign(new Error("Google HTTP 404"), { status: 404 });
  }
  async groups() {
    return this.groupsList.map((g) => ({ ...g }));
  }
  async createGroup(name) {
    const g = { resourceName: "contactGroups/g" + ++this.n, name, groupType: "USER_CONTACT_GROUP" };
    this.groupsList.push(g);
    return g;
  }
  async modifyGroup(group, add, remove) {
    for (const r of add) this.contacts.get(r).memberships.push({ contactGroupMembership: { contactGroupResourceName: group } });
    for (const r of remove) {
      const c = this.contacts.get(r);
      c.memberships = c.memberships.filter((m) => m.contactGroupMembership.contactGroupResourceName !== group);
    }
  }
  labelsOf(r) {
    const names = new Map(this.groupsList.map((g) => [g.resourceName, g.name]));
    return this.contacts.get(r).memberships.map((m) => names.get(m.contactGroupMembership.contactGroupResourceName)).filter((n) => n !== "myContacts").sort();
  }
}

// A signed-in Google account for the backend (instead of DesktopGoogle / WebGoogle).
function fakeAccount(email, { drive, people } = {}) {
  return {
    email,
    signed: true,
    signedIn() {
      return this.signed;
    },
    async whoami() {
      return email;
    },
    async signIn() {
      this.signed = true;
      return email;
    },
    async signOut() {
      this.signed = false;
    },
    drive: () => drive,
    people: () => people,
  };
}

function memoryKv() {
  const m = new Map();
  return { get: async (k) => (m.has(k) ? structuredClone(m.get(k)) : undefined), put: async (k, v) => void m.set(k, structuredClone(v)) };
}

module.exports = { FakeDrive, FakePeople, fakeAccount, memoryKv, FOLDER };
