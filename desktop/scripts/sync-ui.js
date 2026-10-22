// The shared UI lives in ../ui (the browser version uses it too); the installer needs a copy here.
const fs = require("fs"), path = require("path");
const from = path.resolve(__dirname, "../../ui");
const to = path.resolve(__dirname, "../ui");
fs.rmSync(to, { recursive: true, force: true });
fs.cpSync(from, to, { recursive: true });
console.log("UI synced from ui/");
