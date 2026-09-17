"use strict";

const { findMatchingBrace } = require("../../scripts/patches/lib/minified-js.js");
const MARKER = "codexLinuxCaptureAtNativeResolution";

// Embedded into the upstream main process. Keep this function self-contained.
async function codexLinuxCaptureAtNativeResolution(page, host, command) {
  const method = command.method;
  const capture = method === "Page.captureScreenshot";
  const start = method === "Page.startScreencast";
  const stop = method === "Page.stopScreencast";
  if ((!capture && !start && !stop) || host == null) {
    return this.executeCdpCommand(page, command);
  }
  // Child-target commands must not resize their parent page.
  if (command.target?.sessionId != null || (command.target?.targetId != null && command.target.targetId !== `browser-use-iab-tab:${page.cdpTabId}`)) {
    return this.executeCdpCommand(page, command);
  }
  const queues = this.codexLinuxCaptureQueues ??= new Map();
  const streams = this.codexLinuxCaptureStreams ??= new Map();
  const epochs = this.codexLinuxCaptureEpochs ??= new WeakMap();
  const epoch = epochs.get(page.webContents) ?? 0;
  const assertActive = () => {
    if ((epochs.get(page.webContents) ?? 0) !== epoch) throw new Error("Browser capture lease was released");
  };
  const key = page.cdpTabId;
  const previousJob = queues.get(key);
  let release;
  const job = new Promise(resolve => { release = resolve; });
  queues.set(key, job);
  if (previousJob != null) await previousJob;
  const previousSurface = streams.get(key) ?? null;
  let keepSurface = false;
  let changedSurface = false;
  try {
    assertActive();
    if (stop) {
      try { return await this.executeCdpCommand(page, command); }
      finally {
        streams.delete(key);
        host.setCaptureSurfaceForBrowserUse(null, page.browserTabId);
      }
    }
    const metrics = await this.executeCdpCommand(page, { method: "Page.getLayoutMetrics", target: command.target });
    assertActive();
    const viewport = metrics.cssLayoutViewport;
    const clip = command.commandParams?.clip;
    const width = Math.ceil(Math.max(viewport?.clientWidth ?? 0, clip?.width ?? 0));
    const height = Math.ceil(Math.max(viewport?.clientHeight ?? 0, clip?.height ?? 0));
    if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0) {
      throw new Error("Browser capture requires valid CSS viewport dimensions");
    }
    const surface = { width, height };
    host.setCaptureSurfaceForBrowserUse(surface, page.browserTabId);
    changedSurface = true;
    // Layout metrics alone are insufficient: they already report 1920x1080
    // while the embedder is still rasterizing its webview at (say) 35%.
    const owner = page.webContents.hostWebContents;
    if (owner == null || owner.isDestroyed()) throw new Error("Browser capture embedder is unavailable");
    await owner.executeJavaScript(`(async () => {
      const deadline = Date.now() + 2000;
      for (;;) {
        const view = Array.from(document.querySelectorAll('webview[data-browser-sidebar-browser-tab-id]')).find(view => view.getAttribute('data-browser-sidebar-browser-tab-id') === ${JSON.stringify(page.browserTabId)});
        if (view != null && getComputedStyle(view).transform === 'none' && view.clientWidth >= ${width} && view.clientHeight >= ${height}) return;
        if (Date.now() >= deadline) throw new Error('Timed out preparing unscaled browser capture surface');
        await new Promise(resolve => setTimeout(resolve, 16));
      }
    })()`);
    assertActive();
    const pageScale = metrics.cssVisualViewport?.scale ?? 1;
    if (!Number.isFinite(pageScale) || pageScale <= 0) throw new Error("Browser capture requires a valid page scale");
    await this.waitForCaptureSurface(page, { width: width / pageScale, height: height / pageScale });
    assertActive();
    const result = await this.executeCdpCommand(page, command);
    assertActive();
    if (start) { streams.set(key, surface); keepSurface = true; }
    return result;
  } finally {
    try {
      if (changedSurface && !keepSurface && (epochs.get(page.webContents) ?? 0) === epoch) host.setCaptureSurfaceForBrowserUse(previousSurface, page.browserTabId);
    } finally {
      release();
      if (queues.get(key) === job) queues.delete(key);
    }
  }
}

// Called before upstream detaches the debugger or relinquishes its paint lease.
function codexLinuxInvalidateCapture(page) {
  const contents = this.tabRuntimesById.get(page.cdpTabId)?.webContents;
  if (contents != null) {
    const epochs = this.codexLinuxCaptureEpochs ??= new WeakMap();
    epochs.set(contents, (epochs.get(contents) ?? 0) + 1);
  }
  const streaming = this.codexLinuxCaptureStreams?.delete(page.cdpTabId);
  if (streaming || this.codexLinuxCaptureQueues?.has(page.cdpTabId)) {
    this.hostsByRouteKey.get(page.routeKey)?.setCaptureSurfaceForBrowserUse(null, page.browserTabId);
  }
}

function applyBrowserCaptureResolutionPatch(source) {
  if (source.includes(`async function ${MARKER}(`)) {
    if (!source.includes(`return ${MARKER}.call(this,`) || !source.includes("codexLinuxInvalidateCapture.call(this,")) throw new Error("Incomplete browser capture patch");
    return source;
  }
  const matches = [...source.matchAll(/async executeCdpCommandWithCaptureSurface\(([\w$]+),([\w$]+),([\w$]+)\)\{/g)];
  if (matches.length !== 1) throw new Error("Browser capture dispatcher contract is missing or ambiguous");
  const match = matches[0];
  const open = match.index + match[0].length - 1;
  const close = findMatchingBrace(source, open);
  const body = source.slice(open + 1, close);
  if (close < 0 || !body.includes(".setCaptureSurfaceForBrowserUse(") || !body.includes("this.waitForCaptureSurface(") || !body.includes("finally{")) {
    throw new Error("Browser capture surface lifecycle contract changed");
  }
  const call = `return ${MARKER}.call(this,${match[1]},${match[2]},${match[3]})`;
  let result = source.slice(0, open + 1) + call + source.slice(close);
  const releases = [...result.matchAll(/releasePageCapturePaintLease\(([\w$]+)\)\{let [\w$]+=this\.pageCapturePaintLeaseWebContentsByTabId\.get\(/g)];
  if (releases.length !== 1) throw new Error("Browser capture release contract is missing or ambiguous");
  const release = releases[0];
  const insert = release.index + release[0].indexOf("{") + 1;
  const page = release[1];
  result = result.slice(0, insert) + `codexLinuxInvalidateCapture.call(this,${page});` + result.slice(insert);
  return result + "\n" + codexLinuxCaptureAtNativeResolution.toString() + "\n" + codexLinuxInvalidateCapture.toString() + "\n";
}

module.exports = { applyBrowserCaptureResolutionPatch, codexLinuxCaptureAtNativeResolution, codexLinuxInvalidateCapture };
