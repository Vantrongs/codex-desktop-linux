"use strict";

const fs = require("node:fs");
const path = require("node:path");

const {
  CI_POLICY_REQUIRED_UPSTREAM,
  extractedAppPatch,
} = require("../../scripts/patches/descriptor.js");

const IDENTIFIER = "[A-Za-z_$][\\w$]*";
const BUNDLED_PLUGIN_WRITABLE_COPY_SYMBOL = "codexNixosBundledPluginWritableCopy";
const BUNDLED_PLUGIN_WRITABLE_COPY_HELPER =
  "async function codexNixosBundledPluginWritableCopy(e){let t=require(`node:path`),n=require(`node:fs/promises`),r=async e=>{let i=await n.lstat(e);if(i.isSymbolicLink()||!i.isDirectory()&&!i.isFile())return;await n.chmod(e,i.mode|128);if(i.isDirectory())for(let a of await n.readdir(e))await r(t.join(e,a))};await r(e)}";
const BUNDLED_PLUGIN_COPY_PATTERN = new RegExp(
  String.raw`if\((?<platform>${IDENTIFIER})\.default\.platform!==\`win32\`\)\{await (?<fs>${IDENTIFIER})\.default\.cp\((?<source>${IDENTIFIER}),(?<destination>${IDENTIFIER}),\{recursive:!0,verbatimSymlinks:!0\}\);return\}`,
  "g",
);
const BUNDLED_PLUGIN_PATCHED_COPY_PATTERN = new RegExp(
  String.raw`if\((?<platform>${IDENTIFIER})\.default\.platform!==\`win32\`\)\{await (?<fs>${IDENTIFIER})\.default\.cp\((?<source>${IDENTIFIER}),(?<destination>${IDENTIFIER}),\{recursive:!0,verbatimSymlinks:!0\}\);\k<platform>\.default\.platform===\`linux\`&&await codexNixosBundledPluginWritableCopy\(\k<destination>\);return\}`,
  "g",
);
const BUNDLED_PLUGIN_INSTALLED_PATTERN = new RegExp(
  BUNDLED_PLUGIN_WRITABLE_COPY_HELPER.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&") +
    BUNDLED_PLUGIN_PATCHED_COPY_PATTERN.source,
  "g",
);

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

function matchesExactlyOnce(source, pattern) {
  return [...source.matchAll(new RegExp(pattern.source, pattern.flags))].length === 1;
}

function hasNixosBundledPluginWritableCopy(source) {
  return source.split(BUNDLED_PLUGIN_WRITABLE_COPY_SYMBOL).length - 1 === 2 &&
    matchesExactlyOnce(source, BUNDLED_PLUGIN_INSTALLED_PATTERN) &&
    !new RegExp(BUNDLED_PLUGIN_COPY_PATTERN.source).test(source);
}

function applyNixosBundledPluginWritableCopy(extractedDir) {
  const buildDir = path.join(extractedDir, ".vite", "build");
  const candidates = fs.readdirSync(buildDir)
    .filter((name) => name.endsWith(".js"))
    .sort()
    .map((assetName) => {
      const filePath = path.join(buildDir, assetName);
      return { assetName, filePath, source: fs.readFileSync(filePath, "utf8") };
    })
    .filter(({ source }) =>
      source.includes("verbatimSymlinks") ||
      source.includes("codexNixosBundledPluginWritableCopy")
    );

  const installed = candidates.filter(({ source }) =>
    hasNixosBundledPluginWritableCopy(source)
  );
  const partial = candidates.filter(({ source }) =>
    source.includes(BUNDLED_PLUGIN_WRITABLE_COPY_SYMBOL) &&
    !hasNixosBundledPluginWritableCopy(source)
  );
  const unpatched = candidates.filter(({ source }) =>
    matchesExactlyOnce(source, BUNDLED_PLUGIN_COPY_PATTERN)
  );

  if (partial.length !== 0) {
    throw new Error("NixOS bundled plugin writable-copy patch is incomplete");
  }
  if (installed.length === 1 && unpatched.length === 0) {
    return {
      matched: 1,
      changed: 0,
      verified: true,
      assetName: installed[0].assetName,
    };
  }
  if (installed.length !== 0 || unpatched.length !== 1) {
    throw new Error(
      `Expected one bundled plugin copy contract, found unpatched=${unpatched.length}, installed=${installed.length}`,
    );
  }

  const candidate = unpatched[0];
  const [match] = candidate.source.matchAll(
    new RegExp(BUNDLED_PLUGIN_COPY_PATTERN.source, BUNDLED_PLUGIN_COPY_PATTERN.flags),
  );
  const { platform, fs: fsModule, source, destination } = match.groups;
  const original = match[0];
  const replacement =
    BUNDLED_PLUGIN_WRITABLE_COPY_HELPER +
    `if(${platform}.default.platform!==\`win32\`){await ${fsModule}.default.cp(${source},${destination},{recursive:!0,verbatimSymlinks:!0});${platform}.default.platform===\`linux\`&&await codexNixosBundledPluginWritableCopy(${destination});return}`;
  const patched = candidate.source.replace(original, replacement);
  if (!hasNixosBundledPluginWritableCopy(patched)) {
    throw new Error("NixOS bundled plugin writable-copy patch is incomplete");
  }
  fs.writeFileSync(candidate.filePath, patched, "utf8");
  return {
    matched: 1,
    changed: 1,
    verified: true,
    assetName: candidate.assetName,
  };
}

module.exports = [
  extractedAppPatch({
    id: "nixos-git-watcher-detect-libc",
    phase: "extracted-app:pre-webview",
    order: 10,
    ciPolicy: CI_POLICY_REQUIRED_UPSTREAM,
    apply: applyNixosGitWatcherCompatibility,
  }),
  extractedAppPatch({
    id: "nixos-bundled-plugin-writable-copy",
    phase: "extracted-app:pre-webview",
    order: 20,
    ciPolicy: CI_POLICY_REQUIRED_UPSTREAM,
    apply: applyNixosBundledPluginWritableCopy,
  }),
];

module.exports.NEEDLE = NEEDLE;
module.exports.REPLACEMENT = REPLACEMENT;
module.exports.BUNDLED_PLUGIN_WRITABLE_COPY_HELPER = BUNDLED_PLUGIN_WRITABLE_COPY_HELPER;
module.exports.applyNixosBundledPluginWritableCopy = applyNixosBundledPluginWritableCopy;
module.exports.applyNixosGitWatcherCompatibility = applyNixosGitWatcherCompatibility;
module.exports.hasNixosBundledPluginWritableCopy = hasNixosBundledPluginWritableCopy;
