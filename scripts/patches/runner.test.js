"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {
  createPatchReport,
  enabledFeatureFailuresFromReport,
} = require("../lib/patch-report.js");
const {
  allPatchPolicies,
  corePatchDescriptors,
  createMainBundleContext,
  patchExtractedApp,
  requiredPatchNamesForProfile,
} = require("./runner.js");

const emptyConfig = path.join(__dirname, "..", "..", "linux-features", "features.example.json");

test("official baseline has no core descriptors or required patch policies", () => {
  assert.deepEqual(corePatchDescriptors(), []);
  assert.deepEqual(allPatchPolicies({ featuresConfigPath: emptyConfig }), []);
  assert.deepEqual(requiredPatchNamesForProfile("upstream-build", { featuresConfigPath: emptyConfig }), []);
});

test("required feature policy names match their patch-report descriptor IDs", () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "runner-required-feature-ids-"));
  try {
    const config = path.join(temp, "features.json");
    fs.writeFileSync(
      config,
      '{"enabled":["linux-performance-workarounds","linux-renderer-crash-diagnostics"]}\n',
    );
    const required = requiredPatchNamesForProfile("upstream-build", {
      featuresConfigPath: config,
    });

    assert.equal(required.length, 10);
    assert.equal(required.every((name) => name.startsWith("feature:")), true);
    assert.equal(
      required.includes(
        "feature:linux-performance-workarounds:linux-thread-navigation-history-index",
      ),
      true,
    );
    assert.equal(
      required.includes(
        "feature:linux-renderer-crash-diagnostics:linux-renderer-crash-diagnostics",
      ),
      true,
    );
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test("runner context exposes enabled feature IDs", () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "runner-context-"));
  try {
    const config = path.join(temp, "features.json");
    fs.writeFileSync(config, '{"enabled":["frameless-titlebar"]}\n');
    const context = createMainBundleContext(null, { featuresConfigPath: config });
    assert.deepEqual(context.enabledFeatureIds, ["frameless-titlebar"]);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test("empty feature set leaves official extracted files byte-identical", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "runner-baseline-"));
  try {
    const mainDir = path.join(root, ".vite", "build");
    const webviewDir = path.join(root, "webview", "assets");
    fs.mkdirSync(mainDir, { recursive: true });
    fs.mkdirSync(webviewDir, { recursive: true });
    const main = path.join(mainDir, "main.js");
    const webview = path.join(webviewDir, "app-initial-A.js");
    fs.writeFileSync(main, "official-main\n");
    fs.writeFileSync(webview, "official-webview\n");
    const report = createPatchReport();
    patchExtractedApp(root, { report, featuresConfigPath: emptyConfig });
    assert.equal(fs.readFileSync(main, "utf8"), "official-main\n");
    assert.equal(fs.readFileSync(webview, "utf8"), "official-webview\n");
    assert.deepEqual(report.patches, []);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("missing main bundle records enabled feature drift", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "runner-missing-main-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const config = path.join(root, "features.json");
  fs.writeFileSync(config, '{"enabled":["frameless-titlebar"]}\n');
  const report = createPatchReport();

  patchExtractedApp(root, { report, featuresConfigPath: config });

  const [entry] = report.patches;
  assert.equal(entry.name, "feature:frameless-titlebar:main-process");
  assert.equal(entry.status, "skipped-optional");
  assert.equal(entry.enforceWhenEnabled, true);
  assert.equal(entry.unavailable, true);
  assert.equal(
    enabledFeatureFailuresFromReport(report).some((failure) => failure.name === entry.name),
    true,
  );
});
