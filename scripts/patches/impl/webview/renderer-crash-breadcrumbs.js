"use strict";

const INSTALL_MARKER = "codexLinuxInstallRendererCrashBreadcrumbs";
const CONSOLE_PREFIX = "[codex-linux-renderer-breadcrumb]";
const GLOBAL_ERROR_HANDLER_PATTERN =
  /window\.addEventListener\(`error`,([A-Za-z_$][\w$]*)=>\{let ([A-Za-z_$][\w$]*)=\1\?\.error\?\.stack\?\?\1\?\.error\?\.message\?\?\1\?\.message\?\?`Unknown error`;([A-Za-z_$][\w$]*)\.dispatchMessage\(`log-message`,\{level:`error`,message:`\[desktop-notifications\]\[global-error\] \$\{String\(\2\)\}`\}\)\}\)/gu;

function rendererCrashBreadcrumbRuntime() {
  function codexLinuxInstallRendererCrashBreadcrumbs() {
    try {
      const NativeResizeObserver = window.ResizeObserver;
      if (
        typeof NativeResizeObserver !== "function" ||
        NativeResizeObserver.__codexLinuxRendererCrashBreadcrumbsInstalled === true
      ) {
        return;
      }

      let nextObserverId = 0;
      const recentCallbacks = [];
      let lastCallbackReportAt = Number.NEGATIVE_INFINITY;
      let lastLoopReportAt = Number.NEGATIVE_INFINITY;
      const monotonicNow = () => {
        try {
          return typeof performance === "object" && typeof performance.now === "function"
            ? performance.now()
            : Date.now();
        } catch {
          return Date.now();
        }
      };
      const safeStack = (value) =>
        typeof value === "string"
          ? value
              .replace(/\b[a-z][a-z0-9+.-]*:\/\/\S+/giu, "<url>")
              .replace(/[?#][^\s)]*/gu, "")
              .slice(0, 2048)
          : null;
      const describeTarget = (target) => {
        try {
          if (typeof Element === "undefined" || !(target instanceof Element)) {
            return null;
          }
          const rawTagName =
            typeof target.localName === "string"
              ? target.localName.toLowerCase()
              : typeof target.tagName === "string"
                ? target.tagName.toLowerCase()
                : "element";
          const tagName = /^[a-z][a-z0-9-]{0,31}$/u.test(rawTagName)
            ? rawTagName
            : "element";
          const hasId = typeof target.id === "string" && target.id.length > 0;
          const classCount = Math.min(Array.from(target.classList ?? []).length, 3);
          return `${tagName}${hasId ? "[id]" : ""}${
            classCount > 0 ? `[classes=${classCount}]` : ""
          }`;
        } catch {
          return null;
        }
      };
      const captureCreationContext = (error) => {
        try {
          const stack = safeStack(String(error?.stack ?? "")) ?? "";
          const createdAt =
            stack
              .split("\n")
              .map((line) => line.trim())
              .find(
                (line) =>
                  line &&
                  !/^Error(?::|$)/u.test(line) &&
                  !line.includes("codexLinuxInstallRendererCrashBreadcrumbs"),
              ) ?? null;
          return {
            createdAt: typeof createdAt === "string" ? createdAt.slice(0, 64) : null,
            stack,
          };
        } catch {
          return { createdAt: null, stack: null };
        }
      };
      const currentRouteContext = () => {
        const route =
          typeof window.location?.pathname === "string"
            ? window.location.pathname.slice(0, 1024)
            : null;
        const routeIds =
          typeof route === "string"
            ? [
                ...route.matchAll(
                  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/giu,
                ),
              ]
                .slice(0, 8)
                .map((match) => match[0])
            : [];
        return {
          route: null,
          routeIds,
          windowType:
            typeof document?.documentElement?.dataset?.codexWindowType === "string"
              ? document.documentElement.dataset.codexWindowType.slice(0, 64)
              : null,
        };
      };
      const emitBreadcrumb = (kind, observers) => {
        try {
          console.info(
            `[codex-linux-renderer-breadcrumb]${JSON.stringify({
              v: 1,
              kind,
              timestamp: new Date().toISOString(),
              ...currentRouteContext(),
              observers: observers.map((observer) => ({
                id: observer.id,
                createdAt: observer.createdAt,
                stack: safeStack(observer.stack),
                targets: observer.targets,
              })),
            })}`,
          );
        } catch {}
      };

      let ResizeObserverProxy;
      ResizeObserverProxy = new Proxy(NativeResizeObserver, {
        construct(Target, argumentsList, newTarget) {
          const observerId = ++nextObserverId;
          const creationContext = captureCreationContext(new Error());
          const callback = argumentsList[0];
          if (typeof callback !== "function") {
            return Reflect.construct(Target, argumentsList, newTarget);
          }
          let callbackReported = false;
          const wrappedCallback = function (entries, observer) {
            try {
              const targets = [];
              for (const entry of Array.from(entries ?? []).slice(0, 4)) {
                const target = describeTarget(entry?.target);
                if (target != null) targets.push(target);
              }
              recentCallbacks.push({
                id: observerId,
                monotonicAt: monotonicNow(),
                createdAt: creationContext.createdAt,
                stack: creationContext.stack,
                targets,
              });
              if (recentCallbacks.length > 16) {
                recentCallbacks.splice(0, recentCallbacks.length - 16);
              }
              const currentCallback = recentCallbacks[recentCallbacks.length - 1];
              const now = currentCallback.monotonicAt;
              if (
                !callbackReported ||
                now - lastCallbackReportAt >= 5000
              ) {
                callbackReported = true;
                lastCallbackReportAt = now;
                emitBreadcrumb("resize-observer-callback", [currentCallback]);
              }
            } catch {}
            return Reflect.apply(callback, this, [entries, observer]);
          };
          return Reflect.construct(
            Target,
            [wrappedCallback, ...argumentsList.slice(1)],
            newTarget,
          );
        },
      });
      Object.defineProperty(
        ResizeObserverProxy,
        "__codexLinuxRendererCrashBreadcrumbsInstalled",
        { value: true },
      );
      window.ResizeObserver = ResizeObserverProxy;

      window.addEventListener("error", (event) => {
        try {
          if (
            typeof event?.message !== "string" ||
            !event.message.includes(
              "ResizeObserver loop completed with undelivered notifications",
            )
          ) {
            return;
          }

          const now = monotonicNow();
          if (now - lastLoopReportAt < 5000) return;
          const observers = [];
          for (const callback of recentCallbacks.slice().reverse()) {
            if (callback.monotonicAt != null && now - callback.monotonicAt > 250) {
              continue;
            }
            if (!observers.some((observer) => observer.id === callback.id)) {
              observers.push(callback);
            }
            if (observers.length >= 4) break;
          }
          lastLoopReportAt = now;
          emitBreadcrumb("resize-observer-loop", observers);
        } catch {}
      });
    } catch {}
  }

  codexLinuxInstallRendererCrashBreadcrumbs();
}

const RUNTIME_EXPRESSION = `(${rendererCrashBreadcrumbRuntime.toString()})()`;

function applyLinuxRendererCrashBreadcrumbsPatch(source) {
  if (source.includes(INSTALL_MARKER)) return source;

  const handlers = [...source.matchAll(GLOBAL_ERROR_HANDLER_PATTERN)];
  if (handlers.length !== 1) {
    throw new Error("Could not find unique desktop global error handler");
  }
  const firstHandlerIndex = handlers[0].index;

  const patched =
    source.slice(0, firstHandlerIndex) +
    RUNTIME_EXPRESSION +
    "," +
    source.slice(firstHandlerIndex);
  if (!patched.includes(INSTALL_MARKER) || !patched.includes(CONSOLE_PREFIX)) {
    throw new Error("Renderer crash breadcrumb markers were not installed");
  }
  return patched;
}

module.exports = {
  applyLinuxRendererCrashBreadcrumbsPatch,
};
