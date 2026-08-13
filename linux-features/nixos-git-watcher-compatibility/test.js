"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const descriptors = require("./patch.js");
const {
  NEEDLE,
  REPLACEMENT,
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
