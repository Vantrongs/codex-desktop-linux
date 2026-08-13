"use strict";

const {
  escapeRegExp,
  findMatchingBrace,
} = require("../../lib/minified-js.js");

const LEGACY_THREAD_VIRTUALIZER_LAYOUT_MARKER =
  "codexLinuxThreadVirtualizerDeferredResizeMeasurement";
const THREAD_VIRTUALIZER_LAYOUT_MARKER =
  "codexLinuxThreadVirtualizerDeferredResizeWork";
const INSTALLED_DEFERRED_WORK_PATTERN =
  /window\.requestAnimationFrame\(\(\)=>\{[A-Za-z_$][\w$]*\([A-Za-z_$][\w$]*\),[A-Za-z_$][\w$]*&&[A-Za-z_$][\w$]*\(\)\}\)/gu;

const IDENTIFIER = "[A-Za-z_$][\\w$]*";

function createResizeObserverPattern({ deferredUpdater }) {
  const updaterArguments = deferredUpdater ? "\\2,!1" : "\\2";
  return new RegExp(
    `new ResizeObserver\\((${IDENTIFIER})=>\\{let (${IDENTIFIER})=new Map,(${IDENTIFIER})=!1;([\\s\\S]{0,1800}?)(${IDENTIFIER})\\(${updaterArguments}\\),\\3&&(${IDENTIFIER})\\(\\)\\}\\)`,
    "u",
  );
}

function hasSynchronousMeasurementUpdater(componentText, updaterAlias) {
  const wrappedUpdaterPattern = new RegExp(
    `(?<![\\w$.])${escapeRegExp(updaterAlias)}=(${IDENTIFIER})\\(\\((${IDENTIFIER}),(${IDENTIFIER})=!0\\)=>\\{`,
    "gu",
  );
  const matches = [];
  let match;
  while ((match = wrappedUpdaterPattern.exec(componentText)) != null) {
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

  const directUpdaterPattern = new RegExp(
    `(?<![\\w$.])${escapeRegExp(updaterAlias)}=\\((${IDENTIFIER}),(${IDENTIFIER})\\)=>\\{`,
    "gu",
  );
  while ((match = directUpdaterPattern.exec(componentText)) != null) {
    const openBrace = match.index + match[0].length - 1;
    const closeBrace = findMatchingBrace(componentText, openBrace);
    if (closeBrace === -1) continue;
    const body = componentText.slice(openBrace + 1, closeBrace);
    const effectiveSyncMatch = new RegExp(
      `(?:let\\s+|,)(${IDENTIFIER})=${escapeRegExp(match[2])}===void 0\\|\\|${escapeRegExp(match[2])}(?:,|;)`,
      "u",
    ).exec(body);
    if (effectiveSyncMatch == null) continue;
    const flushPattern = new RegExp(
      `${escapeRegExp(effectiveSyncMatch[1])}\\?\\(0,${IDENTIFIER}\\.flushSync\\)\\((${IDENTIFIER})\\):\\1\\(\\)`,
      "u",
    );
    if (flushPattern.test(body)) matches.push(match);
  }
  return matches.length === 1;
}

function updaterHasSynchronousMeasurement(componentText, updaterAlias) {
  if (hasSynchronousMeasurementUpdater(componentText, updaterAlias)) return true;
  const wrapperPattern = new RegExp(
    `(?<![\\w$.])${escapeRegExp(updaterAlias)}=${IDENTIFIER}\\((${IDENTIFIER})\\)(?:,|;)`,
    "gu",
  );
  const implementationAliases = [
    ...componentText.matchAll(wrapperPattern),
  ].map((match) => match[1]);
  return (
    implementationAliases.length === 1 &&
    hasSynchronousMeasurementUpdater(componentText, implementationAliases[0])
  );
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

function findUnsafeResizeObservers(componentText, { deferredUpdater }) {
  const matches = [];
  const observerPattern = new RegExp(
    createResizeObserverPattern({ deferredUpdater }).source,
    "gu",
  );
  let match;
  while ((match = observerPattern.exec(componentText)) != null) {
    const updaterAlias = match[5];
    if (observerShadowsUpdater(match, updaterAlias)) continue;
    if (!updaterHasSynchronousMeasurement(componentText, updaterAlias)) continue;
    matches.push({
      match,
      measurementsAlias: match[2],
      updaterAlias,
    });
  }
  return matches;
}

function findThreadVirtualizerComponents(
  source,
  { deferredUpdater = false } = {},
) {
  const candidates = [];
  const functionPattern = new RegExp(
    `function (${IDENTIFIER})\\((?:\\{[^)]*\\}|${IDENTIFIER})\\)\\{`,
    "gu",
  );
  let match;
  while ((match = functionPattern.exec(source)) != null) {
    const openBrace = match.index + match[0].length - 1;
    const closeBrace = findMatchingBrace(source, openBrace);
    if (openBrace === -1 || closeBrace === -1) continue;
    const text = source.slice(match.index, closeBrace + 1);
    if (
      text.includes("latestTurnSynchronousMeasurementKey") &&
      text.includes("latest-turn-follow-content") &&
      text.includes("preserveScrollPositionForNextLayout") &&
      text.includes(".flushSync")
    ) {
      const observers = findUnsafeResizeObservers(text, { deferredUpdater });
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

function findThreadVirtualizerSemanticComponents(source) {
  const candidates = [];
  const functionPattern = new RegExp(
    `function (${IDENTIFIER})\\((?:\\{[^)]*\\}|${IDENTIFIER})\\)\\{`,
    "gu",
  );
  let match;
  while ((match = functionPattern.exec(source)) != null) {
    const openBrace = match.index + match[0].length - 1;
    const closeBrace = findMatchingBrace(source, openBrace);
    if (closeBrace === -1) continue;
    const text = source.slice(match.index, closeBrace + 1);
    if (
      text.includes("latestTurnSynchronousMeasurementKey") &&
      text.includes("latest-turn-follow-content") &&
      text.includes("preserveScrollPositionForNextLayout") &&
      text.includes(".flushSync")
    ) {
      candidates.push({ text });
    }
  }
  return candidates;
}

function hasInstalledDeferredObserverContract(componentText) {
  const observerHeaderPattern = new RegExp(
    `new ResizeObserver\\((${IDENTIFIER})=>\\{let (${IDENTIFIER})=new Map,(${IDENTIFIER})=!1;`,
    "gu",
  );
  const observers = [];
  let header;
  while ((header = observerHeaderPattern.exec(componentText)) != null) {
    const openBrace = header.index + header[0].indexOf("{");
    const closeBrace = findMatchingBrace(componentText, openBrace);
    if (closeBrace === -1) continue;
    const body = componentText.slice(openBrace + 1, closeBrace);
    const deferredPattern = new RegExp(
      `window\\.requestAnimationFrame\\(\\(\\)=>\\{(${IDENTIFIER})\\(${escapeRegExp(header[2])}\\),` +
        `${escapeRegExp(header[3])}&&(${IDENTIFIER})\\(\\)\\}\\)`,
      "gu",
    );
    const deferred = [...body.matchAll(deferredPattern)];
    if (deferred.length !== 1) continue;
    const updaterAlias = deferred[0][1];
    const completionAlias = deferred[0][2];
    const withoutDeferredWork = body.replace(deferred[0][0], "");
    const synchronousUpdaterPattern = new RegExp(
      `(?<![\\w$.])${escapeRegExp(updaterAlias)}\\(` +
        `${escapeRegExp(header[2])}(?:,!1)?\\)`,
      "u",
    );
    const synchronousCompletionPattern = new RegExp(
      `(?<![\\w$.])${escapeRegExp(completionAlias)}\\(\\)`,
      "u",
    );
    if (
      synchronousUpdaterPattern.test(withoutDeferredWork) ||
      synchronousCompletionPattern.test(withoutDeferredWork)
    ) {
      continue;
    }
    observers.push(header);
  }
  return observers.length === 1;
}

function hasInstalledThreadVirtualizerLayout(source) {
  const components = findThreadVirtualizerSemanticComponents(source);
  return source.split(THREAD_VIRTUALIZER_LAYOUT_MARKER).length - 1 === 1 &&
    [...source.matchAll(INSTALLED_DEFERRED_WORK_PATTERN)].length === 1 &&
    components.length === 1 &&
    hasInstalledDeferredObserverContract(components[0].text);
}

function isThreadVirtualizerLayoutAsset(source) {
  if (source.includes(THREAD_VIRTUALIZER_LAYOUT_MARKER)) {
    return hasInstalledThreadVirtualizerLayout(source);
  }
  const deferredUpdater = source.includes(
    LEGACY_THREAD_VIRTUALIZER_LAYOUT_MARKER,
  );
  return findThreadVirtualizerComponents(source, { deferredUpdater }).length === 1;
}

function hasUnsafeThreadVirtualizerResizeWork(source) {
  if (source.includes(THREAD_VIRTUALIZER_LAYOUT_MARKER)) {
    return !hasInstalledThreadVirtualizerLayout(source);
  }
  const deferredUpdater = source.includes(
    LEGACY_THREAD_VIRTUALIZER_LAYOUT_MARKER,
  );
  return findThreadVirtualizerComponents(source, { deferredUpdater }).length > 0;
}

function applyLinuxThreadVirtualizerLayoutStabilityPatch(source) {
  if (source.includes(THREAD_VIRTUALIZER_LAYOUT_MARKER)) {
    if (hasInstalledThreadVirtualizerLayout(source)) return source;
    throw new Error("Found partial thread virtualizer layout stability markers");
  }
  const deferredUpdater = source.includes(
    LEGACY_THREAD_VIRTUALIZER_LAYOUT_MARKER,
  );
  if (
    deferredUpdater &&
    source.split(LEGACY_THREAD_VIRTUALIZER_LAYOUT_MARKER).length - 1 !== 1
  ) {
    throw new Error("Could not find unique previous thread virtualizer marker");
  }
  const candidates = findThreadVirtualizerComponents(source, { deferredUpdater });
  if (candidates.length !== 1) {
    throw new Error("Could not find unique thread virtualizer component");
  }

  const component = candidates[0];
  const observer = component.observer;
  const unsafeWork =
    `${observer.updaterAlias}(${observer.measurementsAlias}` +
    `${deferredUpdater ? ",!1" : ""}),` +
    `${observer.match[3]}&&${observer.match[6]}()`;
  const workInObserver = observer.match[0].lastIndexOf(unsafeWork);
  if (workInObserver === -1) {
    throw new Error("Could not find thread virtualizer ResizeObserver work");
  }
  const workStart = observer.match.index + workInObserver;
  const deferredWork =
    `window.requestAnimationFrame(()=>{${observer.updaterAlias}(` +
    `${observer.measurementsAlias}),${observer.match[3]}&&${observer.match[6]}()})`;
  const patchedComponent =
    component.text.slice(0, workStart) +
    deferredWork +
    component.text.slice(workStart + unsafeWork.length);
  const marker = `void\`${THREAD_VIRTUALIZER_LAYOUT_MARKER}\`;`;
  let patched =
    source.slice(0, component.start) +
    patchedComponent +
    source.slice(component.end);
  if (deferredUpdater) {
    patched = patched.replace(
      LEGACY_THREAD_VIRTUALIZER_LAYOUT_MARKER,
      THREAD_VIRTUALIZER_LAYOUT_MARKER,
    );
  } else {
    patched =
      patched.slice(0, component.start) +
      marker +
      patched.slice(component.start);
  }
  if (hasUnsafeThreadVirtualizerResizeWork(patched)) {
    throw new Error("Thread virtualizer still performs resize work synchronously");
  }
  return patched;
}

module.exports = {
  INSTALLED_DEFERRED_WORK_PATTERN,
  LEGACY_THREAD_VIRTUALIZER_LAYOUT_MARKER,
  THREAD_VIRTUALIZER_LAYOUT_MARKER,
  applyLinuxThreadVirtualizerLayoutStabilityPatch,
  hasUnsafeThreadVirtualizerResizeWork,
  isThreadVirtualizerLayoutAsset,
};
