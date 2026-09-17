"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const manifest = require("./feature.json");
const descriptors = require("./patch.js");
const {
  applyLinuxAppShellTabLayoutPerformancePatch,
  matchesLinuxAppShellTabLayoutPerformanceContract,
  applyLinuxMarkdownAnimationPerformancePatch,
  matchesLinuxMarkdownAnimationPerformanceContract,
} = require("./implementation.js");

test("Markdown animation workaround covers the current semantic CSS classes", () => {
  const root = "._MarkdownRoot_abc_1[data-markdown-animated]";
  const selectors = ":is(._FadeIn_abc_2,._HorizontalRule_abc_3,._ListItem_abc_4,._TableRow_abc_5,._Blockquote_abc_6)";
  const image = `${root} ._ImageEnter_abc_8{transform-origin:50%;animation:.18s ease-out both _image-enter_abc_1}`;
  const source = `${root} ${selectors}{opacity:0;animation:_fade-in_abc_1 .2s ease forwards;animation-delay:var(--fade-delay,0s)}` +
    `${root} ._FadeListDecoration_abc_7::marker{animation:_fade-in-marker_abc_1 .2s ease forwards;animation-delay:var(--fade-delay,0s)}` + image;
  assert.equal(matchesLinuxMarkdownAnimationPerformanceContract(source), true);
  const patched = applyLinuxMarkdownAnimationPerformancePatch(source);
  assert.ok(patched.includes(`${selectors}{opacity:1;animation:none}`));
  assert.ok(patched.endsWith(image));
  assert.equal(applyLinuxMarkdownAnimationPerformancePatch(patched), patched);
  assert.equal(matchesLinuxMarkdownAnimationPerformanceContract(source.replace("._TableRow_abc_5", "._Different_abc_5")), false);
});

function currentAppShellTabLayoutFixture() {
  return [
    "function o9a(){let re=(e,t)=>{K(t.scrollWidth>t.clientWidth)},ie=$I(re),ye=L&&M!=null&&(q?`@max-[4rem]/app-shell-tab:pe-5`:`@max-[4rem]/app-shell-tab:group-hover/tab:pe-5`);return jsx(`button`,{\"data-app-shell-tab-close-button\":!0})}",
    "function m9a(){let M=!0,A=!1,L=A?z9a:_9a;let Ae=M?L:void 0,je=!1,Me=M&&!A?L:!1,Oe={maxWidth:`160px`,minWidth:`90px`},Ie={},Le=M?{duration:.2}:{duration:0},Re=()=>{},Ee=`@container/app-shell-tab`;return jsx(kf.div,{animate:Oe,\"data-app-shell-tab-controller\":ke,\"data-tab-id\":V,exit:Ae,inert:je,initial:Me,style:Ie,transition:Le,onAnimationComplete:Re})}",
    "var _9a={maxWidth:`0px`,minWidth:`0px`},z9a={maxWidth:`0px`,\"--tab-size-progress\":0};",
  ].join("");
}

test("linux-performance-workarounds remains an opt-in renderer-only feature", () => {
  assert.equal(manifest.defaultEnabled, false);
  assert.deepEqual(
    descriptors.map(({ id, phase }) => [id, phase]),
    [
      ["sidebar-scroll", "webview-asset"],
      ["app-shell-tab-layout", "webview-asset"],
      ["markdown-animation", "webview-asset"],
      ["linux-agent-activity-layout-stability", "webview-asset"],
      ["linux-thread-virtualizer-layout-stability", "webview-asset"],
      ["linux-thread-history-server-pagination", "webview-asset"],
      ["linux-thread-navigation-history-index", "webview-asset"],
      ["linux-subagent-topology-metadata-only", "webview-asset"],
      ["linux-inactive-thread-retention", "webview-asset"],
      ["linux-subagent-runtime-status-reconciliation", "webview-asset"],
    ],
  );
  assert.equal(descriptors[0].pattern.test("app-primary-a0bff570446b.js"), true);
  assert.equal(descriptors[0].pattern.test("app-initial-cccb87527a41.js"), false);
  assert.equal(descriptors[1].pattern.test("app-initial-cccb87527a41.js"), true);
  assert.equal(descriptors[9].pattern.test("app-initial-cccb87527a41.js"), true);
  assert.equal(descriptors[9].pattern.test("app-primary-a0bff570446b.js"), true);
  assert.equal(descriptors[9].pattern.test("app-secondary-a0bff570446b.js"), false);
});

test("current app-shell tab workaround disables mount animation and defers overflow measurement", () => {
  const source = currentAppShellTabLayoutFixture();
  assert.equal(matchesLinuxAppShellTabLayoutPerformanceContract(source), true);

  const patched = applyLinuxAppShellTabLayoutPerformancePatch(source);
  assert.notEqual(patched, source);
  assert.match(patched, /codexLinuxScheduleAppShellTabOverflow\(t,K\)/u);
  assert.match(patched, /,Me=!1,/u);
  assert.doesNotThrow(() => new Function(patched));
  assert.equal(matchesLinuxAppShellTabLayoutPerformanceContract(patched), true);
  assert.equal(applyLinuxAppShellTabLayoutPerformancePatch(patched), patched);
});

test("app-shell tab workaround fails closed when the current mount contract drifts", () => {
  const source = currentAppShellTabLayoutFixture().replace("initial:Me", "initial:!1");
  assert.equal(matchesLinuxAppShellTabLayoutPerformanceContract(source), false);
  assert.equal(applyLinuxAppShellTabLayoutPerformancePatch(source), source);
});

test("app-shell tab workaround rejects the retired direct collapsed animation contract", () => {
  const source = currentAppShellTabLayoutFixture()
    .replace("L=A?z9a:_9a", "L=_9a")
    .replace("Me=M&&!A?L:!1", "Me=M?L:!1");

  assert.equal(matchesLinuxAppShellTabLayoutPerformanceContract(source), false);
  assert.equal(applyLinuxAppShellTabLayoutPerformancePatch(source), source);
});

test("pointer-close width locking keeps a collapsed exit target when layout animation is disabled", () => {
  const vm = require("node:vm");
  for (const sharesWidth of [false, true]) {
    const source = currentAppShellTabLayoutFixture().replace("M=!0,A=!1", `M=!1,A=${sharesWidth ? "!0" : "!1"}`);
    const patched = applyLinuxAppShellTabLayoutPerformancePatch(source);
    const result = vm.runInNewContext(patched + ";m9a()", {
      jsx: (_type, props) => props, kf: { div: "motion.div" }, ke: "right", V: "closed-file",
    });
    assert.equal(result.exit?.maxWidth, "0px");
    assert.equal(result.exit?.[sharesWidth ? "--tab-size-progress" : "minWidth"], sharesWidth ? 0 : "0px");
    assert.equal(result.initial, false);
    assert.equal(result.transition.duration, 0);
  }
});

test("a partial presence repair is rejected instead of skipping its companion edits", () => {
  const source = currentAppShellTabLayoutFixture().replace("let Ae=M?L:void 0", "let Ae=L");
  assert.equal(matchesLinuxAppShellTabLayoutPerformanceContract(source), false);
  assert.equal(applyLinuxAppShellTabLayoutPerformancePatch(source), source);
});
