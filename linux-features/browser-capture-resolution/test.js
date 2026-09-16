"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const test = require("node:test");
const { applyBrowserCaptureResolutionPatch, codexLinuxCaptureAtNativeResolution: capture, codexLinuxInvalidateCapture: invalidate } = require("./implementation.js");

function fixture() {
  const changes = [];
  let surface = null;
  const host = { setCaptureSurfaceForBrowserUse(value) { surface = value; changes.push(value); } };
  const page = { cdpTabId: 7, browserTabId: "tab-7", routeKey: "route", webContents: { id: 70, hostWebContents: {
    isDestroyed: () => false,
    async executeJavaScript(source) {
      assert.match(source, /getComputedStyle\(view\).transform === 'none'/);
      assert.match(source, /view.clientWidth >= 1920/);
      assert.deepEqual(surface, { width: 1920, height: 1080 });
    },
  } } };
  const controller = {
    hostsByRouteKey: new Map([["route", host]]),
    tabRuntimesById: new Map([[7, { webContents: page.webContents }]]),
    async waitForCaptureSurface() { assert.ok(surface); },
    async executeCdpCommand(page, command) {
      if (command.method === "Page.getLayoutMetrics") return { cssLayoutViewport: { clientWidth: 1920, clientHeight: 1080 }, cssVisualViewport: { clientWidth: 1920, clientHeight: 1080, scale: 1 } };
      if (command.method === "Page.captureScreenshot" || command.method === "Page.startScreencast") return { rasterWidth: surface?.width ?? 672 };
      return {};
    },
  };
  return { changes, host, page, controller, run: command => capture.call(controller, page, host, command) };
}

test("ordinary screenshot uses native viewport and restores miniature", async () => {
  const f = fixture();
  assert.deepEqual(await f.run({ method: "Page.captureScreenshot" }), { rasterWidth: 1920 });
  assert.deepEqual(f.changes, [{ width: 1920, height: 1080 }, null]);
  assert.equal(f.controller.codexLinuxCaptureQueues.size, 0);
});

test("lease invalidation during screenshot or screencast start cannot resurrect the surface", async () => {
  for (const method of ["Page.captureScreenshot", "Page.startScreencast"]) {
    const f = fixture();
    if (method === "Page.captureScreenshot") await f.run({ method: "Page.startScreencast" });
    let ready, finish;
    const entered = new Promise(resolve => { ready = resolve; });
    const original = f.controller.executeCdpCommand;
    f.controller.executeCdpCommand = async (page, command) => {
      if (command.method !== method) return original(page, command);
      return new Promise(resolve => { finish = resolve; ready(); });
    };
    const pending = f.run({ method });
    await entered;
    invalidate.call(f.controller, f.page);
    finish({});
    await assert.rejects(pending, /lease was released/);
    invalidate.call(f.controller, f.page);
    assert.equal(f.changes.at(-1), null);
    assert.equal(f.controller.codexLinuxCaptureStreams.size, 0);
  }
});

test("queued captures are cancelled when their lease is released", async () => {
  const f = fixture();
  let ready, finish;
  const entered = new Promise(resolve => { ready = resolve; });
  f.page.webContents.hostWebContents.executeJavaScript = async () => new Promise(resolve => { finish = resolve; ready(); });
  const first = f.run({ method: "Page.captureScreenshot" });
  await entered;
  const second = f.run({ method: "Page.captureScreenshot" });
  invalidate.call(f.controller, f.page);
  finish();
  await assert.rejects(first, /lease was released/);
  await assert.rejects(second, /lease was released/);
  assert.deepEqual(f.changes, [{ width: 1920, height: 1080 }, null]);
});

test("screencast stays native until stop; nested screenshot preserves its surface", async () => {
  const f = fixture();
  assert.deepEqual(await f.run({ method: "Page.startScreencast" }), { rasterWidth: 1920 });
  await f.run({ method: "Page.captureScreenshot" });
  assert.deepEqual(f.changes.at(-1), { width: 1920, height: 1080 });
  await f.run({ method: "Page.stopScreencast" });
  assert.equal(f.changes.at(-1), null);
  assert.equal(f.controller.codexLinuxCaptureStreams.size, 0);
});

test("failed screenshot or start restores surface and propagates the error", async () => {
  for (const method of ["Page.captureScreenshot", "Page.startScreencast"]) {
    const f = fixture();
    f.page.webContents.hostWebContents.executeJavaScript = async () => { throw new Error("paint not ready"); };
    await assert.rejects(f.run({ method }), /paint not ready/);
    assert.equal(f.changes.at(-1), null);
    assert.equal(f.controller.codexLinuxCaptureQueues.size, 0);
    assert.equal(f.controller.codexLinuxCaptureStreams.size, 0);
  }
});

test("failed stop releases the stream", async () => {
  const f = fixture();
  await f.run({ method: "Page.startScreencast" });
  f.controller.executeCdpCommand = async () => { throw new Error("stop failed"); };
  await assert.rejects(f.run({ method: "Page.stopScreencast" }), /stop failed/);
  assert.equal(f.changes.at(-1), null);
  assert.equal(f.controller.codexLinuxCaptureStreams.size, 0);
});

test("captures of one tab are serialized and restore after each capture", async () => {
  const f = fixture();
  await Promise.all([f.run({ method: "Page.captureScreenshot" }), f.run({ method: "Page.captureScreenshot" })]);
  assert.deepEqual(f.changes, [{ width: 1920, height: 1080 }, null, { width: 1920, height: 1080 }, null]);
});

test("unrelated CDP and child-target capture do not resize parent", async () => {
  const f = fixture();
  await f.run({ method: "Runtime.evaluate" });
  await f.run({ method: "Page.captureScreenshot", target: { sessionId: "child" } });
  assert.deepEqual(f.changes, []);
});

test("invalid metrics fail before resize", async () => {
  const f = fixture();
  f.controller.executeCdpCommand = async () => ({ cssLayoutViewport: { clientWidth: NaN, clientHeight: 1080 } });
  await assert.rejects(f.run({ method: "Page.captureScreenshot" }), /valid CSS viewport/);
  assert.deepEqual(f.changes, []);
});

test("page zoom does not shrink the capture surface or wait for impossible visual dimensions", async () => {
  const f = fixture();
  const original = f.controller.executeCdpCommand;
  f.controller.executeCdpCommand = async (page, command) => command.method === "Page.getLayoutMetrics"
    ? { cssLayoutViewport: { clientWidth: 1920, clientHeight: 1080 }, cssVisualViewport: { clientWidth: 960, clientHeight: 540, scale: 2 } }
    : original(page, command);
  f.controller.waitForCaptureSurface = async (_, size) => { assert.deepEqual(size, { width: 960, height: 540 }); };
  assert.deepEqual(await f.run({ method: "Page.captureScreenshot" }), { rasterWidth: 1920 });
});

test("current official bundle accepts patch, remains valid JS, and fails closed on drift", { skip: !process.env.CODEX_CAPTURE_MAIN_BUNDLE }, () => {
  const source = fs.readFileSync(process.env.CODEX_CAPTURE_MAIN_BUNDLE, "utf8");
  const patched = applyBrowserCaptureResolutionPatch(source);
  assert.notEqual(patched, source);
  new vm.Script(patched);
  assert.equal(applyBrowserCaptureResolutionPatch(patched), patched);
  assert.throws(() => applyBrowserCaptureResolutionPatch(source.replaceAll("executeCdpCommandWithCaptureSurface", "changedDispatcher")), /missing or ambiguous/);
  assert.throws(() => applyBrowserCaptureResolutionPatch(source + source), /ambiguous/);
  assert.throws(() => applyBrowserCaptureResolutionPatch(source.replaceAll("releasePageCapturePaintLease", "changedRelease")), /release contract/);
});
