"use strict";

const IDENTIFIER = "[A-Za-z_$][\\w$]*";
const DRAIN_CAPABILITY_GATE_PATTERN = new RegExp(
  `this\\.suppressResumeHistoryDrain=` +
    `this\\.runtimeSettings\\.suppressResumeHistoryDrain\\?\\?` +
    `\\(\\(\\)=>this\\.supportsPaginatedThreadHistory\\(\\)&&` +
    `${IDENTIFIER}\\.history\\.paginatedHistoryEnabled\\)`,
  "gu",
);

// Official 26.908 enables pagination unconditionally. Verify that contract
// without retaining the obsolete remote-flag rewrite or modifying the bundle.
function isThreadHistoryPaginationAsset(source) {
  return (
    [...source.matchAll(/\bpaginatedHistoryEnabled\b/gu)].length === 2 &&
    [...source.matchAll(/\bpaginatedHistoryEnabled:!0(?=,|\})/gu)].length === 1 &&
    [...source.matchAll(new RegExp(DRAIN_CAPABILITY_GATE_PATTERN.source, "gu"))]
      .length === 1 &&
    !source.includes("readPaginatedHistoryEnabled") &&
    source.includes("source:`tail_history`")
  );
}

function verifyLinuxThreadHistoryPagination(source) {
  if (!isThreadHistoryPaginationAsset(source)) {
    throw new Error("Could not verify native thread history pagination contract");
  }
  return source;
}

module.exports = {
  isThreadHistoryPaginationAsset,
  verifyLinuxThreadHistoryPagination,
};
