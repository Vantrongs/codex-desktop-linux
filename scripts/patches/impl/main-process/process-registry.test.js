#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const fsPromises = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const { createPatchReport } = require("../../../lib/patch-report.js");
const {
  applyExtractedAppPatchDescriptors,
  normalizePatchDescriptors,
} = require("../../engine.js");
const processRegistryDescriptor = require(
  "../../core/all-linux/extracted-app/process-registry/patch.js"
);
const {
  applyLinuxProcessRegistryDurabilityPatch,
} = require("./process-registry.js");

function processRegistryBundleFixture() {
  return [
    '"use strict";',
    'var l=require("node:fs/promises"),i=require("node:path");',
    "var eX={safeParse(e){return Array.isArray(e)?{success:!0,data:e}:{success:!1}}};",
    "function Ig(e){return e}",
    "var YY=i.default.join(`process_manager`,`chat_processes.json`);",
    "function cX(e){return i.default.join(e,YY)}",
    "async function nX(e){try{let t=await(0,l.readFile)(cX(e),`utf8`),n=eX.safeParse(JSON.parse(t));return n.success?n.data.map(e=>({...e,conversationId:Ig(e.conversationId),osPid:e.osPid??null})):[]}catch(e){if(e instanceof Error&&`code`in e&&e.code===`ENOENT`)return[];throw e}}",
    "async function lX(e,t){let n=cX(e);await(0,l.mkdir)(i.default.dirname(n),{recursive:!0}),await(0,l.writeFile)(n,JSON.stringify(t,null,2),`utf8`)}",
  ].join("");
}

function evaluateRegistry(source, fsPromisesOverride = fsPromises) {
  const context = {
    Date,
    Error,
    JSON,
    SyntaxError,
    console,
    module: { exports: {} },
    process: { pid: process.pid, platform: "linux" },
    require(moduleName) {
      if (moduleName === "node:fs/promises") return fsPromisesOverride;
      if (moduleName === "node:path") return { default: path };
      return require(moduleName);
    },
  };
  vm.runInNewContext(`${source};module.exports={load:nX,save:lX};`, context);
  return context.module.exports;
}

function registryPath(codexHome) {
  return path.join(codexHome, "process_manager", "chat_processes.json");
}

test("current process registry loader reproduces the empty-file failure", async () => {
  const codexHome = fs.mkdtempSync(path.join(os.tmpdir(), "codex-process-registry-red-"));
  try {
    fs.mkdirSync(path.dirname(registryPath(codexHome)), { recursive: true });
    fs.writeFileSync(registryPath(codexHome), "");
    const registry = evaluateRegistry(processRegistryBundleFixture());

    await assert.rejects(registry.load(codexHome), /Unexpected end of JSON input/u);
  } finally {
    fs.rmSync(codexHome, { recursive: true, force: true });
  }
});

test("process registry patch preserves unreadable state and recovers on the next write", async () => {
  const codexHome = fs.mkdtempSync(path.join(os.tmpdir(), "codex-process-registry-recovery-"));
  try {
    const statePath = registryPath(codexHome);
    fs.mkdirSync(path.dirname(statePath), { recursive: true });
    fs.writeFileSync(statePath, "");
    const patched = applyLinuxProcessRegistryDurabilityPatch(processRegistryBundleFixture());
    const registry = evaluateRegistry(patched);

    assert.deepEqual(Array.from(await registry.load(codexHome)), []);
    const recoveryFiles = fs
      .readdirSync(path.dirname(statePath))
      .filter((name) => name.startsWith("chat_processes.json.corrupt-"));
    assert.equal(recoveryFiles.length, 1);
    assert.equal(
      fs.readFileSync(path.join(path.dirname(statePath), recoveryFiles[0]), "utf8"),
      "",
    );
    assert.equal(fs.existsSync(statePath), false);

    const records = [{ conversationId: "thread-a", id: "record-a", osPid: 42 }];
    await registry.save(codexHome, records);
    assert.deepEqual(JSON.parse(fs.readFileSync(statePath, "utf8")), records);
    assert.equal(fs.statSync(statePath).mode & 0o777, 0o600);
    assert.deepEqual(
      fs.readdirSync(path.dirname(statePath)).filter((name) => name.includes(".tmp-")),
      [],
    );
    assert.equal(applyLinuxProcessRegistryDurabilityPatch(patched), patched);
  } finally {
    fs.rmSync(codexHome, { recursive: true, force: true });
  }
});

test("process registry patch preserves malformed JSON before recovering", async () => {
  const codexHome = fs.mkdtempSync(path.join(os.tmpdir(), "codex-process-registry-corrupt-"));
  try {
    const statePath = registryPath(codexHome);
    const malformed = "{not-json";
    fs.mkdirSync(path.dirname(statePath), { recursive: true });
    fs.writeFileSync(statePath, malformed);
    const registry = evaluateRegistry(
      applyLinuxProcessRegistryDurabilityPatch(processRegistryBundleFixture()),
    );

    assert.deepEqual(Array.from(await registry.load(codexHome)), []);
    const recoveryFiles = fs
      .readdirSync(path.dirname(statePath))
      .filter((name) => name.startsWith("chat_processes.json.corrupt-"));
    assert.equal(recoveryFiles.length, 1);
    assert.equal(
      fs.readFileSync(path.join(path.dirname(statePath), recoveryFiles[0]), "utf8"),
      malformed,
    );
  } finally {
    fs.rmSync(codexHome, { recursive: true, force: true });
  }
});

test("process registry patch preserves schema-invalid JSON before recovering", async () => {
  const codexHome = fs.mkdtempSync(path.join(os.tmpdir(), "codex-process-registry-schema-"));
  try {
    const statePath = registryPath(codexHome);
    const invalidSchema = JSON.stringify({ records: [] });
    fs.mkdirSync(path.dirname(statePath), { recursive: true });
    fs.writeFileSync(statePath, invalidSchema);
    const registry = evaluateRegistry(
      applyLinuxProcessRegistryDurabilityPatch(processRegistryBundleFixture()),
    );

    assert.deepEqual(Array.from(await registry.load(codexHome)), []);
    const recoveryFiles = fs
      .readdirSync(path.dirname(statePath))
      .filter((name) => name.startsWith("chat_processes.json.corrupt-"));
    assert.equal(recoveryFiles.length, 1);
    assert.equal(
      fs.readFileSync(path.join(path.dirname(statePath), recoveryFiles[0]), "utf8"),
      invalidSchema,
    );
    assert.equal(fs.existsSync(statePath), false);
  } finally {
    fs.rmSync(codexHome, { recursive: true, force: true });
  }
});

test("atomic process registry write leaves the previous file intact after ENOSPC", async () => {
  const codexHome = fs.mkdtempSync(path.join(os.tmpdir(), "codex-process-registry-enospc-"));
  try {
    const statePath = registryPath(codexHome);
    const previous = JSON.stringify([{ id: "previous" }], null, 2);
    fs.mkdirSync(path.dirname(statePath), { recursive: true });
    fs.writeFileSync(statePath, previous);

    const failingFsPromises = {
      ...fsPromises,
      async writeFile(filePath, contents, options) {
        await fsPromises.writeFile(filePath, "", options);
        const error = new Error("no space left on device");
        error.code = "ENOSPC";
        throw error;
      },
    };

    const unpatchedRegistry = evaluateRegistry(processRegistryBundleFixture(), failingFsPromises);
    await assert.rejects(unpatchedRegistry.save(codexHome, [{ id: "next" }]), {
      code: "ENOSPC",
    });
    assert.equal(fs.readFileSync(statePath, "utf8"), "");

    fs.writeFileSync(statePath, previous);
    const patchedRegistry = evaluateRegistry(
      applyLinuxProcessRegistryDurabilityPatch(processRegistryBundleFixture()),
      failingFsPromises,
    );
    await assert.rejects(patchedRegistry.save(codexHome, [{ id: "next" }]), {
      code: "ENOSPC",
    });
    assert.equal(fs.readFileSync(statePath, "utf8"), previous);
    assert.deepEqual(
      fs.readdirSync(path.dirname(statePath)).filter((name) => name.includes(".tmp-")),
      [],
    );
  } finally {
    fs.rmSync(codexHome, { recursive: true, force: true });
  }
});

function applyProcessRegistryDescriptor(extractedDir) {
  const report = createPatchReport();
  applyExtractedAppPatchDescriptors(
    extractedDir,
    normalizePatchDescriptors([processRegistryDescriptor]),
    {},
    report,
    "extracted-app:pre-webview",
  );
  return report;
}

test("process registry descriptor patches the unique non-main build chunk", () => {
  const extractedDir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-process-registry-bundle-"));
  try {
    const buildDir = path.join(extractedDir, ".vite", "build");
    const mainPath = path.join(buildDir, "main-current.js");
    const registryChunkPath = path.join(buildDir, "src-current.js");
    const workerPath = path.join(buildDir, "worker.js");
    const snapshotWorkerPath = path.join(buildDir, "child-process-snapshot-worker.js");
    fs.mkdirSync(buildDir, { recursive: true });
    fs.writeFileSync(mainPath, '"use strict";var main=!0;');
    fs.writeFileSync(registryChunkPath, processRegistryBundleFixture());
    fs.writeFileSync(workerPath, '"use strict";var state=`chat_processes.json`;');
    fs.writeFileSync(snapshotWorkerPath, '"use strict";var snapshot=`chat_processes.json`;');

    const firstReport = applyProcessRegistryDescriptor(extractedDir);
    const patched = fs.readFileSync(registryChunkPath, "utf8");
    assert.equal(fs.readFileSync(mainPath, "utf8"), '"use strict";var main=!0;');
    assert.equal(fs.readFileSync(workerPath, "utf8"), '"use strict";var state=`chat_processes.json`;');
    assert.equal(
      fs.readFileSync(snapshotWorkerPath, "utf8"),
      '"use strict";var snapshot=`chat_processes.json`;',
    );
    assert.match(patched, /codexLinuxReadProcessRegistry/u);
    assert.match(patched, /codexLinuxAtomicWriteProcessRegistry/u);
    assert.equal(firstReport.patches[0]?.status, "applied");

    const secondReport = applyProcessRegistryDescriptor(extractedDir);
    assert.equal(fs.readFileSync(registryChunkPath, "utf8"), patched);
    assert.equal(secondReport.patches[0]?.status, "already-applied");
  } finally {
    fs.rmSync(extractedDir, { recursive: true, force: true });
  }
});

test("process registry descriptor reports required drift when the chunk is absent", () => {
  const extractedDir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-process-registry-missing-"));
  try {
    const buildDir = path.join(extractedDir, ".vite", "build");
    fs.mkdirSync(buildDir, { recursive: true });
    fs.writeFileSync(path.join(buildDir, "main-current.js"), '"use strict";var main=!0;');

    const report = applyProcessRegistryDescriptor(extractedDir);
    assert.equal(report.patches[0]?.status, "failed-required");
  } finally {
    fs.rmSync(extractedDir, { recursive: true, force: true });
  }
});
