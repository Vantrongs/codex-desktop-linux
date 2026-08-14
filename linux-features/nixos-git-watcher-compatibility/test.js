"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const descriptors = require("./patch.js");
const {
  BUNDLED_PLUGIN_WRITABLE_COPY_HELPER,
  NEEDLE,
  REPLACEMENT,
  applyNixosBundledPluginWritableCopy,
  applyNixosGitWatcherCompatibility,
} = descriptors;

test("NixOS watcher compatibility is fixed-length, idempotent, and fail-closed", (t) => {
  assert.equal(Buffer.byteLength(NEEDLE), Buffer.byteLength(REPLACEMENT));
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "codex-nixos-watcher-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const filePath = path.join(root, "node_modules/@parcel/watcher/index.js");
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `before\n${NEEDLE}\nafter\n`);

  assert.equal(applyNixosGitWatcherCompatibility(root).changed, 1);
  assert.equal(applyNixosGitWatcherCompatibility(root).changed, 0);
  assert.match(fs.readFileSync(filePath, "utf8"), /const family = 'glibc'     ;/u);

  fs.writeFileSync(filePath, "const family = unknown();\n");
  assert.throws(
    () => applyNixosGitWatcherCompatibility(root),
    /Expected one unpatched Parcel watcher selector/u,
  );
});

test("NixOS bundled plugin copies become owner-writable before staging cleanup", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "codex-nixos-plugin-copy-"));

  const extractedDir = path.join(root, "app");
  const buildDir = path.join(extractedDir, ".vite", "build");
  const assetPath = path.join(buildDir, "main-current.js");
  fs.mkdirSync(buildDir, { recursive: true });
  fs.writeFileSync(
    assetPath,
    "const S={default:{platform:process.platform}},y={default:require(`node:fs/promises`)},p=require(`node:path`);" +
      "async function qne(e,t){if(S.default.platform===`darwin`){return}" +
      "if(S.default.platform!==`win32`){await y.default.cp(e,t,{recursive:!0,verbatimSymlinks:!0});return}" +
      "throw Error(`windows-only fixture`) }" +
      "module.exports={qne};\n",
  );

  const source = path.join(root, "source");
  const sourceMetadata = path.join(source, ".codex-plugin");
  const externalTarget = path.join(root, "external-target");
  const destination = path.join(root, "destination");
  t.after(() => {
    fs.chmodSync(sourceMetadata, 0o755);
    fs.chmodSync(source, 0o755);
    fs.rmSync(root, { recursive: true, force: true });
  });
  fs.mkdirSync(sourceMetadata, { recursive: true });
  const sourcePluginManifest = path.join(sourceMetadata, "plugin.json");
  fs.writeFileSync(sourcePluginManifest, "{}\n");
  fs.writeFileSync(externalTarget, "outside\n", { mode: 0o444 });
  fs.symlinkSync(externalTarget, path.join(source, "external-link"));
  fs.chmodSync(sourcePluginManifest, 0o444);
  fs.chmodSync(sourceMetadata, 0o555);
  fs.chmodSync(source, 0o555);

  const first = applyNixosBundledPluginWritableCopy(extractedDir);
  const second = applyNixosBundledPluginWritableCopy(extractedDir);
  assert.deepEqual(first, { matched: 1, changed: 1, verified: true, assetName: "main-current.js" });
  assert.deepEqual(second, { matched: 1, changed: 0, verified: true, assetName: "main-current.js" });

  delete require.cache[require.resolve(assetPath)];
  const { qne } = require(assetPath);
  await qne(source, destination);

  const destinationMetadata = path.join(destination, ".codex-plugin");
  const destinationPluginManifest = path.join(destinationMetadata, "plugin.json");
  for (const copiedPath of [destination, destinationMetadata, destinationPluginManifest]) {
    const mode = fs.statSync(copiedPath).mode;
    assert.notEqual(mode & 0o200, 0, `${copiedPath} must be owner-writable`);
    assert.equal(mode & 0o022, 0, `${copiedPath} must not be group/world-writable`);
  }
  assert.equal(fs.lstatSync(path.join(destination, "external-link")).isSymbolicLink(), true);
  assert.equal(fs.statSync(externalTarget).mode & 0o222, 0);
  await fs.promises.rm(destination, { recursive: true });
  assert.equal(fs.existsSync(destination), false);
  assert.equal(fs.statSync(source).mode & 0o222, 0);
  assert.equal(fs.statSync(sourcePluginManifest).mode & 0o222, 0);

  const installed = fs.readFileSync(assetPath, "utf8");
  fs.writeFileSync(
    assetPath,
    installed.replace(
      BUNDLED_PLUGIN_WRITABLE_COPY_HELPER,
      `/*${BUNDLED_PLUGIN_WRITABLE_COPY_HELPER}*/`,
    ),
  );
  assert.throws(
    () => applyNixosBundledPluginWritableCopy(extractedDir),
    /NixOS bundled plugin writable-copy patch is incomplete/u,
  );
  fs.writeFileSync(assetPath, installed);

  fs.appendFileSync(assetPath, "/*codexNixosBundledPluginWritableCopy*/");
  assert.throws(
    () => applyNixosBundledPluginWritableCopy(extractedDir),
    /NixOS bundled plugin writable-copy patch is incomplete/u,
  );
  fs.writeFileSync(assetPath, installed);

  const drifted = fs.readFileSync(assetPath, "utf8").replace(
    /[A-Za-z_$][\w$]*\.default\.platform===`linux`&&await codexNixosBundledPluginWritableCopy\([A-Za-z_$][\w$]*\);/u,
    "",
  );
  fs.writeFileSync(assetPath, drifted);
  assert.throws(
    () => applyNixosBundledPluginWritableCopy(extractedDir),
    /NixOS bundled plugin writable-copy patch is incomplete/u,
  );
});
