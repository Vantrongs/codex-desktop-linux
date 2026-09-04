"use strict";

const THREAD_HISTORY_PAGINATION_MARKER =
  "codexLinuxThreadHistoryUsesServerPagination";
const IDENTIFIER = "[A-Za-z_$][\\w$]*";

const UNSAFE_SETTINGS_GATE_PATTERN = new RegExp(
  `readPaginatedHistoryEnabled\\(\\)\\{` +
    `let (${IDENTIFIER})=(${IDENTIFIER})\\?\\.get\\((${IDENTIFIER})\\);` +
    `return \\1\\?\\.loadingStatus===\`Ready\`&&(${IDENTIFIER})` +
    `\\(\\1,(${IDENTIFIER})\\.paginatedHistory\\)` +
    `\\.get\\(\`enabled\`,!1\\)===!0\\}`,
  "gu",
);

const INSTALLED_SETTINGS_GATE_PATTERN = new RegExp(
  `readPaginatedHistoryEnabled\\(\\)\\{` +
    `return void\`${THREAD_HISTORY_PAGINATION_MARKER}\`,!0\\}`,
  "gu",
);

const CURRENT_DRAIN_CAPABILITY_GATE_PATTERN = new RegExp(
  `this\\.suppressResumeHistoryDrain=` +
    `this\\.runtimeSettings\\.suppressResumeHistoryDrain\\?\\?` +
    `\\(\\(\\)=>this\\.supportsPaginatedThreadHistory\\(\\)&&` +
    `${IDENTIFIER}\\.history\\.readPaginatedHistoryEnabled\\(\\)\\)`,
  "gu",
);

function unsafeSettingsGates(source) {
  return [
    ...source.matchAll(new RegExp(UNSAFE_SETTINGS_GATE_PATTERN.source, "gu")),
  ];
}

function installedSettingsGates(source) {
  return [
    ...source.matchAll(new RegExp(INSTALLED_SETTINGS_GATE_PATTERN.source, "gu")),
  ];
}

function currentDrainCapabilityGates(source) {
  return [
    ...source.matchAll(
      new RegExp(CURRENT_DRAIN_CAPABILITY_GATE_PATTERN.source, "gu"),
    ),
  ];
}

function hasInstalledThreadHistoryPagination(source) {
  const installed = installedSettingsGates(source);
  if (
    source.split(THREAD_HISTORY_PAGINATION_MARKER).length - 1 !== 1 ||
    installed.length !== 1 ||
    unsafeSettingsGates(source).length !== 0 ||
    currentDrainCapabilityGates(source).length !== 1
  ) {
    return false;
  }
  return (
    source.includes("source:`tail_history`") &&
    source.includes(".history.readPaginatedHistoryEnabled()")
  );
}

function isThreadHistoryPaginationAsset(source) {
  if (source.includes(THREAD_HISTORY_PAGINATION_MARKER)) {
    return hasInstalledThreadHistoryPagination(source);
  }
  return (
    unsafeSettingsGates(source).length === 1 &&
    currentDrainCapabilityGates(source).length === 1 &&
    source.includes("source:`tail_history`") &&
    source.includes(".history.readPaginatedHistoryEnabled()")
  );
}

function hasUnsafeThreadHistoryDrainGate(source) {
  if (source.includes(THREAD_HISTORY_PAGINATION_MARKER)) {
    return !hasInstalledThreadHistoryPagination(source);
  }
  return unsafeSettingsGates(source).length > 0;
}

function applyLinuxThreadHistoryPaginationPatch(source) {
  if (source.includes(THREAD_HISTORY_PAGINATION_MARKER)) {
    if (hasInstalledThreadHistoryPagination(source)) return source;
    throw new Error("Found partial thread history pagination patch");
  }

  const gates = unsafeSettingsGates(source);
  if (gates.length !== 1) {
    throw new Error(
      "Could not find unique current thread history pagination settings gate",
    );
  }
  if (currentDrainCapabilityGates(source).length !== 1) {
    throw new Error(
      "Could not find unique current thread history resume drain capability gate",
    );
  }
  const gate = gates[0];
  const replacement =
    "readPaginatedHistoryEnabled(){" +
    `return void\`${THREAD_HISTORY_PAGINATION_MARKER}\`,!0}`;
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
