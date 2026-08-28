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
).filter(({ id }) => id === "linux-agent-activity-layout-stability");
const {
  AGENT_ACTIVITY_LAYOUT_MARKER,
  applyLinuxAgentActivityLayoutStabilityPatch,
  hasUnsafeAgentActivityLayout,
  isAgentActivityLayoutAsset,
} = require("./agent-activity-layout-stability.js");

function fixture() {
  return [
    "function RKc(e){",
    "let t=(0,UKc.c)(35),{summary:n,summaryKey:r,summaryTransition:i,shouldAnimateInitialCollapse:a,canExpand:o,defaultExpanded:s,icon:c,onExpand:l,children:u}=e,",
    "d=i===void 0?`static`:i,f=o===void 0?!0:o,p=s===void 0?!1:s,m;",
    "t[0]!==f||t[1]!==p||t[2]!==a?(m=()=>f?p?`expanded`:a?`closing`:`collapsed`:`collapsed`,t[0]=f,t[1]=p,t[2]=a,t[3]=m):m=t[3];",
    "let[h,g]=(0,WKc.useState)(m),_=h===`opening`||h===`expanded`,v=h===`expanded`,y;",
    "t[4]!==h||t[5]!==_||t[6]!==l?(y=()=>{if(_){g(`closing`);return}if(l?.(),h===`closing`){g(`expanded`);return}g(`opening`),requestAnimationFrame(()=>{g(BKc)})},t[4]=h,t[5]=_,t[6]=l,t[7]=y):y=t[7];",
    "let b=y,w;",
    "t[13]!==f||t[14]!==u||t[15]!==h||t[16]!==v?(w=f&&h!==`collapsed`?(0,D4.jsx)(nf.div,{initial:!1,animate:v?{opacity:1,height:`auto`}:{opacity:0,height:0},transition:Zk,style:{overflow:`hidden`,pointerEvents:v?`auto`:`none`},onAnimationComplete:()=>{g(zKc)},children:u}):null,t[13]=f,t[14]=u,t[15]=h,t[16]=v,t[17]=w):w=t[17];",
    "return w}",
    "function zKc(e){return e===`closing`?`collapsed`:e}",
    "function BKc(e){return e===`opening`?`expanded`:e}",
  ].join("");
}

function uncorrelatedFixture() {
  return fixture().replace(
    "w=f&&h!==`collapsed`?(0,D4.jsx)(nf.div,{initial:!1,animate:v?{opacity:1,height:`auto`}:{opacity:0,height:0},transition:Zk,style:{overflow:`hidden`,pointerEvents:v?`auto`:`none`},onAnimationComplete:()=>{g(zKc)},children:u})",
    "w=q&&x!==`collapsed`?(0,D4.jsx)(nf.div,{initial:!1,animate:r?{opacity:1,height:`auto`}:{opacity:0,height:0},transition:Zk,style:{overflow:`hidden`,pointerEvents:r?`auto`:`none`},onAnimationComplete:()=>{j(zKc)},children:k})",
  );
}

function lazyChildrenFixture() {
  return fixture()
    .replace(
      "m=()=>f?p?`expanded`:a?`closing`:`collapsed`:`collapsed`",
      "m=()=>f?p?`expanded`:a&&typeof u!=`function`?`closing`:`collapsed`:`collapsed`",
    )
    .replace("children:u}):null", "children:typeof u==`function`?u():u}):null");
}

function currentFixture() {
  return lazyChildrenFixture().replace(
    "nf.div,{initial:!1,",
    "nf.div,{className:`-ms-2 ps-2`,initial:!1,",
  );
}

test("agent activity disclosure uses a discrete transition without layout measurement", () => {
  const source = fixture();
  assert.equal(isAgentActivityLayoutAsset(source), true);

  const patched = applyLinuxAgentActivityLayoutStabilityPatch(source);
  assert.equal(applyLinuxAgentActivityLayoutStabilityPatch(patched), patched);
  assert.equal(hasUnsafeAgentActivityLayout(patched), false);
  assert.equal(patched.split(AGENT_ACTIVITY_LAYOUT_MARKER).length - 1, 1);
  assert.doesNotMatch(patched, /height:`auto`|requestAnimationFrame\(\(\)=>\{g\(BKc\)\}\)/u);
  assert.match(patched, /m=\(\)=>f&&p\?`expanded`:`collapsed`/u);
  assert.match(patched, /y=\(\)=>\{if\(_\)\{g\(`collapsed`\);return\}l\?\.\(\),g\(`expanded`\)\}/u);
  assert.match(
    patched,
    /w=f&&v\?\(0,D4\.jsx\)\(`div`,\{style:\{overflow:`hidden`\},children:u\}\):null/u,
  );
});

test("agent activity disclosure accepts React compiler boolean default forms", () => {
  const source = fixture()
    .replace("f=o===void 0?!0:o", "f=o===void 0||o")
    .replace("p=s===void 0?!1:s", "p=s!==void 0&&s");

  assert.equal(isAgentActivityLayoutAsset(source), true);
  const patched = applyLinuxAgentActivityLayoutStabilityPatch(source);
  assert.equal(hasUnsafeAgentActivityLayout(patched), false);
  assert.doesNotMatch(patched, /height:`auto`/u);
});

test("agent activity disclosure preserves lazy body evaluation", () => {
  const source = lazyChildrenFixture();
  assert.equal(isAgentActivityLayoutAsset(source), true);

  const patched = applyLinuxAgentActivityLayoutStabilityPatch(source);
  assert.equal(hasUnsafeAgentActivityLayout(patched), false);
  assert.match(
    patched,
    /w=f&&v\?\(0,D4\.jsx\)\(`div`,\{style:\{overflow:`hidden`\},children:typeof u==`function`\?u\(\):u\}\):null/u,
  );
});

test("agent activity disclosure preserves the current body class name", () => {
  const source = currentFixture();
  assert.equal(isAgentActivityLayoutAsset(source), true);

  const patched = applyLinuxAgentActivityLayoutStabilityPatch(source);
  assert.equal(hasUnsafeAgentActivityLayout(patched), false);
  assert.match(
    patched,
    /w=f&&v\?\(0,D4\.jsx\)\(`div`,\{className:`-ms-2 ps-2`,style:\{overflow:`hidden`\},children:typeof u==`function`\?u\(\):u\}\):null/u,
  );
});

test("agent activity layout patch ignores unrelated motion disclosure code", () => {
  const decoy =
    "function Other(e){return jsx(motion.div,{animate:e?{opacity:1,height:`auto`}:{opacity:0,height:0}})}";
  assert.equal(isAgentActivityLayoutAsset(decoy), false);
  assert.throws(
    () => applyLinuxAgentActivityLayoutStabilityPatch(decoy),
    /unique agent activity disclosure component/u,
  );
});

test("agent activity layout patch rejects an uncorrelated full-shape disclosure", () => {
  const decoy = uncorrelatedFixture();
  assert.equal(isAgentActivityLayoutAsset(decoy), false);
  assert.throws(
    () => applyLinuxAgentActivityLayoutStabilityPatch(decoy),
    /unique agent activity disclosure component/u,
  );
});

test("agent activity layout descriptor selects one semantic asset and verifies its marker", () => {
  const extractedDir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-agent-layout-"));
  try {
    const assetsDir = path.join(extractedDir, "webview", "assets");
    fs.mkdirSync(assetsDir, { recursive: true });
    fs.writeFileSync(path.join(assetsDir, "subagent-activity-chip-group-fixture.js"), fixture());
    fs.writeFileSync(
      path.join(assetsDir, "app-main-decoy.js"),
      uncorrelatedFixture(),
    );
    const report = createPatchReport();

    applyWebviewAssetPatchDescriptors(
      extractedDir,
      normalizePatchDescriptors(layoutStabilityDescriptors),
      {},
      report,
    );

    const patched = fs.readFileSync(
      path.join(assetsDir, "subagent-activity-chip-group-fixture.js"),
      "utf8",
    );
    assert.match(patched, new RegExp(AGENT_ACTIVITY_LAYOUT_MARKER, "u"));
    assert.equal(report.patches[0]?.status, "applied");
    assert.equal(report.patches[0]?.assetName, "subagent-activity-chip-group-fixture.js");
    assert.equal(
      fs.readFileSync(path.join(assetsDir, "app-main-decoy.js"), "utf8"),
      uncorrelatedFixture(),
    );
  } finally {
    fs.rmSync(extractedDir, { force: true, recursive: true });
  }
});

test("agent activity layout descriptor accepts the current conversation blocks asset", () => {
  const extractedDir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-agent-blocks-"));
  try {
    const assetsDir = path.join(extractedDir, "webview", "assets");
    const assetPath = path.join(assetsDir, "conversation-blocks-current.js");
    fs.mkdirSync(assetsDir, { recursive: true });
    fs.writeFileSync(assetPath, currentFixture());
    const report = createPatchReport();

    applyWebviewAssetPatchDescriptors(
      extractedDir,
      normalizePatchDescriptors(layoutStabilityDescriptors),
      {},
      report,
    );

    assert.equal(report.patches[0]?.status, "applied");
    assert.equal(report.patches[0]?.assetName, "conversation-blocks-current.js");
    assert.match(
      fs.readFileSync(assetPath, "utf8"),
      new RegExp(AGENT_ACTIVITY_LAYOUT_MARKER, "u"),
    );
  } finally {
    fs.rmSync(extractedDir, { force: true, recursive: true });
  }
});

test("agent activity layout patch rejects marker-only partial state", () => {
  assert.throws(
    () => applyLinuxAgentActivityLayoutStabilityPatch(
      `void\`${AGENT_ACTIVITY_LAYOUT_MARKER}\`;function unrelated(){}`,
    ),
    /partial agent activity layout stability markers/u,
  );
});

test(
  "current upstream agent activity disclosure satisfies the layout stability invariant",
  { skip: process.env.CODEX_WEBVIEW_ASSET == null },
  () => {
    const source = fs.readFileSync(process.env.CODEX_WEBVIEW_ASSET, "utf8");
    assert.equal(isAgentActivityLayoutAsset(source), true);
    assert.equal(hasUnsafeAgentActivityLayout(source), true);
    const patched = applyLinuxAgentActivityLayoutStabilityPatch(source);
    assert.equal(hasUnsafeAgentActivityLayout(patched), false);
    assert.match(patched, new RegExp(AGENT_ACTIVITY_LAYOUT_MARKER, "u"));
  },
);
