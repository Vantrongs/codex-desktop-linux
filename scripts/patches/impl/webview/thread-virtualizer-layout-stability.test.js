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
  "../../core/all-linux/webview/thread-virtualizer-layout-stability/patch.js"
);
const {
  THREAD_VIRTUALIZER_LAYOUT_MARKER,
  applyLinuxThreadVirtualizerLayoutStabilityPatch,
  hasUnsafeThreadVirtualizerResizeMeasurement,
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

test("thread virtualizer does not flush React updates inside ResizeObserver", () => {
  const source = fixture();
  assert.equal(isThreadVirtualizerLayoutAsset(source), true);
  assert.equal(hasUnsafeThreadVirtualizerResizeMeasurement(source), true);

  const patched = applyLinuxThreadVirtualizerLayoutStabilityPatch(source);
  assert.equal(applyLinuxThreadVirtualizerLayoutStabilityPatch(patched), patched);
  assert.equal(hasUnsafeThreadVirtualizerResizeMeasurement(patched), false);
  assert.equal(patched.split(THREAD_VIRTUALIZER_LAYOUT_MARKER).length - 1, 1);
  assert.match(patched, /q\(t,!1\),n&&ae\(\)/u);
  assert.doesNotMatch(patched, /q\(t\),n&&ae\(\)/u);
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
    fs.writeFileSync(path.join(assetsDir, "conversation-source-fixture.js"), fixture());
    fs.writeFileSync(
      path.join(assetsDir, "conversation-source-decoy.js"),
      fixture().replace("q(t),n&&ae()", "x(t),n&&ae()"),
    );
    const shadowedDecoy = fixture().replace(
      "q(t),n&&ae()",
      "let{update:q}=helpers;q(t),n&&ae()",
    );
    fs.writeFileSync(
      path.join(assetsDir, "conversation-source-shadowed.js"),
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
      path.join(assetsDir, "conversation-source-fixture.js"),
      "utf8",
    );
    assert.match(patched, new RegExp(THREAD_VIRTUALIZER_LAYOUT_MARKER, "u"));
    assert.equal(report.patches[0]?.status, "applied");
    assert.equal(
      report.patches[0]?.assetName,
      "conversation-source-fixture.js",
    );
    assert.doesNotMatch(
      fs.readFileSync(
        path.join(assetsDir, "conversation-source-decoy.js"),
        "utf8",
      ),
      new RegExp(THREAD_VIRTUALIZER_LAYOUT_MARKER, "u"),
    );
    assert.equal(
      fs.readFileSync(
        path.join(assetsDir, "conversation-source-shadowed.js"),
        "utf8",
      ),
      shadowedDecoy,
    );
  } finally {
    fs.rmSync(extractedDir, { force: true, recursive: true });
  }
});

test(
  "current upstream thread virtualizer avoids synchronous observer measurement",
  { skip: process.env.CODEX_WEBVIEW_ASSET == null },
  () => {
    const source = fs.readFileSync(process.env.CODEX_WEBVIEW_ASSET, "utf8");
    assert.equal(isThreadVirtualizerLayoutAsset(source), true);
    assert.equal(hasUnsafeThreadVirtualizerResizeMeasurement(source), true);
    const patched = applyLinuxThreadVirtualizerLayoutStabilityPatch(source);
    assert.equal(hasUnsafeThreadVirtualizerResizeMeasurement(patched), false);
    assert.match(patched, new RegExp(THREAD_VIRTUALIZER_LAYOUT_MARKER, "u"));
  },
);
