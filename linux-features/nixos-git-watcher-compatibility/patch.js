"use strict";

const fs = require("node:fs");
const path = require("node:path");

const {
  CI_POLICY_REQUIRED_UPSTREAM,
  extractedAppPatch,
} = require("../../scripts/patches/descriptor.js");

const NEEDLE = "const family = familySync();";
const REPLACEMENT = "const family = 'glibc'     ;";
const RELATIVE_PATH = "node_modules/@parcel/watcher/index.js";

function applyNixosGitWatcherCompatibility(extractedDir) {
  const filePath = path.join(extractedDir, RELATIVE_PATH);
  const source = fs.readFileSync(filePath, "utf8");
  const needleCount = source.split(NEEDLE).length - 1;
  const replacementCount = source.split(REPLACEMENT).length - 1;
  if (needleCount === 0 && replacementCount === 1) {
    return { matched: 1, changed: 0, verified: true, assetName: RELATIVE_PATH };
  }
  if (needleCount !== 1 || replacementCount !== 0) {
    throw new Error(
      `Expected one unpatched Parcel watcher selector, found needle=${needleCount}, replacement=${replacementCount}`,
    );
  }
  if (Buffer.byteLength(NEEDLE) !== Buffer.byteLength(REPLACEMENT)) {
    throw new Error("NixOS watcher replacement must preserve byte length");
  }
  fs.writeFileSync(filePath, source.replace(NEEDLE, REPLACEMENT), "utf8");
  return { matched: 1, changed: 1, verified: true, assetName: RELATIVE_PATH };
}

module.exports = [
  extractedAppPatch({
    id: "nixos-git-watcher-detect-libc",
    phase: "extracted-app:pre-webview",
    order: 10,
    ciPolicy: CI_POLICY_REQUIRED_UPSTREAM,
    apply: applyNixosGitWatcherCompatibility,
  }),
];

module.exports.NEEDLE = NEEDLE;
module.exports.REPLACEMENT = REPLACEMENT;
module.exports.applyNixosGitWatcherCompatibility = applyNixosGitWatcherCompatibility;
