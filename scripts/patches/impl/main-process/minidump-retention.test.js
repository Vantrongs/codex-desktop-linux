#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const { createPatchReport } = require("../../../lib/patch-report.js");
const {
  applyExtractedAppPatchDescriptors,
  normalizePatchDescriptors,
} = require("../../engine.js");
const minidumpRetentionDescriptor = require(
  "../../../../linux-features/linux-renderer-crash-diagnostics/patch.js"
).find(({ id }) => id === "linux-renderer-minidump-retention");
const {
  applyLinuxRendererMinidumpRetentionPatch,
} = require("./minidump-retention.js");

function sentryMinidumpFixture() {
  return [
    '"use strict";',
    'var m=require("node:fs"),B={log(){},warn(){},error(){}};',
    "function CR(e){return async(n,r)=>{for(let t of await e())try{B.log(`Found minidump`,t);let e=await m.promises.readFile(t);await r(e)}catch(e){B.error(`Failed to load minidump`,e)}finally{try{await m.promises.unlink(t)}catch{B.warn(`Could not delete minidump`,t)}}}}",
    "var DR={maxMinidumpsPerSession:10,start(){B.log(`Starting Electron crashReporter`),crashReporter.start({uploadToServer:!1})}};",
  ].join("");
}

function evaluateRetentionHelper(source, environment, DateConstructor = Date) {
  const context = {
    Buffer,
    Date: DateConstructor,
    Error,
    console,
    module: { exports: {} },
    process: environment,
    require,
  };
  vm.runInNewContext(
    `${source};module.exports=codexLinuxRetainCrashMinidump;`,
    context,
  );
  return context.module.exports;
}

test("renderer minidump retention keeps a bounded private local copy", async () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codex-minidump-state-"));
  const crashRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codex-minidump-source-"));
  try {
    const patched = applyLinuxRendererMinidumpRetentionPatch(sentryMinidumpFixture());
    assert.match(patched, /codexLinuxRetainCrashMinidump/u);
    assert.match(
      patched,
      /await codexLinuxRetainCrashMinidump\(t\),await m\.promises\.unlink\(t\)/u,
    );
    assert.equal(applyLinuxRendererMinidumpRetentionPatch(patched), patched);

    const retain = evaluateRetentionHelper(patched, {
      env: {
        CODEX_LINUX_APP_ID: "codex-desktop-test",
        HOME: stateRoot,
        XDG_STATE_HOME: stateRoot,
      },
      pid: 4242,
      platform: "linux",
    });
    for (let index = 0; index < 5; index += 1) {
      const sourcePath = path.join(
        crashRoot,
        `00000000-0000-4000-8000-${String(index).padStart(12, "0")}.dmp`,
      );
      fs.writeFileSync(sourcePath, Buffer.alloc(16_384, index));
      await retain(sourcePath);
      assert.equal(fs.existsSync(sourcePath), true, "Sentry still owns source cleanup");
    }

    const retainedDir = path.join(
      stateRoot,
      "codex-desktop-test",
      "crash-minidumps",
    );
    const retainedFiles = fs.readdirSync(retainedDir).sort();
    assert.equal(retainedFiles.length, 3);
    assert.equal(fs.statSync(retainedDir).mode & 0o777, 0o700);
    for (const retainedName of retainedFiles) {
      const retainedPath = path.join(retainedDir, retainedName);
      assert.equal(fs.statSync(retainedPath).mode & 0o777, 0o600);
      assert.equal(fs.statSync(retainedPath).size, 16_384);
    }
  } finally {
    fs.rmSync(stateRoot, { force: true, recursive: true });
    fs.rmSync(crashRoot, { force: true, recursive: true });
  }
});

test("renderer minidump retention rejects non-regular and oversized inputs", async () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codex-minidump-state-"));
  const crashRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codex-minidump-source-"));
  try {
    const retain = evaluateRetentionHelper(
      applyLinuxRendererMinidumpRetentionPatch(sentryMinidumpFixture()),
      {
        env: {
          CODEX_LINUX_APP_ID: "codex-desktop-test",
          XDG_STATE_HOME: stateRoot,
        },
        pid: 4242,
        platform: "linux",
      },
    );
    const regularPath = path.join(
      crashRoot,
      "10000000-0000-4000-8000-000000000000.dmp",
    );
    const symlinkPath = path.join(
      crashRoot,
      "20000000-0000-4000-8000-000000000000.dmp",
    );
    const hardlinkPath = path.join(
      crashRoot,
      "25000000-0000-4000-8000-000000000000.dmp",
    );
    const oversizedPath = path.join(
      crashRoot,
      "30000000-0000-4000-8000-000000000000.dmp",
    );
    fs.writeFileSync(regularPath, Buffer.alloc(16_384));
    fs.symlinkSync(regularPath, symlinkPath);
    fs.linkSync(regularPath, hardlinkPath);
    fs.writeFileSync(oversizedPath, "");
    fs.truncateSync(oversizedPath, 16 * 1024 * 1024 + 1);

    assert.equal(await retain(symlinkPath), null);
    assert.equal(await retain(hardlinkPath), null);
    assert.equal(await retain(oversizedPath), null);
    const retainedDir = path.join(
      stateRoot,
      "codex-desktop-test",
      "crash-minidumps",
    );
    assert.deepEqual(fs.readdirSync(retainedDir), []);
  } finally {
    fs.rmSync(stateRoot, { force: true, recursive: true });
    fs.rmSync(crashRoot, { force: true, recursive: true });
  }
});

test("renderer minidump retention rejects a symlinked source parent", async () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codex-minidump-state-"));
  const crashRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codex-minidump-source-"));
  const linkedRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codex-minidump-link-"));
  try {
    const sourceName = "35000000-0000-4000-8000-000000000000.dmp";
    const sourcePath = path.join(crashRoot, sourceName);
    const linkedParent = path.join(linkedRoot, "crashes");
    fs.writeFileSync(sourcePath, Buffer.alloc(16_384));
    fs.symlinkSync(crashRoot, linkedParent);
    const retain = evaluateRetentionHelper(
      applyLinuxRendererMinidumpRetentionPatch(sentryMinidumpFixture()),
      {
        env: {
          CODEX_LINUX_APP_ID: "codex-desktop-test",
          XDG_STATE_HOME: stateRoot,
        },
        pid: 4242,
        platform: "linux",
      },
    );

    assert.equal(await retain(path.join(linkedParent, sourceName)), null);
    const retainedDir = path.join(
      stateRoot,
      "codex-desktop-test",
      "crash-minidumps",
    );
    assert.deepEqual(fs.readdirSync(retainedDir), []);
  } finally {
    fs.rmSync(stateRoot, { force: true, recursive: true });
    fs.rmSync(crashRoot, { force: true, recursive: true });
    fs.rmSync(linkedRoot, { force: true, recursive: true });
  }
});

test("renderer minidump retention never removes a colliding existing dump", async () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codex-minidump-state-"));
  const crashRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codex-minidump-source-"));
  try {
    const fixedTimestamp = "2026-08-04T12:00:00.000Z";
    class FixedDate extends Date {
      constructor(...argumentsList) {
        super(...(argumentsList.length === 0 ? [fixedTimestamp] : argumentsList));
      }

      static now() {
        return new Date(fixedTimestamp).getTime();
      }
    }
    const environment = {
      env: {
        CODEX_LINUX_APP_ID: "codex-desktop-test",
        XDG_STATE_HOME: stateRoot,
      },
      pid: 4242,
      platform: "linux",
    };
    const retain = evaluateRetentionHelper(
      applyLinuxRendererMinidumpRetentionPatch(sentryMinidumpFixture()),
      environment,
      FixedDate,
    );
    const sourceName = "40000000-0000-4000-8000-000000000000.dmp";
    const sourcePath = path.join(crashRoot, sourceName);
    const retainedDir = path.join(
      stateRoot,
      "codex-desktop-test",
      "crash-minidumps",
    );
    const collisionPath = path.join(
      retainedDir,
      `20260804T120000-000Z-${environment.pid}-${sourceName}`,
    );
    fs.mkdirSync(retainedDir, { recursive: true });
    fs.writeFileSync(sourcePath, Buffer.alloc(16_384, 1));
    const collisionContents = Buffer.alloc(16_384, 2);
    fs.writeFileSync(collisionPath, collisionContents, { mode: 0o600 });

    assert.equal(await retain(sourcePath), null);
    assert.deepEqual(fs.readFileSync(collisionPath), collisionContents);
    assert.equal(fs.existsSync(sourcePath), true);
  } finally {
    fs.rmSync(stateRoot, { force: true, recursive: true });
    fs.rmSync(crashRoot, { force: true, recursive: true });
  }
});

test("renderer minidump retention rejects parent symlinks and dot app identities", async () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codex-minidump-state-"));
  const outsideRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codex-minidump-outside-"));
  const crashRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codex-minidump-source-"));
  try {
    const sourcePath = path.join(
      crashRoot,
      "50000000-0000-4000-8000-000000000000.dmp",
    );
    fs.writeFileSync(sourcePath, Buffer.alloc(16_384));
    fs.symlinkSync(outsideRoot, path.join(stateRoot, "linked-app"));
    const linkedRetain = evaluateRetentionHelper(
      applyLinuxRendererMinidumpRetentionPatch(sentryMinidumpFixture()),
      {
        env: {
          CODEX_LINUX_APP_ID: "linked-app",
          XDG_STATE_HOME: stateRoot,
        },
        pid: 4242,
        platform: "linux",
      },
    );

    assert.equal(await linkedRetain(sourcePath), null);
    assert.deepEqual(fs.readdirSync(outsideRoot), []);

    const dotRetain = evaluateRetentionHelper(
      applyLinuxRendererMinidumpRetentionPatch(sentryMinidumpFixture()),
      {
        env: {
          CODEX_LINUX_APP_ID: "..",
          XDG_STATE_HOME: stateRoot,
        },
        pid: 4343,
        platform: "linux",
      },
    );
    const retainedPath = await dotRetain(sourcePath);
    assert.match(retainedPath ?? "", /codex-desktop\/crash-minidumps/u);
    assert.equal(fs.existsSync(path.join(path.dirname(stateRoot), "crash-minidumps")), false);
  } finally {
    fs.rmSync(stateRoot, { force: true, recursive: true });
    fs.rmSync(outsideRoot, { force: true, recursive: true });
    fs.rmSync(crashRoot, { force: true, recursive: true });
  }
});

test("renderer minidump retention rejects a damaged installed cleanup contract", () => {
  const patched = applyLinuxRendererMinidumpRetentionPatch(sentryMinidumpFixture());
  const damaged = patched.replace(
    ",await m.promises.unlink(t)",
    "",
  );
  assert.notEqual(damaged, patched);
  assert.throws(
    () => applyLinuxRendererMinidumpRetentionPatch(damaged),
    /partial Linux renderer minidump retention markers/u,
  );
});

function applyMinidumpRetentionDescriptor(extractedDir) {
  const report = createPatchReport();
  applyExtractedAppPatchDescriptors(
    extractedDir,
    normalizePatchDescriptors([minidumpRetentionDescriptor]),
    {},
    report,
    "extracted-app:pre-webview",
  );
  return report;
}

test("renderer minidump retention descriptor patches the unique Sentry chunk", () => {
  const extractedDir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-minidump-bundle-"));
  try {
    const buildDir = path.join(extractedDir, ".vite", "build");
    const chunkPath = path.join(buildDir, "window-all-closed-fixture.js");
    fs.mkdirSync(buildDir, { recursive: true });
    fs.writeFileSync(chunkPath, sentryMinidumpFixture());
    fs.writeFileSync(path.join(buildDir, "unrelated.js"), '"use strict";');

    const report = applyMinidumpRetentionDescriptor(extractedDir);
    const patched = fs.readFileSync(chunkPath, "utf8");
    assert.equal(report.patches[0]?.status, "applied");
    assert.match(patched, /codexLinuxRetainCrashMinidump/u);

    const secondReport = applyMinidumpRetentionDescriptor(extractedDir);
    assert.equal(secondReport.patches[0]?.status, "already-applied");
    assert.equal(fs.readFileSync(chunkPath, "utf8"), patched);
  } finally {
    fs.rmSync(extractedDir, { force: true, recursive: true });
  }
});

test("renderer minidump retention descriptor rejects a symlinked patch asset", () => {
  const extractedDir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-minidump-bundle-"));
  const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-minidump-outside-"));
  try {
    const buildDir = path.join(extractedDir, ".vite", "build");
    const outsidePath = path.join(outsideDir, "window-all-closed-outside.js");
    const original = sentryMinidumpFixture();
    fs.mkdirSync(buildDir, { recursive: true });
    fs.writeFileSync(outsidePath, original);
    fs.symlinkSync(
      outsidePath,
      path.join(buildDir, "window-all-closed-symlink.js"),
    );
    fs.linkSync(
      outsidePath,
      path.join(buildDir, "window-all-closed-hardlink.js"),
    );

    const report = applyMinidumpRetentionDescriptor(extractedDir);
    assert.equal(report.patches[0]?.status, "failed-required");
    assert.equal(fs.readFileSync(outsidePath, "utf8"), original);
  } finally {
    fs.rmSync(extractedDir, { force: true, recursive: true });
    fs.rmSync(outsideDir, { force: true, recursive: true });
  }
});

test("renderer minidump retention descriptor rejects a symlinked build directory", () => {
  const extractedDir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-minidump-bundle-"));
  const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-minidump-outside-"));
  try {
    const viteDir = path.join(extractedDir, ".vite");
    const outsidePath = path.join(outsideDir, "window-all-closed-outside.js");
    const original = sentryMinidumpFixture();
    fs.mkdirSync(viteDir);
    fs.writeFileSync(outsidePath, original);
    fs.symlinkSync(outsideDir, path.join(viteDir, "build"));

    const report = applyMinidumpRetentionDescriptor(extractedDir);
    assert.equal(report.patches[0]?.status, "failed-required");
    assert.equal(fs.readFileSync(outsidePath, "utf8"), original);
  } finally {
    fs.rmSync(extractedDir, { force: true, recursive: true });
    fs.rmSync(outsideDir, { force: true, recursive: true });
  }
});

test("renderer minidump retention descriptor fails required on upstream drift", () => {
  const extractedDir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-minidump-drift-"));
  try {
    const buildDir = path.join(extractedDir, ".vite", "build");
    fs.mkdirSync(buildDir, { recursive: true });
    fs.writeFileSync(
      path.join(buildDir, "window-all-closed-drift.js"),
      '"use strict";var sentry={maxMinidumpsPerSession:10};',
    );

    const report = applyMinidumpRetentionDescriptor(extractedDir);
    assert.equal(report.patches[0]?.status, "failed-required");
    assert.match(report.patches[0]?.reason ?? "", /no Sentry minidump chunk/u);
  } finally {
    fs.rmSync(extractedDir, { force: true, recursive: true });
  }
});
