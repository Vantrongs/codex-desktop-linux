"use strict";

const { findMatchingBrace } = require("../../lib/minified-js.js");

const SUBAGENT_RUNTIME_STATUS_MARKER =
  "codexLinuxSubagentRuntimeStatusReconciliation";
const STATUS_HELPER_NAME = "codexLinuxSubagentRuntimeStatus";
const STATUS_HELPER =
  `void\`${SUBAGENT_RUNTIME_STATUS_MARKER}\`;` +
  `function ${STATUS_HELPER_NAME}(e){switch(e?.type){case\`active\`:return\`active\`;` +
  "case`idle`:case`notLoaded`:return`done`;case`systemError`:return`hidden`;" +
  "default:return`done`}}";
const IDENTIFIER = "[A-Za-z_$][\\w$]*";

const PROJECTION_BUILDER_PATTERN = new RegExp(
  `function (${IDENTIFIER})\\(\\{cachedConversations:(${IDENTIFIER}),` +
    `conversationTurns:(${IDENTIFIER}),getThreadRuntimeStatusEvidence:(${IDENTIFIER}),` +
    `parentConversationId:(${IDENTIFIER}),sourceLinkedThreads:(${IDENTIFIER}),` +
    `threadSummaries:(${IDENTIFIER})=\\[\\]\\}\\)\\{`,
  "gu",
);
const PROJECTION_PATTERN = new RegExp(
  `function (${IDENTIFIER})\\(\\{membership:(${IDENTIFIER}),` +
    `latestReference:(${IDENTIFIER}),childConversation:(${IDENTIFIER}),` +
    `currentParentTurnKey:(${IDENTIFIER}),inProgressParentTurnKeys:(${IDENTIFIER}),` +
    `runtimeStatus:(${IDENTIFIER})\\}\\)\\{`,
  "gu",
);
const UNSAFE_TURN_STATE_PATTERN = new RegExp(
  `function (${IDENTIFIER})\\((${IDENTIFIER})\\)\\{return \\2\\?\\.threadRuntimeStatus` +
    `\\?\\.type===\`active\`\\?\`inProgress\`:` +
    `\\2\\?\\.threadRuntimeStatus!=null&&\\2\\.threadRuntimeStatus\\.type!==` +
    `\`notLoaded\`\\?\`notInProgress\`:` +
    `\\2==null\\|\\|\\2\\.turns\\.length===0\\?\`unknown\`:` +
    `\\2\\.turns\\[\\2\\.turns\\.length-1\\]\\?\\.status===` +
    `\`inProgress\`\\?\`inProgress\`:\`notInProgress\`\\}`,
  "gu",
);
const INSTALLED_TURN_STATE_PATTERN = new RegExp(
  `function (${IDENTIFIER})\\((${IDENTIFIER})\\)\\{return \\2\\?\\.threadRuntimeStatus` +
    `!=null\\?\\2\\.threadRuntimeStatus\\.type===\`active\`` +
    `\\?\`inProgress\`:\`notInProgress\`:` +
    `\\2==null\\|\\|\\2\\.turns\\.length===0\\?\`unknown\`:` +
    `\\2\\.turns\\[\\2\\.turns\\.length-1\\]\\?\\.status===` +
    `\`inProgress\`\\?\`inProgress\`:\`notInProgress\`\\}`,
  "gu",
);

function findFunctions(source, pattern) {
  const matches = [];
  for (const match of source.matchAll(new RegExp(pattern.source, "gu"))) {
    const open = match.index + match[0].length - 1;
    const close = findMatchingBrace(source, open);
    if (close === -1) continue;
    matches.push({
      match,
      start: match.index,
      end: close + 1,
      text: source.slice(match.index, close + 1),
    });
  }
  return matches;
}

function builderRuntimePattern(evidenceAlias, { installed }) {
  const suffix = installed
    ? `\\?\\?\\1\\.thread\\?\\.status\\?\\?`
    : "\\?\\?";
  return new RegExp(
    `runtimeStatus:${evidenceAlias.replace(/[$]/gu, "\\$")}\\?\\.` +
      `\\((${IDENTIFIER})\\.conversationId\\)${suffix}` +
      `(${IDENTIFIER})\\((${IDENTIFIER}),(${IDENTIFIER})\\)`,
    "gu",
  );
}

function findBuilderContracts(source, { installed }) {
  const contracts = [];
  for (const fn of findFunctions(source, PROJECTION_BUILDER_PATTERN)) {
    const evidenceAlias = fn.match[4];
    const matches = [
      ...fn.text.matchAll(builderRuntimePattern(evidenceAlias, { installed })),
    ];
    if (matches.length !== 1) continue;
    contracts.push({ fn, runtime: matches[0] });
  }
  return contracts;
}

function projectionStatusPattern(runtimeAlias, fallbackAlias, { installed }) {
  if (installed) {
    return new RegExp(
      `(${IDENTIFIER})=${STATUS_HELPER_NAME}\\(${runtimeAlias.replace(/[$]/gu, "\\$")}` +
        `\\?\\?${fallbackAlias.replace(/[$]/gu, "\\$")}\\)`,
      "gu",
    );
  }
  return new RegExp(
    `(${IDENTIFIER})=${runtimeAlias.replace(/[$]/gu, "\\$")}==null\\|\\|` +
      `${runtimeAlias.replace(/[$]/gu, "\\$")}\\.type===\`notLoaded\`` +
      `\\?\`unknown\`:(${IDENTIFIER})\\((${IDENTIFIER})` +
      `\\(${runtimeAlias.replace(/[$]/gu, "\\$")}\\)\\)`,
    "gu",
  );
}

function findProjectionContracts(source, { installed }) {
  const contracts = [];
  for (const fn of findFunctions(source, PROJECTION_PATTERN)) {
    if (!fn.text.includes("statusSummary") || !fn.text.includes("showInlineActivity")) {
      continue;
    }
    const membershipAlias = fn.match[2];
    const runtimeAlias = fn.match[7];
    const fallback = new RegExp(
      `let (${IDENTIFIER})=${membershipAlias.replace(/[$]/gu, "\\$")}\\.thread\\?\\.status`,
      "u",
    ).exec(fn.text)?.[1];
    if (fallback == null) continue;
    const statuses = [
      ...fn.text.matchAll(
        projectionStatusPattern(runtimeAlias, fallback, { installed }),
      ),
    ];
    if (statuses.length !== 1) continue;
    contracts.push({ fn, fallback, runtimeAlias, status: statuses[0] });
  }
  return contracts;
}

function matchAll(source, pattern) {
  return [...source.matchAll(new RegExp(pattern.source, "gu"))];
}

function hasInstalledSubagentRuntimeStatus(source) {
  return (
    source.split(SUBAGENT_RUNTIME_STATUS_MARKER).length - 1 === 1 &&
    source.split(STATUS_HELPER).length - 1 === 1 &&
    findBuilderContracts(source, { installed: true }).length === 1 &&
    findBuilderContracts(source, { installed: false }).length === 0 &&
    findProjectionContracts(source, { installed: true }).length === 1 &&
    findProjectionContracts(source, { installed: false }).length === 0 &&
    matchAll(source, INSTALLED_TURN_STATE_PATTERN).length === 1 &&
    matchAll(source, UNSAFE_TURN_STATE_PATTERN).length === 0
  );
}

function isSubagentRuntimeStatusAsset(source) {
  if (source.includes(SUBAGENT_RUNTIME_STATUS_MARKER)) {
    return hasInstalledSubagentRuntimeStatus(source);
  }
  return (
    findBuilderContracts(source, { installed: false }).length === 1 &&
    findProjectionContracts(source, { installed: false }).length === 1 &&
    matchAll(source, UNSAFE_TURN_STATE_PATTERN).length === 1
  );
}

function hasUnsafeSubagentRuntimeStatusInference(source) {
  if (source.includes(SUBAGENT_RUNTIME_STATUS_MARKER)) {
    return !hasInstalledSubagentRuntimeStatus(source);
  }
  return (
    findBuilderContracts(source, { installed: false }).length > 0 ||
    findProjectionContracts(source, { installed: false }).length > 0 ||
    matchAll(source, UNSAFE_TURN_STATE_PATTERN).length > 0
  );
}

function replaceAt(source, start, length, replacement) {
  return source.slice(0, start) + replacement + source.slice(start + length);
}

function applyLinuxSubagentRuntimeStatusPatch(source) {
  if (source.includes(SUBAGENT_RUNTIME_STATUS_MARKER)) {
    if (hasInstalledSubagentRuntimeStatus(source)) return source;
    throw new Error("Found partial subagent runtime status patch");
  }

  const builders = findBuilderContracts(source, { installed: false });
  const projections = findProjectionContracts(source, { installed: false });
  const turnStates = matchAll(source, UNSAFE_TURN_STATE_PATTERN);
  if (builders.length !== 1 || projections.length !== 1 || turnStates.length !== 1) {
    throw new Error("Could not find unique subagent runtime status contracts");
  }

  const builder = builders[0];
  const projection = projections[0];
  const turnState = turnStates[0];
  const builderRuntimeStart = builder.fn.start + builder.runtime.index;
  const builderRuntimeReplacement = builder.runtime[0].replace(
    "??",
    `??${builder.runtime[1]}.thread?.status??`,
  );
  const projectionStatusStart = projection.fn.start + projection.status.index;
  const projectionStatusReplacement =
    `${projection.status[1]}=${STATUS_HELPER_NAME}(` +
    `${projection.runtimeAlias}??${projection.fallback})`;
  const turnStateReplacement =
    `function ${turnState[1]}(${turnState[2]}){return ` +
    `${turnState[2]}?.threadRuntimeStatus!=null?` +
    `${turnState[2]}.threadRuntimeStatus.type===\`active\`?\`inProgress\`:\`notInProgress\`:` +
    `${turnState[2]}==null||${turnState[2]}.turns.length===0?\`unknown\`:` +
    `${turnState[2]}.turns[${turnState[2]}.turns.length-1]?.status===\`inProgress\`` +
    "?`inProgress`:`notInProgress`}";

  const edits = [
    {
      start: builderRuntimeStart,
      length: builder.runtime[0].length,
      replacement: builderRuntimeReplacement,
    },
    {
      start: projectionStatusStart,
      length: projection.status[0].length,
      replacement: projectionStatusReplacement,
    },
    {
      start: projection.fn.start,
      length: 0,
      replacement: STATUS_HELPER,
    },
    {
      start: turnState.index,
      length: turnState[0].length,
      replacement: turnStateReplacement,
    },
  ].sort((left, right) => right.start - left.start);

  let patched = source;
  for (const edit of edits) {
    patched = replaceAt(patched, edit.start, edit.length, edit.replacement);
  }
  if (!hasInstalledSubagentRuntimeStatus(patched)) {
    throw new Error("Subagent runtime status patch did not satisfy its contract");
  }
  return patched;
}

function classifySubagentRuntimeStatus(status) {
  switch (status?.type) {
    case "active":
      return "active";
    case "idle":
    case "notLoaded":
      return "done";
    case "systemError":
      return "hidden";
    default:
      return "done";
  }
}

module.exports = {
  SUBAGENT_RUNTIME_STATUS_MARKER,
  applyLinuxSubagentRuntimeStatusPatch,
  classifySubagentRuntimeStatus,
  hasUnsafeSubagentRuntimeStatusInference,
  isSubagentRuntimeStatusAsset,
};
