// An applicant as a Google contact (People API). Kept apart from business-card and everyday
// contacts by labels ("面接応募者", "面接応募者・看護師"), the job in the name's suffix (what the
// phone shows when the applicant calls) and a note saying where it came from.
"use strict";

const lines = (s) => String(s || "").split(/[\n,;]/).map((x) => x.trim()).filter(Boolean);
const cjk = (s) => /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(s);
const parts = (s) => {
  const a = String(s || "").trim().split(/[ 　]+/);
  return a.length >= 2 ? [a[0], a.slice(1).join(" ")] : [String(s || "").trim(), ""];
};
const SEP = "・";

// opts: { label, byCategory, suffix, org }
function body(p, opts = {}) {
  const name = String(p.name || "").trim();
  const kana = String(p.kana || "").normalize("NFKC").trim();
  const job = String(p.category || "").trim() || String(p.position || "").trim();
  const n = { unstructuredName: name };
  const [a, b] = parts(name);
  const japanese = cjk(name);
  if (b) Object.assign(n, japanese ? { familyName: a, givenName: b } : { givenName: a, familyName: b });
  else if (name) n[japanese ? "familyName" : "givenName"] = name;
  if (kana) {
    const [k1, k2] = parts(kana);
    n.phoneticFamilyName = k1;
    if (k2) n.phoneticGivenName = k2;
  }
  if (opts.suffix !== false) {
    n.honorificSuffix = `（${job ? job + " " : ""}応募者）`;
    if (name) n.unstructuredName = name + " " + n.honorificSuffix;
  }
  const out = { names: [n] };
  out.organizations = [{ name: opts.org || "", title: job ? `応募：${job}` : "応募者", type: "other" }];
  const phones = [...lines(p.mobile).map((v) => ({ value: v, type: "mobile" })), ...lines(p.phone).map((v) => ({ value: v, type: "home" }))];
  if (phones.length) out.phoneNumbers = phones;
  const emails = lines(p.email).map((v) => ({ value: v, type: "home" }));
  if (emails.length) out.emailAddresses = emails;
  // Only the home address (a "連絡先：" line after it stays out).
  const addr = String(p.address || "").split(/\n/)[0].trim();
  if (addr || p.postal) out.addresses = [{ streetAddress: addr, postalCode: p.postal || "", type: "home" }];
  const info = [
    "Theta Mensetsu Hatch から登録（面接の応募者）",
    job ? `職種：${job}` : "",
    p.position && p.position !== job ? `応募：${p.position}` : "",
    p.appliedDate ? `応募日：${p.appliedDate}` : "",
    p.interview ? `面接：${p.interview}` : "",
  ].filter(Boolean);
  out.biographies = [{ value: info.join("\n"), contentType: "TEXT_PLAIN" }];
  return out;
}

// The labels this applicant should have.
function labels(p, opts) {
  if (!opts.label) return [];
  const out = [opts.label];
  const c = String(p.category || "").trim();
  if (opts.byCategory && c) out.push(opts.label + SEP + c);
  return out;
}

// A label this app manages (so it may take the applicant off it when the job changes).
const isOurs = (name, opts) => !!opts.label && (name === opts.label || String(name).startsWith(opts.label + SEP));

module.exports = { body, labels, isOurs };
