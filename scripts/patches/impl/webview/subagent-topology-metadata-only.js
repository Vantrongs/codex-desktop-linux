"use strict";

const { findMatchingBrace } = require("../../lib/minified-js.js");

const SUBAGENT_TOPOLOGY_METADATA_MARKER =
  "codexLinuxSubagentTopologyMetadataOnly";
const IDENTIFIER = "[A-Za-z_$][\\w$]*";
const METHOD_PATTERN = new RegExp(
  `async readPaginatedDescendantHistory\\((${IDENTIFIER})\\)\\{`,
  "gu",
);

function descendantHistoryMethods(source) {
  const methods = [];
  for (const match of source.matchAll(new RegExp(METHOD_PATTERN.source, "gu"))) {
    const open = match.index + match[0].length - 1;
    const close = findMatchingBrace(source, open);
    if (close === -1) continue;
    methods.push({
      argument: match[1],
      start: match.index,
      end: close + 1,
      text: source.slice(match.index, close + 1),
    });
  }
  return methods;
}

function isUnsafeMethod(method) {
  return (
    method.text.includes("thread/turns/list") &&
    method.text.includes("itemsView:`full`") &&
    method.text.includes("source:`collab_hydration`") &&
    method.text.includes("spawnedThreadIds:Array.from(")
  );
}

function installedMethodText(argument) {
  return (
    `async readPaginatedDescendantHistory(${argument}){` +
    `return void\`${SUBAGENT_TOPOLOGY_METADATA_MARKER}\`,` +
    `{thread:${argument},spawnedThreadIds:[]}}`
  );
}

function hasInstalledMetadataOnlyTopology(source) {
  const methods = descendantHistoryMethods(source);
  return (
    source.split(SUBAGENT_TOPOLOGY_METADATA_MARKER).length - 1 === 1 &&
    methods.length === 1 &&
    methods[0].text === installedMethodText(methods[0].argument) &&
    source.includes("async listDescendantThreads(") &&
    source.includes("ancestorThreadId:") &&
    source.includes("includeTurns:!1")
  );
}

function isSubagentTopologyMetadataAsset(source) {
  if (source.includes(SUBAGENT_TOPOLOGY_METADATA_MARKER)) {
    return hasInstalledMetadataOnlyTopology(source);
  }
  const methods = descendantHistoryMethods(source);
  return (
    methods.length === 1 &&
    isUnsafeMethod(methods[0]) &&
    source.includes("async listDescendantThreads(") &&
    source.includes("ancestorThreadId:") &&
    source.includes("includeTurns:!1")
  );
}

function hasEagerSubagentHistoryHydration(source) {
  if (source.includes(SUBAGENT_TOPOLOGY_METADATA_MARKER)) {
    return !hasInstalledMetadataOnlyTopology(source);
  }
  return descendantHistoryMethods(source).some(isUnsafeMethod);
}

function applyLinuxSubagentTopologyMetadataOnlyPatch(source) {
  if (source.includes(SUBAGENT_TOPOLOGY_METADATA_MARKER)) {
    if (hasInstalledMetadataOnlyTopology(source)) return source;
    throw new Error("Found partial subagent topology metadata patch");
  }

  const methods = descendantHistoryMethods(source).filter(isUnsafeMethod);
  if (methods.length !== 1) {
    throw new Error("Could not find unique eager subagent history hydration method");
  }
  const method = methods[0];
  const patched =
    source.slice(0, method.start) +
    installedMethodText(method.argument) +
    source.slice(method.end);
  if (!hasInstalledMetadataOnlyTopology(patched)) {
    throw new Error("Subagent topology metadata patch did not satisfy its contract");
  }
  return patched;
}

module.exports = {
  SUBAGENT_TOPOLOGY_METADATA_MARKER,
  applyLinuxSubagentTopologyMetadataOnlyPatch,
  hasEagerSubagentHistoryHydration,
  isSubagentTopologyMetadataAsset,
};
