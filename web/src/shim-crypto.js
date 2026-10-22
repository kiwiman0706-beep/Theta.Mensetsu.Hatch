// Node's crypto, as far as the shared libs use it (sha256 / md5 digests, randomUUID).
"use strict";
const { sha256 } = require("js-sha256");
const md5 = require("js-md5");

function createHash(alg) {
  const h = alg === "md5" ? md5.create() : sha256.create();
  return {
    update(d) {
      h.update(typeof d === "string" ? d : new Uint8Array(d.buffer ? d.buffer.slice(d.byteOffset, d.byteOffset + d.byteLength) : d));
      return this;
    },
    digest(enc) {
      const b = Buffer.from(h.arrayBuffer());
      return enc === "hex" ? b.toString("hex") : b;
    },
  };
}

module.exports = { createHash, randomUUID: () => globalThis.crypto.randomUUID() };
