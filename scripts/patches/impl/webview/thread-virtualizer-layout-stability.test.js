"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { createPatchReport } = require("../../../lib/patch-report.js");
const {
  applyWebviewAssetPatchDescriptors,
  normalizePatchDescriptors,
} = require("../../engine.js");
const layoutStabilityDescriptors = require(
  "../../../../linux-features/linux-performance-workarounds/patch.js"
).filter(({ id }) => id === "linux-thread-virtualizer-layout-stability");
const {
  INSTALLED_DEFERRED_WORK_PATTERN,
  LEGACY_THREAD_VIRTUALIZER_LAYOUT_MARKER,
  THREAD_VIRTUALIZER_LAYOUT_MARKER,
  applyLinuxThreadVirtualizerLayoutStabilityPatch,
  hasUnsafeThreadVirtualizerResizeWork,
  isThreadVirtualizerLayoutAsset,
} = require("./thread-virtualizer-layout-stability.js");

function fixture() {
  return [
    "function Ce({entries:e,RowComponent:t,preserveMeasuredTurnViewport:c=!1,latestTurnSynchronousMeasurementKey:g}){",
    "let q=T((t,n=!0)=>{let F=()=>{k.current=s,b(s)};return n?(0,Ie.flushSync)(F):F(),!0}),",
    "oe=T(()=>{if(L.current!=null)return L.current;let e=new ResizeObserver(e=>{let t=new Map,n=!1;for(let r of e){let e=j.current.get(r.target);if(e==null)continue;switch(e.kind){case`turn`:t.set(e.turnKey,{element:r.target,heightPx:1});break;case`latest-turn-follow-content`:n=!0;break}}q(t),n&&ae()});return L.current=e,e});",
    "return _.preserveScrollPositionForNextLayout()}",
  ].join("");
}

function reactCompilerFixture() {
  return [
    "function Oe(e){",
    "let t=(0,He.c)(47),{entries:n,latestTurnSynchronousMeasurementKey:b}=e;",
    "let Me=(e,t)=>{let r=t===void 0||t,j=()=>{};return r?(0,Ue.flushSync)(j):j(),!0},J=o(Me),",
    "Xe=()=>{let e=new ResizeObserver(e=>{let t=new Map,n=!1;for(let r of e){switch(r.kind){case`turn`:t.set(r.key,r);break;case`latest-turn-follow-content`:n=!0}}J(t),n&&ke()});return e};",
    "return C.preserveScrollPositionForNextLayout()}",
  ].join("");
}

test("thread virtualizer defers layout-affecting work outside ResizeObserver", () => {
  const source = fixture();
  assert.equal(isThreadVirtualizerLayoutAsset(source), true);
  assert.equal(hasUnsafeThreadVirtualizerResizeWork(source), true);

  const patched = applyLinuxThreadVirtualizerLayoutStabilityPatch(source);
  assert.equal(applyLinuxThreadVirtualizerLayoutStabilityPatch(patched), patched);
  assert.equal(hasUnsafeThreadVirtualizerResizeWork(patched), false);
  assert.equal(patched.split(THREAD_VIRTUALIZER_LAYOUT_MARKER).length - 1, 1);
  assert.match(
    patched,
    /window\.requestAnimationFrame\(\(\)=>\{q\(t\),n&&ae\(\)\}\)/u,
  );
  assert.doesNotMatch(
    patched,
    /new ResizeObserver\([^;]+\}q\(t\),n&&ae\(\)\}\)/u,
  );
  assert.doesNotMatch(patched, /q\(t,!1\),n&&ae\(\)/u);
});

test("thread virtualizer accepts React compiler cached updater wrappers", () => {
  const source = reactCompilerFixture();
  assert.equal(isThreadVirtualizerLayoutAsset(source), true);
  assert.equal(hasUnsafeThreadVirtualizerResizeWork(source), true);

  const patched = applyLinuxThreadVirtualizerLayoutStabilityPatch(source);
  assert.equal(hasUnsafeThreadVirtualizerResizeWork(patched), false);
  assert.match(
    patched,
    /window\.requestAnimationFrame\(\(\)=>\{J\(t\),n&&ke\(\)\}\)/u,
  );
});

test("deferred follow work observes the committed turn measurement", () => {
  const patched = applyLinuxThreadVirtualizerLayoutStabilityPatch(fixture());
  const deferredBlock = patched.match(
    /window\.requestAnimationFrame\(\(\)=>\{q\(t(?:,!1)?\),n&&ae\(\)\}\)/u,
  )?.[0];
  assert.ok(deferredBlock);

  const events = [];
  let frameCallback = null;
  let measurementCommitted = false;
  const execute = new Function("window", "q", "t", "n", "ae", deferredBlock);
  execute(
    {
      requestAnimationFrame(callback) {
        frameCallback = callback;
      },
    },
    (_measurements, synchronous = true) => {
      if (synchronous) {
        measurementCommitted = true;
        events.push("commit");
      } else {
        events.push("queued");
      }
    },
    new Map(),
    true,
    () => events.push(measurementCommitted ? "follow:committed" : "follow:stale"),
  );

  assert.deepEqual(events, []);
  assert.ok(frameCallback);
  frameCallback();
  assert.deepEqual(events, ["commit", "follow:committed"]);
});

test("thread virtualizer upgrades the previous complete patch output", () => {
  const previous =
    `void\`${LEGACY_THREAD_VIRTUALIZER_LAYOUT_MARKER}\`;` +
    fixture().replace("q(t),n&&ae()", "q(t,!1),n&&ae()");

  assert.equal(isThreadVirtualizerLayoutAsset(previous), true);
  assert.equal(hasUnsafeThreadVirtualizerResizeWork(previous), true);

  const patched = applyLinuxThreadVirtualizerLayoutStabilityPatch(previous);
  assert.equal(applyLinuxThreadVirtualizerLayoutStabilityPatch(patched), patched);
  assert.equal(patched.includes(LEGACY_THREAD_VIRTUALIZER_LAYOUT_MARKER), false);
  assert.equal(patched.split(THREAD_VIRTUALIZER_LAYOUT_MARKER).length - 1, 1);
  assert.match(
    patched,
    /window\.requestAnimationFrame\(\(\)=>\{q\(t\),n&&ae\(\)\}\)/u,
  );
});

test("thread virtualizer descriptor upgrades the previous patch atomically", () => {
  const extractedDir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-thread-upgrade-"));
  try {
    const assetsDir = path.join(extractedDir, "webview", "assets");
    const assetPath = path.join(assetsDir, "open-sources-side-panel-tab-previous.js");
    fs.mkdirSync(assetsDir, { recursive: true });
    fs.writeFileSync(
      assetPath,
      `void\`${LEGACY_THREAD_VIRTUALIZER_LAYOUT_MARKER}\`;` +
        fixture().replace("q(t),n&&ae()", "q(t,!1),n&&ae()"),
    );

    const firstReport = createPatchReport();
    applyWebviewAssetPatchDescriptors(
      extractedDir,
      normalizePatchDescriptors(layoutStabilityDescriptors),
      {},
      firstReport,
    );

    const upgraded = fs.readFileSync(assetPath, "utf8");
    assert.equal(firstReport.patches[0]?.status, "applied");
    assert.equal(upgraded.includes(LEGACY_THREAD_VIRTUALIZER_LAYOUT_MARKER), false);
    assert.equal(upgraded.split(THREAD_VIRTUALIZER_LAYOUT_MARKER).length - 1, 1);
    assert.match(
      upgraded,
      /window\.requestAnimationFrame\(\(\)=>\{q\(t\),n&&ae\(\)\}\)/u,
    );

    const secondReport = createPatchReport();
    applyWebviewAssetPatchDescriptors(
      extractedDir,
      normalizePatchDescriptors(layoutStabilityDescriptors),
      {},
      secondReport,
    );
    assert.equal(secondReport.patches[0]?.status, "already-applied");
    assert.equal(fs.readFileSync(assetPath, "utf8"), upgraded);
  } finally {
    fs.rmSync(extractedDir, { force: true, recursive: true });
  }
});

test("thread virtualizer layout patch rejects an uncorrelated observer", () => {
  const decoy = fixture().replace(
    "q(t),n&&ae()",
    "x(t),n&&ae()",
  );
  assert.equal(isThreadVirtualizerLayoutAsset(decoy), false);
  assert.throws(
    () => applyLinuxThreadVirtualizerLayoutStabilityPatch(decoy),
    /unique thread virtualizer component/u,
  );
});

test("thread virtualizer layout patch rejects observer-local updater shadowing", () => {
  const localBindings = [
    "let q=()=>!1;",
    "let{update:q}=helpers;",
    "let[q]=helpers;",
    "for(var q of helpers)void q;",
  ];
  for (const localBinding of localBindings) {
    const shadowed = fixture().replace(
      "q(t),n&&ae()",
      `${localBinding}q(t),n&&ae()`,
    );
    assert.equal(isThreadVirtualizerLayoutAsset(shadowed), false, localBinding);
    assert.throws(
      () => applyLinuxThreadVirtualizerLayoutStabilityPatch(shadowed),
      /unique thread virtualizer component/u,
      localBinding,
    );
  }
});

test("thread virtualizer layout descriptor selects one semantic asset", () => {
  const extractedDir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-thread-layout-"));
  try {
    const assetsDir = path.join(extractedDir, "webview", "assets");
    fs.mkdirSync(assetsDir, { recursive: true });
    fs.writeFileSync(path.join(assetsDir, "open-sources-side-panel-tab-fixture.js"), fixture());
    fs.writeFileSync(
      path.join(assetsDir, "open-sources-side-panel-tab-decoy.js"),
      fixture().replace("q(t),n&&ae()", "x(t),n&&ae()"),
    );
    const shadowedDecoy = fixture().replace(
      "q(t),n&&ae()",
      "let{update:q}=helpers;q(t),n&&ae()",
    );
    fs.writeFileSync(
      path.join(assetsDir, "open-sources-side-panel-tab-shadowed.js"),
      shadowedDecoy,
    );
    const report = createPatchReport();

    applyWebviewAssetPatchDescriptors(
      extractedDir,
      normalizePatchDescriptors(layoutStabilityDescriptors),
      {},
      report,
    );

    const patched = fs.readFileSync(
      path.join(assetsDir, "open-sources-side-panel-tab-fixture.js"),
      "utf8",
    );
    assert.match(patched, new RegExp(THREAD_VIRTUALIZER_LAYOUT_MARKER, "u"));
    assert.equal(report.patches[0]?.status, "applied");
    assert.equal(
      report.patches[0]?.assetName,
      "open-sources-side-panel-tab-fixture.js",
    );
    assert.doesNotMatch(
      fs.readFileSync(
        path.join(assetsDir, "open-sources-side-panel-tab-decoy.js"),
        "utf8",
      ),
      new RegExp(THREAD_VIRTUALIZER_LAYOUT_MARKER, "u"),
    );
    assert.equal(
      fs.readFileSync(
        path.join(assetsDir, "open-sources-side-panel-tab-shadowed.js"),
        "utf8",
      ),
      shadowedDecoy,
    );
  } finally {
    fs.rmSync(extractedDir, { force: true, recursive: true });
  }
});

test("thread virtualizer layout descriptor accepts the current conversation source asset", () => {
  const extractedDir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-thread-source-"));
  try {
    const assetsDir = path.join(extractedDir, "webview", "assets");
    const assetPath = path.join(assetsDir, "conversation-source-current.js");
    fs.mkdirSync(assetsDir, { recursive: true });
    fs.writeFileSync(assetPath, fixture());
    const report = createPatchReport();

    applyWebviewAssetPatchDescriptors(
      extractedDir,
      normalizePatchDescriptors(layoutStabilityDescriptors),
      {},
      report,
    );

    assert.equal(report.patches[0]?.status, "applied");
    assert.equal(report.patches[0]?.assetName, "conversation-source-current.js");
    assert.match(
      fs.readFileSync(assetPath, "utf8"),
      new RegExp(THREAD_VIRTUALIZER_LAYOUT_MARKER, "u"),
    );
  } finally {
    fs.rmSync(extractedDir, { force: true, recursive: true });
  }
});

test("thread virtualizer layout descriptor accepts the current virtualized turn list asset", () => {
  const extractedDir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-thread-list-"));
  try {
    const assetsDir = path.join(extractedDir, "webview", "assets");
    const assetPath = path.join(assetsDir, "virtualized-turn-list-current.js");
    fs.mkdirSync(assetsDir, { recursive: true });
    fs.writeFileSync(assetPath, fixture());
    const report = createPatchReport();

    applyWebviewAssetPatchDescriptors(
      extractedDir,
      normalizePatchDescriptors(layoutStabilityDescriptors),
      {},
      report,
    );

    assert.equal(report.patches[0]?.status, "applied");
    assert.equal(report.patches[0]?.assetName, "virtualized-turn-list-current.js");
    assert.match(
      fs.readFileSync(assetPath, "utf8"),
      new RegExp(THREAD_VIRTUALIZER_LAYOUT_MARKER, "u"),
    );
  } finally {
    fs.rmSync(extractedDir, { force: true, recursive: true });
  }
});

test("thread virtualizer layout patch rejects marker-only partial state", () => {
  assert.throws(
    () => applyLinuxThreadVirtualizerLayoutStabilityPatch(
      `void\`${THREAD_VIRTUALIZER_LAYOUT_MARKER}\`;function unrelated(){}`,
    ),
    /partial thread virtualizer layout stability markers/u,
  );
});

test("thread virtualizer rejects restored synchronous work beside the installed RAF", () => {
  const patched = applyLinuxThreadVirtualizerLayoutStabilityPatch(fixture());
  const deferred = patched.match(INSTALLED_DEFERRED_WORK_PATTERN)?.[0];
  assert.ok(deferred);
  const synchronous = deferred
    .replace("window.requestAnimationFrame(()=>{", "")
    .replace(/\}\)$/u, "");
  const damaged = patched.replace(deferred, `${synchronous},${deferred}`);

  assert.equal(hasUnsafeThreadVirtualizerResizeWork(damaged), true);
  assert.throws(
    () => applyLinuxThreadVirtualizerLayoutStabilityPatch(damaged),
    /partial thread virtualizer layout stability markers/u,
  );
});

test("thread virtualizer rejects semicolon-form synchronous work beside the installed RAF", () => {
  const patched = applyLinuxThreadVirtualizerLayoutStabilityPatch(fixture());
  const deferred = patched.match(INSTALLED_DEFERRED_WORK_PATTERN)?.[0];
  assert.ok(deferred);
  const synchronous = deferred
    .replace("window.requestAnimationFrame(()=>{", "")
    .replace(/,/, ";")
    .replace(/\}\)$/u, ";");
  const damaged = patched.replace(deferred, `${synchronous}${deferred}`);

  assert.equal(hasUnsafeThreadVirtualizerResizeWork(damaged), true);
  assert.throws(
    () => applyLinuxThreadVirtualizerLayoutStabilityPatch(damaged),
    /partial thread virtualizer layout stability markers/u,
  );
});

test(
  "current upstream thread virtualizer avoids synchronous observer work",
  { skip: process.env.CODEX_WEBVIEW_ASSET == null },
  () => {
    const source = fs.readFileSync(process.env.CODEX_WEBVIEW_ASSET, "utf8");
    assert.equal(isThreadVirtualizerLayoutAsset(source), true);
    assert.equal(hasUnsafeThreadVirtualizerResizeWork(source), true);
    const patched = applyLinuxThreadVirtualizerLayoutStabilityPatch(source);
    assert.equal(hasUnsafeThreadVirtualizerResizeWork(patched), false);
    assert.match(patched, new RegExp(THREAD_VIRTUALIZER_LAYOUT_MARKER, "u"));
  },
);
