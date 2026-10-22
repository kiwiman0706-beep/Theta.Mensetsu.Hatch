// The shared backend (desktop/lib/backend.js) in the browser. What differs: Google's sign-in
// window may only open during the tap itself (Safari), and a sign-in lasts about an hour.
"use strict";
const { Backend } = require("../../desktop/lib/backend");

const CAPS = ["pick", "scan", "gemini", "export", "attach", "contacts", "sync", "google", "camera", "record", "commute"];

class WebBackend extends Backend {
  constructor(opts) {
    super({ ...opts, platform: "web", caps: CAPS });
  }

  // Which account a tap may have to sign in to before the action runs.
  needs(action, q) {
    const linked = () => {
      try {
        return !!(q.id && this.store.person(q.id).contactId);
      } catch {
        return false;
      }
    };
    if (action === "googleSignIn") return q.purpose === "contacts" ? "contacts" : "sync";
    if (action === "syncNow") return "sync";
    if (["contacts", "unlinkContact", "contactsRelabel", "contactsCleanup"].includes(action)) return "contacts";
    if (["save", "set", "delete", "asset"].includes(action) && linked()) return "contacts";
    if (action === "save" && q.thenContact) return "contacts";
    return "";
  }

  async handle(action, q = {}) {
    // Start the sign-in synchronously, still inside the tap (Safari blocks later pop-ups).
    let signIn = null;
    const purpose = this.needs(action, q);
    const g = purpose && this.account(purpose);
    if (g) signIn = g.token(action === "googleSignIn").catch((e) => e);
    try {
      if (signIn) {
        const t = await signIn;
        if (t instanceof Error) throw t;
      }
      if (action === "googleSignIn") {
        this.groupCache = null;
        this.refresh();
        this.toast("Googleにログインしました：" + g.email);
        await this.afterSignIn();
        return this.scheduleSync(500);
      }
      await this.dispatch(action, q);
    } catch (e) {
      this.event("error", e.message || String(e));
    }
  }
}

module.exports = { WebBackend, CAPS };
