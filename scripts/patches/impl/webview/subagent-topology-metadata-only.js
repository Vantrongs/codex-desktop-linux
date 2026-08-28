"use strict";

const { escapeRegExp, findMatchingBrace } = require("../../lib/minified-js.js");

const IDENTIFIER = "[A-Za-z_$][\\w$]*";
const METHOD_PATTERN = new RegExp(
  `async readPaginatedDescendantTopology\\((${IDENTIFIER})\\)\\{`,
  "gu",
);

function descendantTopologyMethods(source) {
  const methods = [];
  for (const match of source.matchAll(new RegExp(METHOD_PATTERN.source, "gu"))) {
    const open = match.index + match[0].length - 1;
    const close = findMatchingBrace(source, open);
    if (close === -1) continue;
    methods.push({
      argument: match[1],
      text: source.slice(match.index, close + 1),
    });
  }
  return methods;
}

function isMetadataOnlyMethod(method) {
  const retainedTurnPattern = new RegExp(
    `turns:(${IDENTIFIER})==null\\?\\[\\]:\\[\\1\\]`,
    "u",
  );
  const retainedTurnMatch = retainedTurnPattern.exec(method.text);
  if (retainedTurnMatch == null) return false;
  const retainedTurn = escapeRegExp(retainedTurnMatch[1]);
  const metadataProjectionPattern = new RegExp(
    `for\\(let (${IDENTIFIER}) of ${IDENTIFIER}\\.data\\)\\{${retainedTurn}=` +
      `\\{\\.\\.\\.\\1,items:\\[\\],itemsView:` +
      "`notLoaded`" +
      `\\};for\\(let ${IDENTIFIER} of \\1\\.items\\)`,
    "u",
  );
  const retainedAssignments = method.text.match(
    new RegExp(`(?<![\\w$])${retainedTurn}=(?!=)`, "gu"),
  );
  const requiredAnchors = [
    "thread/turns/list",
    "itemsView:`full`",
    "source:`collab_hydration`",
    "items:[]",
    "itemsView:`notLoaded`",
    "type===`subAgentActivity`",
    "kind===`started`",
    "agentThreadId",
    "type===`collabAgentToolCall`",
    "tool===`spawnAgent`",
    "receiverThreadIds",
    "spawnedThreadIds:Array.from(",
  ];
  return (
    requiredAnchors.every((anchor) => method.text.includes(anchor)) &&
    metadataProjectionPattern.test(method.text) &&
    retainedAssignments?.length === 2
  );
}

function hasMetadataOnlyTopologyContract(source) {
  const methods = descendantTopologyMethods(source);
  return (
    methods.length === 1 &&
    isMetadataOnlyMethod(methods[0]) &&
    source.includes("async listDescendantThreads(") &&
    source.includes("ancestorThreadId:") &&
    source.includes("includeTurns:!1")
  );
}

function isSubagentTopologyMetadataAsset(source) {
  return hasMetadataOnlyTopologyContract(source);
}

function hasEagerSubagentHistoryHydration(source) {
  return (
    source.includes("async readPaginatedDescendantHistory(") ||
    (source.includes("async readPaginatedDescendantTopology(") &&
      !hasMetadataOnlyTopologyContract(source))
  );
}

function applyLinuxSubagentTopologyMetadataOnlyPatch(source) {
  if (!hasMetadataOnlyTopologyContract(source)) {
    throw new Error("Current subagent topology does not satisfy the metadata-only contract");
  }
  return source;
}

module.exports = {
  applyLinuxSubagentTopologyMetadataOnlyPatch,
  hasEagerSubagentHistoryHydration,
  hasMetadataOnlyTopologyContract,
  isSubagentTopologyMetadataAsset,
};
