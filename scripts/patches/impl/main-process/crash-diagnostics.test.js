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

test("renderer crash diagnostics write one private JSONL record", () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codex-renderer-crash-state-"));
  const previousStateHome = process.env.XDG_STATE_HOME;
  const previousAppId = process.env.CODEX_LINUX_APP_ID;
  try {
    process.env.XDG_STATE_HOME = stateRoot;
    process.env.CODEX_LINUX_APP_ID = "codex-desktop-test";

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

    listeners.get("render-process-gone")(
      {},
      { id: 7, getOSProcessId: () => 4242 },
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
    assert.equal(fs.statSync(logFile).mode & 0o777, 0o600);
    assert.equal(warnings.length, 1);
    assert.equal(warnings[0].message, "Linux renderer process gone");
    assert.equal(warnings[0].details.safe.rendererPid, 4242);
  } finally {
    if (previousStateHome == null) delete process.env.XDG_STATE_HOME;
    else process.env.XDG_STATE_HOME = previousStateHome;
    if (previousAppId == null) delete process.env.CODEX_LINUX_APP_ID;
    else process.env.CODEX_LINUX_APP_ID = previousAppId;
    fs.rmSync(stateRoot, { force: true, recursive: true });
  }
});
