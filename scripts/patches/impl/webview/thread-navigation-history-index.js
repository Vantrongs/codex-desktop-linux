"use strict";

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
  return (
    upstream.length === 1 &&
    matchesHistoryIndexContract(source, upstream[0][1], upstream[0].index)
  );
}

function applyLinuxThreadNavigationHistoryIndexPatch(source) {
  if (source.includes(THREAD_NAVIGATION_HISTORY_INDEX_MARKER)) {
    if (hasInstalledThreadNavigationHistoryIndex(source)) return source;
    throw new Error("Found partial thread navigation history index patch");
  }

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
