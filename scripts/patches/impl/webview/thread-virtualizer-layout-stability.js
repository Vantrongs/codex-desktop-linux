"use strict";

const {
  escapeRegExp,
  findMatchingBrace,
} = require("../../lib/minified-js.js");

const THREAD_VIRTUALIZER_LAYOUT_MARKER =
  "codexLinuxThreadVirtualizerDeferredResizeMeasurement";

const IDENTIFIER = "[A-Za-z_$][\\w$]*";
const RESIZE_OBSERVER_PATTERN = new RegExp(
  `new ResizeObserver\\((${IDENTIFIER})=>\\{let (${IDENTIFIER})=new Map,(${IDENTIFIER})=!1;([\\s\\S]{0,1800}?)(${IDENTIFIER})\\(\\2\\),\\3&&(${IDENTIFIER})\\(\\)\\}\\)`,
  "u",
);

function hasSynchronousMeasurementUpdater(componentText, updaterAlias) {
  const updaterPattern = new RegExp(
    `(?:let\\s+|,)${escapeRegExp(updaterAlias)}=(${IDENTIFIER})\\(\\((${IDENTIFIER}),(${IDENTIFIER})=!0\\)=>\\{`,
    "gu",
  );
  const matches = [];
  let match;
  while ((match = updaterPattern.exec(componentText)) != null) {
    const openBrace = match.index + match[0].length - 1;
    const closeBrace = findMatchingBrace(componentText, openBrace);
    if (closeBrace === -1 || componentText[closeBrace + 1] !== ")") {
      continue;
    }
    const body = componentText.slice(openBrace + 1, closeBrace);
    const flushPattern = new RegExp(
      `${escapeRegExp(match[3])}\\?\\(0,${IDENTIFIER}\\.flushSync\\)\\((${IDENTIFIER})\\):\\1\\(\\)`,
      "u",
    );
    if (flushPattern.test(body)) matches.push(match);
  }
  return matches.length === 1;
}

function observerShadowsUpdater(observerMatch, updaterAlias) {
  if ([observerMatch[1], observerMatch[2], observerMatch[3]].includes(updaterAlias)) {
    return true;
  }

  const escapedAlias = escapeRegExp(updaterAlias);
  const anyPriorAliasUse = new RegExp(
    `(^|[^\\w$])${escapedAlias}(?![\\w$])`,
    "u",
  );
  return anyPriorAliasUse.test(observerMatch[4]);
}

function findUnsafeResizeObservers(componentText) {
  const matches = [];
  const observerPattern = new RegExp(RESIZE_OBSERVER_PATTERN.source, "gu");
  let match;
  while ((match = observerPattern.exec(componentText)) != null) {
    const updaterAlias = match[5];
    if (observerShadowsUpdater(match, updaterAlias)) continue;
    if (!hasSynchronousMeasurementUpdater(componentText, updaterAlias)) continue;
    matches.push({
      match,
      measurementsAlias: match[2],
      updaterAlias,
    });
  }
  return matches;
}

function findThreadVirtualizerComponents(source) {
  const candidates = [];
  const functionPattern = new RegExp(
    `function (${IDENTIFIER})\\(\\{entries:`,
    "gu",
  );
  let match;
  while ((match = functionPattern.exec(source)) != null) {
    const openBrace = source.indexOf("{", match.index + match[0].length - 1);
    const closeBrace = findMatchingBrace(source, openBrace);
    if (openBrace === -1 || closeBrace === -1) continue;
    const text = source.slice(match.index, closeBrace + 1);
    if (
      text.includes("latestTurnSynchronousMeasurementKey") &&
      text.includes("latest-turn-follow-content") &&
      text.includes("preserveScrollPositionForNextLayout") &&
      text.includes(".flushSync")
    ) {
      const observers = findUnsafeResizeObservers(text);
      if (observers.length !== 1) continue;
      candidates.push({
        name: match[1],
        observer: observers[0],
        start: match.index,
        end: closeBrace + 1,
        text,
      });
    }
  }
  return candidates;
}

function isThreadVirtualizerLayoutAsset(source) {
  if (source.includes(THREAD_VIRTUALIZER_LAYOUT_MARKER)) return true;
  return findThreadVirtualizerComponents(source).length === 1;
}

function hasUnsafeThreadVirtualizerResizeMeasurement(source) {
  return findThreadVirtualizerComponents(source).length > 0;
}

function applyLinuxThreadVirtualizerLayoutStabilityPatch(source) {
  if (source.includes(THREAD_VIRTUALIZER_LAYOUT_MARKER)) return source;
  const candidates = findThreadVirtualizerComponents(source);
  if (candidates.length !== 1) {
    throw new Error("Could not find unique thread virtualizer component");
  }

  const component = candidates[0];
  const observer = component.observer;
  const unsafeCall = `${observer.updaterAlias}(${observer.measurementsAlias})`;
  const callInObserver = observer.match[0].lastIndexOf(unsafeCall);
  if (callInObserver === -1) {
    throw new Error("Could not find thread virtualizer ResizeObserver measurement call");
  }
  const callStart = observer.match.index + callInObserver;
  const patchedComponent =
    component.text.slice(0, callStart) +
    `${observer.updaterAlias}(${observer.measurementsAlias},!1)` +
    component.text.slice(callStart + unsafeCall.length);
  const marker = `void\`${THREAD_VIRTUALIZER_LAYOUT_MARKER}\`;`;
  const patched =
    source.slice(0, component.start) +
    marker +
    patchedComponent +
    source.slice(component.end);
  if (hasUnsafeThreadVirtualizerResizeMeasurement(patched)) {
    throw new Error("Thread virtualizer still flushes ResizeObserver measurements synchronously");
  }
  return patched;
}

module.exports = {
  THREAD_VIRTUALIZER_LAYOUT_MARKER,
  applyLinuxThreadVirtualizerLayoutStabilityPatch,
  hasUnsafeThreadVirtualizerResizeMeasurement,
  isThreadVirtualizerLayoutAsset,
};
