"use strict";

const { findMatchingBrace } = require("../../lib/minified-js.js");

const IDENTIFIER = "[A-Za-z_$][\\w$]*";
const PROJECTION_BUILDER_PATTERN = new RegExp(
  `function (${IDENTIFIER})\\(\\{cachedConversations:(${IDENTIFIER}),` +
    `conversationTurns:(${IDENTIFIER}),getIndexedSubagentItems:(${IDENTIFIER}),` +
    `getIndexedSubagentProgress:(${IDENTIFIER}),parentConversationId:(${IDENTIFIER}),` +
    `sourceLinkedThreads:(${IDENTIFIER}),sourceLinkedThreadsDiscoveryComplete:(${IDENTIFIER})=` +
    `\\7!=null,threadSummaries:(${IDENTIFIER})=\\[\\]\\}\\)\\{`,
  "gu",
);
const PROJECTION_PATTERN = new RegExp(
  `function (${IDENTIFIER})\\(\\{membership:(${IDENTIFIER}),` +
    `latestReference:(${IDENTIFIER}),childConversation:(${IDENTIFIER}),` +
    `currentParentTurnKey:(${IDENTIFIER}),discoveryComplete:(${IDENTIFIER}),` +
    `runtimeStatus:(${IDENTIFIER})\\}\\)\\{`,
  "gu",
);

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function findFunctions(source, pattern) {
  const matches = [];
  for (const match of source.matchAll(new RegExp(pattern.source, "gu"))) {
    const open = match.index + match[0].length - 1;
    const close = findMatchingBrace(source, open);
    if (close < 0) continue;
    matches.push({ match, text: source.slice(match.index, close + 1) });
  }
  return matches;
}

function builderUsesCanonicalRuntime(builder) {
  const runtime = new RegExp(
    `runtimeStatus:(${IDENTIFIER})\\.runtimeStatus\\?\\?${IDENTIFIER}\\(` +
      `${IDENTIFIER}\\.get\\(\\1\\.conversationId\\),${IDENTIFIER}\\)` +
      `\\?\\?\\1\\.thread\\?\\.status\\?\\?null`,
    "u",
  );
  const child = new RegExp(
    `threadRuntimeStatus:(${IDENTIFIER})\\.runtimeStatus\\?\\?` +
      `${IDENTIFIER}\\.threadRuntimeStatus`,
    "u",
  );
  return runtime.test(builder.text) && child.test(builder.text);
}

function projectionUsesExplicitLiveRuntime(projection) {
  const discovery = escapeRegExp(projection.match[6]);
  const runtime = escapeRegExp(projection.match[7]);
  const status = new RegExp(
    `${runtime}==null\\?${discovery}\\?` +
      "`done`:[^;]{0,600}:" +
      `${runtime}\\.type===` + "`active`" + `\\?` + "`active`:`done`",
    "u",
  );
  return (
    projection.text.includes(`${projection.match[7]}?.type===\`systemError\``) &&
    status.test(projection.text) &&
    projection.text.includes("statusSummary:") &&
    projection.text.includes("showInlineActivity:")
  );
}

function hasOfficialSubagentRuntimeStatusContract(source) {
  const builders = findFunctions(source, PROJECTION_BUILDER_PATTERN);
  const projections = findFunctions(source, PROJECTION_PATTERN);
  return (
    builders.length === 1 &&
    projections.length === 1 &&
    builderUsesCanonicalRuntime(builders[0]) &&
    projectionUsesExplicitLiveRuntime(projections[0])
  );
}

function isSubagentRuntimeStatusAsset(source) {
  return hasOfficialSubagentRuntimeStatusContract(source);
}

function hasUnsafeSubagentRuntimeStatusInference(source) {
  return !hasOfficialSubagentRuntimeStatusContract(source);
}

function applyLinuxSubagentRuntimeStatusPatch(source) {
  if (!hasOfficialSubagentRuntimeStatusContract(source)) {
    throw new Error(
      "Current subagent projector does not satisfy the canonical runtime status contract",
    );
  }
  return source;
}

function classifySubagentRuntimeStatus(status) {
  switch (status?.type) {
    case "active":
      return "active";
    case "systemError":
      return "hidden";
    default:
      return "done";
  }
}

module.exports = {
  applyLinuxSubagentRuntimeStatusPatch,
  classifySubagentRuntimeStatus,
  hasOfficialSubagentRuntimeStatusContract,
  hasUnsafeSubagentRuntimeStatusInference,
  isSubagentRuntimeStatusAsset,
};
