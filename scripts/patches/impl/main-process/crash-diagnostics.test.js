"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { createPatchReport } = require("../../../lib/patch-report.js");
const {
  applyMainBundlePatchDescriptors,
  normalizePatchDescriptors,
} = require("../../engine.js");
const crashDiagnosticsDescriptor = require(
  "../../core/all-linux/main-process/crash-diagnostics/patch.js"
);
const {
  applyLinuxRendererCrashDiagnosticsPatch,
} = require("./crash-diagnostics.js");

function diagnosticsFixture() {
  return "var a=6e4,b=class{app;errorReporter;logger;lastRecoverableLogByKey=new Map;recoverableLogCleanupTimer=null;constructor(e,t,n){this.app=e,this.errorReporter=t,this.logger=n}register(){this.app.on(`child-process-gone`,this.onChildProcessGone)}onChildProcessGone=(e,t)=>{if(t.reason!==`clean-exit`)this.errorReporter.reportFatal(Error(`Child process gone (${t.type})`))}};";
}

test("renderer crash diagnostics patch persists actionable Linux crash context", () => {
  const patched = applyLinuxRendererCrashDiagnosticsPatch(diagnosticsFixture());

  assert.match(patched, /codexLinuxWriteRendererCrashLog/u);
  assert.match(patched, /render-process-gone/u);
  assert.match(patched, /renderer-crashes\.jsonl/u);
  assert.match(patched, /memory\.current/u);
  assert.equal(applyLinuxRendererCrashDiagnosticsPatch(patched), patched);
});

test("renderer crash diagnostics descriptor fails required when the upstream contract drifts", () => {
  const report = createPatchReport();
  const source = '"use strict";exports.runMainAppStartup=()=>{};';
  const result = applyMainBundlePatchDescriptors(
    source,
    normalizePatchDescriptors([crashDiagnosticsDescriptor]),
    {},
    report,
  );

  assert.equal(result.patchedSource, source);
  assert.equal(report.patches[0]?.status, "failed-required");
  assert.match(report.patches[0]?.reason ?? "", /process diagnostics contract/u);
});

test("renderer crash diagnostics rejects partial installed markers", () => {
  assert.throws(
    () => applyLinuxRendererCrashDiagnosticsPatch(`${diagnosticsFixture()}codexLinuxWriteRendererCrashLog`),
    /partial Linux renderer crash diagnostics markers/u,
  );
});

test("renderer crash diagnostics writes only to a private regular JSONL file", () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codex-renderer-crash-state-"));
  const previousStateHome = process.env.XDG_STATE_HOME;
  const previousAppId = process.env.CODEX_LINUX_APP_ID;
  const previousWebviewPort = process.env.CODEX_LINUX_WEBVIEW_PORT;
  const previousFallbackWebviewPort = process.env.CODEX_WEBVIEW_PORT;
  try {
    process.env.XDG_STATE_HOME = stateRoot;
    process.env.CODEX_LINUX_APP_ID = "codex-desktop-test";
    process.env.CODEX_LINUX_WEBVIEW_PORT = "5175";

    const module = { exports: {} };
    const source = `${applyLinuxRendererCrashDiagnosticsPatch(diagnosticsFixture())};module.exports=b;`;
    Function("require", "module", "exports", source)(require, module, module.exports);

    const listeners = new Map();
    const app = {
      getAppMetrics: () => [{ pid: 42, type: "Browser", memory: { workingSetSize: 1024 } }],
      getVersion: () => "26.test",
      on: (eventName, listener) => listeners.set(eventName, listener),
    };
    const warnings = [];
    const Diagnostics = module.exports;
    new Diagnostics(app, { reportFatal() {} }, {
      warning(message, details) {
        warnings.push({ message, details });
      },
    }).register();

    const foreignListeners = new Map();
    const foreignWebContents = {
      id: 6,
      getOSProcessId: () => 4141,
      getURL: () => "https://example.com/search/private-user-text?auth=secret#fragment",
      on: (eventName, listener) => foreignListeners.set(eventName, listener),
    };
    listeners.get("web-contents-created")({}, foreignWebContents);
    foreignListeners.get("console-message")({}, {
      message: `[codex-linux-renderer-breadcrumb]${JSON.stringify({
        v: 1,
        kind: "resize-observer-loop",
        route: "/private-user-text",
        routeIds: [],
        observers: [{
          id: 1,
          stack: "Error\n at https://example.com/app.js?auth=secret#fragment:1:2",
          targets: ["div-sensitive-target"],
        }],
      })}`,
    });

    const webContentsListeners = new Map();
    let rendererPid = 4242;
    let rendererUrl = "http://localhost:5175/codex/thread-a?secret=must-not-persist#fragment";
    const rendererWebContents = {
      id: 7,
      getOSProcessId: () => rendererPid,
      getURL: () => rendererUrl,
      on: (eventName, listener) => webContentsListeners.set(eventName, listener),
    };
    listeners.get("web-contents-created")({}, rendererWebContents);
    webContentsListeners.get("did-finish-load")();
    const maximumProducerMessage = `[codex-linux-renderer-breadcrumb]${JSON.stringify({
      v: 1,
      kind: "resize-observer-loop",
      timestamp: "2026-07-29T10:00:00.000Z",
      route: "/codex/thread-a",
      routeIds: ["019fad43-fe09-73d0-9925-40fdd74c37bf"],
      windowType: "electron",
      observers: Array.from({ length: 4 }, (_value, index) => ({
        id: index + 3,
        createdAt: "http://localhost:5175/assets/app-initial.js?stack-secret=1#fragment:10:20",
        stack: `Error\n at useMeasuredElement (http://localhost:5175/assets/app-initial.js?stack-secret=1)QUERY_LEAK#fragment:10:20) ${"x".repeat(3000)}`,
        targets: [
          "div[id][classes=2]",
          "section[classes=1]",
          "main",
          "article[id]",
          "div-sensitive-target",
        ],
      })),
    })}`;
    assert.ok(maximumProducerMessage.length < 32768);
    webContentsListeners.get("console-message")({}, { message: maximumProducerMessage });
    delete process.env.CODEX_LINUX_WEBVIEW_PORT;
    process.env.CODEX_WEBVIEW_PORT = "5175";
    webContentsListeners.get("console-message")({}, {
      message: `[codex-linux-renderer-breadcrumb]${JSON.stringify({
        v: 1,
        kind: "resize-observer-loop",
        routeIds: ["019fad43-fe09-73d0-9925-40fdd74c37c0"],
        observers: [{
          id: 99,
          stack: "Error\n at rejected (http://localhost:5175/private/fallback.js:1:2)",
          targets: ["main"],
        }],
      })}`,
    });
    process.env.CODEX_LINUX_WEBVIEW_PORT = "80";
    rendererUrl = "http://localhost:80/codex/port-80";
    webContentsListeners.get("console-message")({}, {
      message: `[codex-linux-renderer-breadcrumb]${JSON.stringify({
        v: 1,
        kind: "resize-observer-loop",
        routeIds: ["019fad43-fe09-73d0-9925-40fdd74c37c1"],
        observers: [{ id: 100, stack: "Error\n at port80 (http://localhost:80/private.js:1:2)", targets: ["main"] }],
      })}`,
    });
    rendererPid = 0;

    listeners.get("render-process-gone")(
      {},
      rendererWebContents,
      { exitCode: 5, reason: "crashed" },
    );

    const logFile = path.join(stateRoot, "codex-desktop-test", "renderer-crashes.jsonl");
    const records = fs.readFileSync(logFile, "utf8").trim().split("\n").map(JSON.parse);
    assert.equal(records.length, 1);
    assert.equal(records[0].reason, "crashed");
    assert.equal(records[0].exitCode, 5);
    assert.equal(records[0].rendererPid, 4242);
    assert.equal(records[0].webContentsId, 7);
    assert.equal(records[0].appVersion, "26.test");
    assert.equal(records[0].appMetrics[0].pid, 42);
    assert.equal(records[0].renderer.url, "http://localhost");
    assert.equal(records[0].renderer.breadcrumbs.length, 2);
    assert.equal(records[0].renderer.breadcrumbs[0].observers[0].id, 3);
    assert.equal(records[0].renderer.breadcrumbs[0].observers.length, 4);
    assert.equal(records[0].renderer.breadcrumbs[0].observers[0].stack.length, 2048);
    assert.deepEqual(records[0].renderer.breadcrumbs[0].observers[0].targets, [
      "div[id][classes=2]",
      "section[classes=1]",
      "main",
      "article[id]",
    ]);
    assert.equal(records[0].renderer.breadcrumbs[0].route, null);
    assert.deepEqual(records[0].renderer.breadcrumbs[0].routeIds, [
      "019fad43-fe09-73d0-9925-40fdd74c37bf",
    ]);
    assert.deepEqual(records[0].renderer.breadcrumbs[1].routeIds, [
      "019fad43-fe09-73d0-9925-40fdd74c37c1",
    ]);
    assert.doesNotMatch(
      JSON.stringify(records[0]),
      /must-not-persist|fragment|private-user-text|auth|stack-secret|sensitive-target|thread-a|app-initial|fallback|QUERY_LEAK|private\.js/u,
    );
    assert.equal(fs.statSync(logFile).mode & 0o777, 0o600);
    assert.equal(warnings.length, 1);
    assert.equal(warnings[0].message, "Linux renderer process gone");
    assert.equal(warnings[0].details.safe.rendererPid, 4242);

    const symlinkTarget = path.join(stateRoot, "symlink-target");
    fs.rmSync(logFile);
    fs.writeFileSync(symlinkTarget, "symlink-target-must-not-change\n", { mode: 0o640 });
    const symlinkTargetContents = fs.readFileSync(symlinkTarget);
    fs.symlinkSync(symlinkTarget, logFile);
    listeners.get("render-process-gone")(
      {},
      { id: 8, getOSProcessId: () => 4343 },
      { exitCode: 6, reason: "crashed" },
    );
    assert.deepEqual(fs.readFileSync(symlinkTarget), symlinkTargetContents);
    assert.equal(fs.statSync(symlinkTarget).mode & 0o777, 0o640);
    assert.equal(fs.lstatSync(logFile).isSymbolicLink(), false);
    assert.equal(fs.statSync(logFile).mode & 0o777, 0o600);
    assert.equal(fs.statSync(logFile).nlink, 1);

    const hardlinkTarget = path.join(stateRoot, "hardlink-target");
    fs.rmSync(logFile);
    fs.writeFileSync(hardlinkTarget, "hardlink-target-must-not-change\n", { mode: 0o604 });
    const hardlinkTargetContents = fs.readFileSync(hardlinkTarget);
    fs.linkSync(hardlinkTarget, logFile);
    listeners.get("render-process-gone")(
      {},
      { id: 9, getOSProcessId: () => 4444 },
      { exitCode: 7, reason: "crashed" },
    );
    assert.deepEqual(fs.readFileSync(hardlinkTarget), hardlinkTargetContents);
    assert.equal(fs.statSync(hardlinkTarget).mode & 0o777, 0o604);
    assert.equal(fs.statSync(logFile).mode & 0o777, 0o600);
    assert.equal(fs.statSync(logFile).nlink, 1);
    assert.equal(warnings.length, 3);

    fs.appendFileSync(logFile, "x".repeat(1_048_576));
    listeners.get("render-process-gone")(
      {},
      { id: 10, getOSProcessId: () => 4545, getURL: () => "about:blank" },
      { exitCode: 8, reason: "crashed" },
    );
    const retainedRecords = fs.readFileSync(logFile, "utf8").trim().split("\n").map(JSON.parse);
    assert.equal(retainedRecords.length, 1);
    assert.equal(retainedRecords[0].webContentsId, 10);
    assert.ok(fs.statSync(logFile).size < 1_048_576);
    assert.equal(warnings.length, 4);
  } finally {
    if (previousStateHome == null) delete process.env.XDG_STATE_HOME;
    else process.env.XDG_STATE_HOME = previousStateHome;
    if (previousAppId == null) delete process.env.CODEX_LINUX_APP_ID;
    else process.env.CODEX_LINUX_APP_ID = previousAppId;
    if (previousWebviewPort == null) delete process.env.CODEX_LINUX_WEBVIEW_PORT;
    else process.env.CODEX_LINUX_WEBVIEW_PORT = previousWebviewPort;
    if (previousFallbackWebviewPort == null) delete process.env.CODEX_WEBVIEW_PORT;
    else process.env.CODEX_WEBVIEW_PORT = previousFallbackWebviewPort;
    fs.rmSync(stateRoot, { force: true, recursive: true });
  }
});
