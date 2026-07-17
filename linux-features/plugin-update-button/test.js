#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  loadLinuxFeaturePatchDescriptors,
} = require("../../scripts/lib/linux-features.js");
const {
  COMPONENT_NAME,
  PATCH_MARKER,
  applyPluginUpdateButtonPatch,
  descriptors,
  pluginUpdateRuntimeSource,
} = require("./patch.js");

function pluginDetailFixture() {
  return [
    "async function Ua(e){let n=await Be(`read-plugin`,e);return n}",
    "function nu({hostId:e,pluginName:t,marketplacePath:n,parentPage:r=`plugins`}={}){",
    "let[w,T]=(0,gu.useState)(!1),U=e??`local`,",
    "{directMarketplacePath:me}=Ln({explicitMarketplacePath:n}),je=me??fallbackPath,",
    "{plugin:W,refetch:ut}=Ut({hostId:U,marketplacePath:je,pluginName:t}),",
    "It=(0,gu.useEffectEvent)(async()=>{await mu({hostId:U,refetchPluginDetail:ut})}),",
    "Br=W!=null?(0,$.jsx)(gs,{blockedReason:null,isInstalled:W.summary.installed,isUninstalling:lr,isUpdatingEnabled:ur,shareActions:null,onInstall:()=>{}}):null;",
    "return W==null?null:(0,$.jsx)(dc,{actions:Br,plugin:W,summary:W.summary.installed})}",
    "function ru(){}",
  ].join("");
}

function withTempDir(callback) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "plugin-update-button-"));
  try {
    return callback(tempDir);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

function withFeatureConfig(enabled, callback) {
  const previous = process.env.CODEX_LINUX_FEATURES_CONFIG;
  return withTempDir((tempDir) => {
    const configPath = path.join(tempDir, "features.json");
    fs.writeFileSync(configPath, `${JSON.stringify({ enabled })}\n`);
    process.env.CODEX_LINUX_FEATURES_CONFIG = configPath;
    try {
      return callback(path.resolve(__dirname, ".."));
    } finally {
      if (previous == null) {
        delete process.env.CODEX_LINUX_FEATURES_CONFIG;
      } else {
        process.env.CODEX_LINUX_FEATURES_CONFIG = previous;
      }
    }
  });
}

function runtimeButton({
  installed = true,
  isBusy = false,
  marketplace = { source_type: "local", source: "/tmp/example-marketplace" },
  pluginSource = {
    source: "git-subdir",
    url: "https://github.com/example/skills",
    path: "skills",
    ref: "main",
  },
  upgradeResponse = { upgraded: ["example"], errors: [] },
  installError = null,
  refreshError = null,
} = {}) {
  const busyChanges = [];
  const calls = [];
  const state = [];
  const updates = [];
  const effects = [];
  let remainingRefreshFailures = refreshError == null ? 0 : 1;
  let cursor = 0;
  const ReactRuntime = {
    useEffect(effect) {
      effects.push(effect);
    },
    useState(initialValue) {
      const index = cursor;
      cursor += 1;
      if (!(index in state)) {
        state[index] = typeof initialValue === "function" ? initialValue() : initialValue;
      }
      return [state[index], (value) => {
        state[index] = typeof value === "function" ? value(state[index]) : value;
      }];
    },
    useRef(initialValue) {
      return { current: initialValue };
    },
  };
  const JsxRuntime = {
    jsx(type, props) {
      return { type, props };
    },
  };
  const bridge = async (method, payload) => {
    calls.push({ method, payload });
    if (method === "read-config-for-host") {
      return { config: { marketplaces: { example: marketplace } } };
    }
    if (method === "upgrade-marketplaces") {
      return upgradeResponse;
    }
    if (method === "install-plugin" && installError != null) {
      throw installError;
    }
    return {};
  };
  const runtime = pluginUpdateRuntimeSource({
    bridgeVar: "bridge",
    jsxVar: "JsxRuntime",
    reactVar: "ReactRuntime",
  });
  const component = Function(
    "ReactRuntime",
    "JsxRuntime",
    "bridge",
    `${runtime};return ${COMPONENT_NAME};`,
  )(ReactRuntime, JsxRuntime, bridge);
  const render = () => {
    cursor = 0;
    effects.length = 0;
    return component({
      hostId: "local",
      installed,
      isBusy,
      marketplaceName: "example",
      marketplacePath: "/tmp/example-marketplace",
      pluginName: "skills",
      pluginSource,
      onBusyChange(value) {
        busyChanges.push(value);
      },
      async onUpdated() {
        updates.push(true);
        if (remainingRefreshFailures > 0) {
          remainingRefreshFailures -= 1;
          throw refreshError;
        }
      },
    });
  };
  const resolveDiscovery = async () => {
    assert.equal(effects.length, 1);
    effects[0]();
    await Promise.resolve();
    await Promise.resolve();
  };
  return { busyChanges, calls, render, resolveDiscovery, updates };
}

test("feature stays disabled until selected and loads one opt-in descriptor", () => {
  withFeatureConfig([], (featuresRoot) => {
    assert.deepEqual(loadLinuxFeaturePatchDescriptors({ featuresRoot }), []);
  });

  withFeatureConfig(["plugin-update-button"], (featuresRoot) => {
    const loaded = loadLinuxFeaturePatchDescriptors({ featuresRoot });
    assert.deepEqual(
      loaded.map((descriptor) => [descriptor.id, descriptor.phase, descriptor.ciPolicy]),
      [["feature:plugin-update-button:plugin-update-button-ui", "webview-asset", "opt-in"]],
    );
  });
});

test("descriptor targets only plugin detail assets", () => {
  assert.deepEqual(
    descriptors.map((descriptor) => [descriptor.id, descriptor.phase, descriptor.ciPolicy]),
    [["plugin-update-button-ui", "webview-asset", "opt-in"]],
  );
  assert.equal(descriptors[0].pattern.test("plugin-detail-page-DmxssFl8.js"), true);
  assert.equal(descriptors[0].pattern.test("plugins-settings-Cfu9UALJ.js"), false);
});

test("patch injects one Git update action and is idempotent", () => {
  const source = pluginDetailFixture();
  const patched = applyPluginUpdateButtonPatch(source);

  assert.notEqual(patched, source);
  assert.equal(applyPluginUpdateButtonPatch(patched), patched);
  assert.match(patched, new RegExp(PATCH_MARKER));
  assert.match(patched, /shareActions:\(0,\$\.jsx\)\(codexLinuxGitPluginUpdateButton/);
  assert.match(patched, /marketplacePath:W\.marketplacePath\?\?je/);
  assert.match(patched, /pluginName:W\.summary\.name/);
  assert.match(patched, /pluginSource:W\.summary\.source/);
  assert.match(
    patched,
    /isUninstalling:lr\|\|codexLinuxGitPluginUpdateBusyV1,isUpdatingEnabled:ur/,
  );
  assert.match(
    patched,
    /onBusyChange:setCodexLinuxGitPluginUpdateBusyV1,onUpdated:It/,
  );
});

test("patch is fail-soft when the complete action contract is absent", () => {
  const partial = pluginDetailFixture().replace("shareActions:null", "shareActions:existingAction");
  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (message) => warnings.push(message);
  try {
    assert.equal(applyPluginUpdateButtonPatch(partial), partial);
  } finally {
    console.warn = originalWarn;
  }
  assert.deepEqual(warnings, [
    "WARN: Could not resolve the current plugin detail component - skipping Git plugin update button patch",
  ]);
});

test("local marketplace plus git-subdir plugin directly performs atomic reinstall", async () => {
  const runtime = runtimeButton();
  assert.equal(runtime.render().props.disabled, true);
  await runtime.resolveDiscovery();
  const button = runtime.render();

  assert.equal(button.type, "button");
  assert.equal(button.props.disabled, false);
  const clickEvent = { preventDefault() {}, stopPropagation() {} };
  await Promise.all([
    button.props.onClick(clickEvent),
    button.props.onClick(clickEvent),
  ]);

  assert.deepEqual(runtime.calls, [
    {
      method: "read-config-for-host",
      payload: { hostId: "local", includeLayers: false, cwd: null },
    },
    {
      method: "install-plugin",
      payload: {
        hostId: "local",
        marketplacePath: "/tmp/example-marketplace",
        pluginName: "skills",
      },
    },
  ]);
  assert.deepEqual(runtime.updates, [true]);
  assert.deepEqual(runtime.busyChanges, [true, false]);
});

test("Git marketplace upgrades before atomically reinstalling its Git plugin", async () => {
  const runtime = runtimeButton({
    marketplace: { source_type: "git", source: "https://github.com/example/marketplace" },
    pluginSource: { type: "git", url: "https://github.com/example/skills" },
  });
  runtime.render();
  await runtime.resolveDiscovery();
  const button = runtime.render();
  await button.props.onClick({ preventDefault() {}, stopPropagation() {} });

  assert.deepEqual(runtime.calls.map((call) => call.method), [
    "read-config-for-host",
    "upgrade-marketplaces",
    "install-plugin",
  ]);
  assert.deepEqual(runtime.updates, [true]);
});

test("non-Git and uninstalled plugins do not expose the update action", async () => {
  for (const options of [
    { pluginSource: { type: "local", path: "/tmp/plugin" } },
    { pluginSource: { type: "npm", package: "example" } },
    { installed: false },
  ]) {
    const runtime = runtimeButton(options);
    runtime.render();
    await runtime.resolveDiscovery();
    assert.equal(runtime.render(), null);
  }
});

test("marketplace upgrade errors stop before atomic install", async () => {
  const runtime = runtimeButton({
    marketplace: { source_type: "git", source: "https://github.com/example/marketplace" },
    pluginSource: { type: "git", url: "https://github.com/example/skills" },
    upgradeResponse: { upgraded: [], errors: [{ marketplaceName: "example" }] },
  });
  runtime.render();
  await runtime.resolveDiscovery();
  const button = runtime.render();
  await button.props.onClick({ preventDefault() {}, stopPropagation() {} });

  assert.deepEqual(runtime.calls.map((call) => call.method), [
    "read-config-for-host",
    "upgrade-marketplaces",
  ]);
  assert.deepEqual(runtime.updates, []);
  assert.equal(runtime.render().props.children, "Update failed");
});

test("atomic install failure is visible and does not publish a successful refresh", async () => {
  const runtime = runtimeButton({ installError: new Error("install failed") });
  runtime.render();
  await runtime.resolveDiscovery();
  const button = runtime.render();
  await button.props.onClick({ preventDefault() {}, stopPropagation() {} });

  assert.deepEqual(runtime.calls.map((call) => call.method), [
    "read-config-for-host",
    "install-plugin",
  ]);
  assert.deepEqual(runtime.updates, []);
  assert.deepEqual(runtime.busyChanges, [true, false]);
  assert.equal(runtime.render().props.children, "Update failed");
});

test("refresh failure after atomic install keeps success and offers refresh-only retry", async () => {
  const runtime = runtimeButton({ refreshError: new Error("refresh failed") });
  runtime.render();
  await runtime.resolveDiscovery();
  const button = runtime.render();
  await button.props.onClick({ preventDefault() {}, stopPropagation() {} });

  assert.deepEqual(runtime.calls.map((call) => call.method), [
    "read-config-for-host",
    "install-plugin",
  ]);
  assert.deepEqual(runtime.updates, [true]);
  assert.deepEqual(runtime.busyChanges, [true, false]);
  const retryButton = runtime.render();
  assert.equal(retryButton.props.children, "Updated · Retry refresh");

  await retryButton.props.onClick({ preventDefault() {}, stopPropagation() {} });
  assert.deepEqual(runtime.calls.map((call) => call.method), [
    "read-config-for-host",
    "install-plugin",
  ]);
  assert.deepEqual(runtime.updates, [true, true]);
  assert.deepEqual(runtime.busyChanges, [true, false]);
  assert.equal(runtime.render().props.children, "Updated");
});

test("update action is disabled while another plugin mutation is pending", async () => {
  const runtime = runtimeButton({ isBusy: true });
  runtime.render();
  await runtime.resolveDiscovery();
  const button = runtime.render();
  assert.equal(button.props.disabled, true);
  await button.props.onClick({ preventDefault() {}, stopPropagation() {} });
  assert.deepEqual(runtime.calls.map((call) => call.method), ["read-config-for-host"]);
});
