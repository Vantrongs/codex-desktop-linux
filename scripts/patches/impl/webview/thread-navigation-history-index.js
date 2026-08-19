"use strict";

const { findMatchingBrace } = require("../../lib/minified-js.js");

const THREAD_NAVIGATION_HISTORY_INDEX_MARKER =
  "codexLinuxThreadNavigationUsesHistoryIndex";
const IDENTIFIER = "[A-Za-z_$][\\w$]*";

const UPSTREAM_FLAG_PATTERN = new RegExp(
  `(${IDENTIFIER})=(${IDENTIFIER})\\(` + "`209459230`" + `\\)`,
  "gu",
);
const INSTALLED_FLAG_PATTERN = new RegExp(
  `(${IDENTIFIER})=\\(void` +
    "`" +
    THREAD_NAVIGATION_HISTORY_INDEX_MARKER +
    "`" +
    `,!0\\)`,
  "gu",
);

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function matchesHistoryIndexContract(source, flagName, flagIndex) {
  const functionStart = source.lastIndexOf("function ", flagIndex);
  const functionEnd = source.indexOf("function ", flagIndex);
  if (functionStart < 0 || functionEnd < 0) return false;

  const threadFunction = source.slice(functionStart, functionEnd);
  const id = IDENTIFIER;
  const railGate = new RegExp(
    `${id}=${escapeRegExp(flagName)}&&${id}==null&&` +
      `${id}===` +
      "`paginated`" +
      `&&!${id},${id}=${id}&&!${id}&&${id}!==` +
      "`subagent`" +
      `,\\{data:${id}\\}=${id}\\(${id},${id}\\?${id}:null\\),` +
      `${id}=${id}&&${id}\\?\\.complete===!0`,
    "u",
  );
  if (!railGate.test(threadFunction)) return false;

  const queryIndex = source.indexOf("prompt-rail-history");
  if (queryIndex < 0) return false;
  const queryModule = source.slice(
    Math.max(0, queryIndex - 2_500),
    queryIndex + 1_000,
  );
  return (
    queryModule.includes("itemsView:`notLoaded`,sortDirection:`desc`") &&
    queryModule.includes("nextCursor==null)return{items:r.reverse(),complete:!0}") &&
    queryModule.includes("return{items:r.reverse(),complete:!1}") &&
    queryModule.includes("itemsView:`full`,sortDirection:`desc`")
  );
}

function hasHistoryIndexQueryContract(source) {
  const queryIndex = source.indexOf("prompt-rail-history");
  if (queryIndex < 0) return false;
  const queryModule = source.slice(
    Math.max(0, queryIndex - 2_500),
    queryIndex + 1_000,
  );
  return (
    queryModule.includes("itemsView:`notLoaded`,sortDirection:`desc`") &&
    queryModule.includes("nextCursor==null)return{items:r.reverse(),complete:!0}") &&
    queryModule.includes("return{items:r.reverse(),complete:!1}") &&
    queryModule.includes("itemsView:`full`,sortDirection:`desc`")
  );
}

function findIntegratedHistoryIndexContracts(source) {
  const contracts = [];
  let historyAliasIndex = -1;
  while ((historyAliasIndex = source.indexOf("usesHistoryTimeline:", historyAliasIndex + 1)) !== -1) {
    const functionStart = source.lastIndexOf("function ", historyAliasIndex);
    if (functionStart < 0) continue;
    const parameterEnd = source.indexOf("){", historyAliasIndex);
    const openBrace = parameterEnd < 0 ? -1 : parameterEnd + 1;
    const closeBrace = findMatchingBrace(source, openBrace);
    if (openBrace < 0 || closeBrace < historyAliasIndex) continue;
    const threadFunction = source.slice(functionStart, closeBrace + 1);
    const historyAlias = new RegExp(`usesHistoryTimeline:(${IDENTIFIER})`, "u")
      .exec(threadFunction)?.[1];
    if (historyAlias == null) continue;

    const historyGate = new RegExp(
      `(${IDENTIFIER})=${escapeRegExp(historyAlias)}&&!(${IDENTIFIER})`,
      "u",
    ).exec(threadFunction);
    if (historyGate == null) continue;
    const historyGateAlias = historyGate[1];

    const paginatedGate = new RegExp(
      `(${IDENTIFIER})=${escapeRegExp(historyGateAlias)}&&(${IDENTIFIER})===` +
        "`paginated`",
      "u",
    ).exec(threadFunction);
    if (paginatedGate == null) continue;
    const modeAlias = paginatedGate[2];

    const railGate = new RegExp(
      `(${IDENTIFIER})=${escapeRegExp(historyGateAlias)}&&\\(` +
        `${escapeRegExp(modeAlias)}===` +
        "`paginated`" +
        `\\|\\|${escapeRegExp(modeAlias)}===` +
        "`legacy`" +
        `&&${IDENTIFIER}\\(${IDENTIFIER}\\)\\)&&!${IDENTIFIER}&&` +
        `${IDENTIFIER}!==` +
        "`subagent`",
      "u",
    ).exec(threadFunction);
    if (railGate == null) continue;
    const railGateAlias = railGate[1];

    const queryGate = new RegExp(
      `\\{data:(${IDENTIFIER})\\}=${IDENTIFIER}\\(${IDENTIFIER},` +
        `${escapeRegExp(railGateAlias)}\\?${IDENTIFIER}:null\\),` +
        `${IDENTIFIER}=${escapeRegExp(railGateAlias)}&&\\1\\?\\.complete===!0`,
      "u",
    ).exec(threadFunction);
    if (queryGate == null) continue;
    contracts.push({ start: functionStart, end: closeBrace + 1 });
  }
  return contracts;
}

function hasIntegratedThreadNavigationHistoryIndex(source) {
  return (
    !source.includes(THREAD_NAVIGATION_HISTORY_INDEX_MARKER) &&
    upstreamFlags(source).length === 0 &&
    findIntegratedHistoryIndexContracts(source).length === 1 &&
    hasHistoryIndexQueryContract(source)
  );
}

function installedFlags(source) {
  return [...source.matchAll(new RegExp(INSTALLED_FLAG_PATTERN.source, "gu"))];
}

function upstreamFlags(source) {
  return [...source.matchAll(new RegExp(UPSTREAM_FLAG_PATTERN.source, "gu"))];
}

function hasInstalledThreadNavigationHistoryIndex(source) {
  const installed = installedFlags(source);
  return (
    source.split(THREAD_NAVIGATION_HISTORY_INDEX_MARKER).length - 1 === 1 &&
    installed.length === 1 &&
    upstreamFlags(source).length === 0 &&
    matchesHistoryIndexContract(source, installed[0][1], installed[0].index)
  );
}

function isThreadNavigationHistoryIndexAsset(source) {
  if (source.includes(THREAD_NAVIGATION_HISTORY_INDEX_MARKER)) {
    return hasInstalledThreadNavigationHistoryIndex(source);
  }
  const upstream = upstreamFlags(source);
  return hasIntegratedThreadNavigationHistoryIndex(source) || (
    upstream.length === 1 &&
    matchesHistoryIndexContract(source, upstream[0][1], upstream[0].index)
  );
}

function applyLinuxThreadNavigationHistoryIndexPatch(source) {
  if (source.includes(THREAD_NAVIGATION_HISTORY_INDEX_MARKER)) {
    if (hasInstalledThreadNavigationHistoryIndex(source)) return source;
    throw new Error("Found partial thread navigation history index patch");
  }

  if (hasIntegratedThreadNavigationHistoryIndex(source)) return source;

  const upstream = upstreamFlags(source);
  if (
    upstream.length !== 1 ||
    !matchesHistoryIndexContract(source, upstream[0][1], upstream[0].index)
  ) {
    throw new Error("Could not find unique thread navigation history index gate");
  }

  const match = upstream[0];
  const replacement =
    `${match[1]}=(void\`${THREAD_NAVIGATION_HISTORY_INDEX_MARKER}\`,!0)`;
  return (
    source.slice(0, match.index) +
    replacement +
    source.slice(match.index + match[0].length)
  );
}

module.exports = {
  THREAD_NAVIGATION_HISTORY_INDEX_MARKER,
  applyLinuxThreadNavigationHistoryIndexPatch,
  hasInstalledThreadNavigationHistoryIndex,
  isThreadNavigationHistoryIndexAsset,
};
