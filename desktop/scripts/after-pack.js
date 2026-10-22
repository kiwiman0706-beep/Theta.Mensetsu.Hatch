// Mac builds are not signed with an Apple Developer ID. An ad-hoc signature (made on a Mac,
// after packing and before the dmg/zip) keeps Apple-silicon Macs from calling the app "damaged";
// people then only confirm "open anyway" once.
const { execFileSync } = require("child_process");
const path = require("path");

exports.default = async function (ctx) {
  if (ctx.electronPlatformName !== "darwin" || process.platform !== "darwin") return;
  const app = path.join(ctx.appOutDir, `${ctx.packager.appInfo.productFilename}.app`);
  execFileSync("codesign", ["--force", "--deep", "--sign", "-", app], { stdio: "inherit" });
};
