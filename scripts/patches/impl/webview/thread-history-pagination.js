"use strict";

const THREAD_HISTORY_PAGINATION_MARKER =
  "codexLinuxThreadHistoryUsesServerPagination";
const IDENTIFIER = "[A-Za-z_$][\\w$]*";

const UNSAFE_GATE_PATTERN = new RegExp(
  `function (${IDENTIFIER})\\((${IDENTIFIER}),(${IDENTIFIER})\\)\\{` +
    `if\\(\\2==null\\|\\|!\\3\\(\\)\\)return!1;` +
    `let (${IDENTIFIER})=\\2\\.get\\((${IDENTIFIER})\\);` +
    `return \\4\\?\\.loadingStatus===\`Ready\`&&(${IDENTIFIER})` +
    `\\(\\4,\`1865103671\`\\)\\.get\\(\`enabled\`,!1\\)===!0\\}`,
  "gu",
);

const INSTALLED_GATE_PATTERN = new RegExp(
  `void\`${THREAD_HISTORY_PAGINATION_MARKER}\`;` +
    `function (${IDENTIFIER})\\((${IDENTIFIER}),(${IDENTIFIER})\\)` +
    `\\{return \\3\\(\\)===!0\\}`,
  "gu",
);

function unsafeGates(source) {
  return [...source.matchAll(new RegExp(UNSAFE_GATE_PATTERN.source, "gu"))];
}

function installedGates(source) {
  return [...source.matchAll(new RegExp(INSTALLED_GATE_PATTERN.source, "gu"))];
}

function hasInstalledThreadHistoryPagination(source) {
  const installed = installedGates(source);
  if (
    source.split(THREAD_HISTORY_PAGINATION_MARKER).length - 1 !== 1 ||
    installed.length !== 1 ||
    unsafeGates(source).length !== 0
  ) {
    return false;
  }
  const gateName = installed[0][1];
  return (
    source.includes("suppressResumeHistoryDrain") &&
    source.includes("supportsPaginatedThreadHistory") &&
    source.includes("source:`tail_history`") &&
    source.includes(`${gateName}(`)
  );
}

function isThreadHistoryPaginationAsset(source) {
  if (source.includes(THREAD_HISTORY_PAGINATION_MARKER)) {
    return hasInstalledThreadHistoryPagination(source);
  }
  return (
    unsafeGates(source).length === 1 &&
    source.includes("suppressResumeHistoryDrain") &&
    source.includes("supportsPaginatedThreadHistory") &&
    source.includes("source:`tail_history`")
  );
}

function hasUnsafeThreadHistoryDrainGate(source) {
  if (source.includes(THREAD_HISTORY_PAGINATION_MARKER)) {
    return !hasInstalledThreadHistoryPagination(source);
  }
  return unsafeGates(source).length > 0;
}

function applyLinuxThreadHistoryPaginationPatch(source) {
  if (source.includes(THREAD_HISTORY_PAGINATION_MARKER)) {
    if (hasInstalledThreadHistoryPagination(source)) return source;
    throw new Error("Found partial thread history pagination patch");
  }

  const gates = unsafeGates(source);
  if (gates.length !== 1) {
    throw new Error("Could not find unique thread history resume drain gate");
  }
  const gate = gates[0];
  const replacement =
    `void\`${THREAD_HISTORY_PAGINATION_MARKER}\`;` +
    `function ${gate[1]}(${gate[2]},${gate[3]}){return ${gate[3]}()===!0}`;
  return (
    source.slice(0, gate.index) +
    replacement +
    source.slice(gate.index + gate[0].length)
  );
}

module.exports = {
  THREAD_HISTORY_PAGINATION_MARKER,
  applyLinuxThreadHistoryPaginationPatch,
  hasUnsafeThreadHistoryDrainGate,
  isThreadHistoryPaginationAsset,
};
