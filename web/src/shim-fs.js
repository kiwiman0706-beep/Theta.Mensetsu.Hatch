// The browser has no file system; the shared backend only touches it for desktop-only actions.
"use strict";
const no = () => {
  throw new Error("この操作はWeb版では使えません");
};
module.exports = { promises: { readFile: no, writeFile: no }, readFileSync: no, writeFileSync: no, readdirSync: no, existsSync: () => false };
