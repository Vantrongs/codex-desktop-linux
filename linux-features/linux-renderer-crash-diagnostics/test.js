"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const manifest = require("./feature.json");
const descriptors = require("./patch.js");

test("renderer crash diagnostics remains opt-in and covers all evidence layers", () => {
  assert.equal(manifest.defaultEnabled, false);
  assert.deepEqual(
    descriptors.map(({ id, phase }) => [id, phase]),
    [
      ["linux-renderer-minidump-retention", "extracted-app:pre-webview"],
      ["linux-renderer-crash-diagnostics", "main-bundle"],
      ["linux-renderer-crash-breadcrumbs", "webview-asset"],
    ],
  );
});
