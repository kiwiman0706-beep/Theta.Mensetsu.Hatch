"use strict";
module.exports = {
  basename: (p) => String(p).split(/[\\/]/).pop(),
  join: (...a) => a.join("/"),
  relative: (a, b) => b,
  dirname: (p) => String(p).split(/[\\/]/).slice(0, -1).join("/"),
};
