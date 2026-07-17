"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const repoRoot = path.resolve(__dirname, "../..");

test("Nix module documentation lists every supported Linux feature ID", () => {
  const nixSource = fs.readFileSync(path.join(repoRoot, "nix/linux-features.nix"), "utf8");
  const allowlistSource = nixSource.match(/supportedFeatureIds\s*=\s*\[([\s\S]*?)\];/)?.[1];
  assert.ok(allowlistSource, "expected supportedFeatureIds in nix/linux-features.nix");
  const allowed = [...allowlistSource.matchAll(/"([a-z0-9-]+)"/g)]
    .map((match) => match[1])
    .sort();

  const docsSource = fs.readFileSync(path.join(repoRoot, "docs/nix.md"), "utf8");
  const tableSource = docsSource.match(/\| Feature ID \| Purpose \|([\s\S]*?)\n\n/)?.[1];
  assert.ok(tableSource, "expected Linux feature ID table in docs/nix.md");
  const documented = [...tableSource.matchAll(/^\| `([a-z0-9-]+)` \|/gm)]
    .map((match) => match[1])
    .sort();

  assert.deepEqual(documented, allowed);
});
