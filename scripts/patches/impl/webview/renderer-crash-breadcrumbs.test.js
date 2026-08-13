"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const { createPatchReport } = require("../../../lib/patch-report.js");
const {
  applyWebviewAssetPatchDescriptors,
  normalizePatchDescriptors,
} = require("../../engine.js");
const breadcrumbDescriptors = require(
  "../../../../linux-features/linux-renderer-crash-diagnostics/patch.js"
).filter(({ id }) => id === "linux-renderer-crash-breadcrumbs");
const {
  INSTALL_MARKER,
  applyLinuxRendererCrashBreadcrumbsPatch,
} = require("./renderer-crash-breadcrumbs.js");

const GLOBAL_ERROR_HANDLER =
  "window.addEventListener(`error`,e=>{let t=e?.error?.stack??e?.error?.message??e?.message??`Unknown error`;E.dispatchMessage(`log-message`,{level:`error`,message:`[desktop-notifications][global-error] ${String(t)}`})})";

function fixture() {
  return `"use strict";(()=>{0,${GLOBAL_ERROR_HANDLER},globalThis.fixtureReady=true})();`;
}

test("renderer crash breadcrumbs reject marker-only partial state", () => {
  assert.throws(
    () => applyLinuxRendererCrashBreadcrumbsPatch(`${fixture()}${INSTALL_MARKER}`),
    /partial Linux renderer crash breadcrumb markers/u,
  );
});

test("renderer crash breadcrumbs preserve ResizeObserver behavior and identify the active callback", () => {
  const patched = applyLinuxRendererCrashBreadcrumbsPatch(fixture());
  assert.match(patched, /codexLinuxInstallRendererCrashBreadcrumbs/u);
  assert.equal(applyLinuxRendererCrashBreadcrumbsPatch(patched), patched);

  const eventListeners = new Map();
  const consoleMessages = [];
  const forwardedErrors = [];

  class FakeResizeObserver {
    constructor(callback) {
      this.callback = callback;
      this.targets = [];
    }

    observe(target) {
      this.targets.push(target);
    }

    unobserve(target) {
      this.targets = this.targets.filter((candidate) => candidate !== target);
    }

    disconnect() {
      this.targets = [];
    }

    trigger(entries) {
      return this.callback(entries, this);
    }
  }

  const window = {
    ResizeObserver: FakeResizeObserver,
    addEventListener(eventName, listener) {
      const listeners = eventListeners.get(eventName) ?? [];
      listeners.push(listener);
      eventListeners.set(eventName, listeners);
    },
    location: {
      href: "http://localhost:5175/codex/019fad43-fe09-73d0-9925-40fdd74c37bf?secret=hidden",
      pathname: "/codex/019fad43-fe09-73d0-9925-40fdd74c37bf",
    },
  };
  const context = {
    Date,
    E: {
      dispatchMessage(_channel, payload) {
        forwardedErrors.push(payload.message);
      },
    },
    Element: class Element {},
    Error: class Error {
      constructor() {
        this.stack = `Error\n at observer (http://127.0.0.1:5175/assets/app-main.js?secret=hidden)QUERY_LEAK#fragment:10:20) ${"x".repeat(5000)}`;
      }
    },
    URL,
    console: {
      info(message) {
        consoleMessages.push(message);
      },
    },
    document: {
      documentElement: {
        dataset: { codexWindowType: "electron" },
      },
    },
    globalThis: null,
    performance: { now: () => 100 },
    window,
  };
  context.globalThis = context;
  vm.runInNewContext(patched, context);

  const callbackObservers = [];
  const observer = new window.ResizeObserver((_entries, callbackObserver) => {
    callbackObservers.push(callbackObserver);
    return "callback-result";
  });
  const target = new context.Element();
  target.localName = "div";
  target.id = "thread-scroll";
  target.classList = ["flex", "overflow-y-auto"];
  observer.observe(target);

  assert.equal(observer instanceof FakeResizeObserver, true);
  assert.equal(observer.trigger([{ target }]), "callback-result");
  assert.equal(callbackObservers.length, 1);
  assert.equal(callbackObservers[0], observer);

  for (let index = 0; index < 3; index += 1) {
    const extraObserver = new window.ResizeObserver(() => {});
    extraObserver.trigger([{ target }, { target }, { target }, { target }]);
  }

  const resizeError = {
    message: "ResizeObserver loop completed with undelivered notifications.",
  };
  for (const listener of eventListeners.get("error")) listener(resizeError);

  assert.equal(forwardedErrors.length, 1);
  assert.equal(consoleMessages.length, 5);
  for (const message of consoleMessages) {
    assert.match(message, /^\[codex-linux-renderer-breadcrumb\]/u);
    assert.doesNotMatch(message, /hidden|fragment|assets\/app-main|QUERY_LEAK/u);
    assert.ok(message.length < 32768);
  }
  const callbackBreadcrumb = JSON.parse(
    consoleMessages[0].slice("[codex-linux-renderer-breadcrumb]".length),
  );
  assert.equal(callbackBreadcrumb.kind, "resize-observer-callback");
  assert.equal(callbackBreadcrumb.observers.length, 1);
  assert.equal(callbackBreadcrumb.observers[0].id, 1);
  const breadcrumb = JSON.parse(
    consoleMessages[4].slice("[codex-linux-renderer-breadcrumb]".length),
  );
  assert.equal(breadcrumb.kind, "resize-observer-loop");
  assert.equal(breadcrumb.windowType, "electron");
  assert.equal(breadcrumb.route, null);
  assert.deepEqual(breadcrumb.routeIds, ["019fad43-fe09-73d0-9925-40fdd74c37bf"]);
  assert.equal(breadcrumb.observers.length, 4);
  assert.deepEqual(breadcrumb.observers[0].targets, [
    "div[id][classes=2]",
    "div[id][classes=2]",
    "div[id][classes=2]",
    "div[id][classes=2]",
  ]);
  assert.equal(breadcrumb.observers[0].stack.length, 2048);
  assert.match(breadcrumb.observers[0].stack, /at observer \(<url>/u);

  const changingObserver = new window.ResizeObserver(() => {});
  changingObserver.trigger([{ target }]);
  for (const listener of eventListeners.get("error")) listener(resizeError);
  assert.equal(forwardedErrors.length, 2);
  assert.equal(
    consoleMessages.length,
    6,
    "repeated callbacks and duplicate loop diagnostics are throttled",
  );

  const bulkObservers = Array.from(
    { length: 257 },
    () => new window.ResizeObserver(() => {}),
  );
  for (const bulkObserver of bulkObservers) bulkObserver.trigger([{ target }]);
  const afterFirstBulkCycle = consoleMessages.length;
  assert.equal(afterFirstBulkCycle, 263);
  for (const bulkObserver of bulkObservers) bulkObserver.trigger([{ target }]);
  assert.equal(
    consoleMessages.length,
    afterFirstBulkCycle,
    "observer bookkeeping does not forget active callbacks at a fixed capacity",
  );
});

test("renderer crash breadcrumbs fail closed when the upstream handler drifts", () => {
  assert.throws(
    () => applyLinuxRendererCrashBreadcrumbsPatch('window.addEventListener("error", handler);'),
    /global error handler/u,
  );
});

test("renderer crash breadcrumbs accept a renamed dispatch bridge alias", () => {
  const source = fixture().replace("E.dispatchMessage", "n.dispatchMessage");
  const patched = applyLinuxRendererCrashBreadcrumbsPatch(source);
  assert.match(patched, /codexLinuxInstallRendererCrashBreadcrumbs/u);
  assert.match(patched, /n\.dispatchMessage/u);
});

test("renderer crash breadcrumb descriptor installs and verifies both markers", () => {
  const extractedDir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-breadcrumbs-"));
  try {
    const assetsDir = path.join(extractedDir, "webview", "assets");
    const assetPath = path.join(assetsDir, "app-main-fixture.js");
    fs.mkdirSync(assetsDir, { recursive: true });
    fs.writeFileSync(assetPath, fixture());
    const report = createPatchReport();

    applyWebviewAssetPatchDescriptors(
      extractedDir,
      normalizePatchDescriptors(breadcrumbDescriptors),
      {},
      report,
    );

    const patched = fs.readFileSync(assetPath, "utf8");
    assert.match(patched, /codexLinuxInstallRendererCrashBreadcrumbs/u);
    assert.match(patched, /\[codex-linux-renderer-breadcrumb\]/u);
    assert.equal(report.patches[0]?.status, "applied");
    assert.equal(
      patched.split("function codexLinuxInstallRendererCrashBreadcrumbs()").length - 1,
      1,
    );
    assert.equal(patched.split("[codex-linux-renderer-breadcrumb]").length - 1, 1);
  } finally {
    fs.rmSync(extractedDir, { force: true, recursive: true });
  }
});
