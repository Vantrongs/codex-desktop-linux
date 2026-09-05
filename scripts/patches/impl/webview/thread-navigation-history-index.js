"use strict";

const { findMatchingBrace } = require("../../lib/minified-js.js");

const IDENTIFIER = "[A-Za-z_$][\\w$]*";
const RETIRED_UPSTREAM_FLAG = "209459230";

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function containingFunction(source, index) {
  const prefix = source.slice(0, index);
  const starts = [
    ...prefix.matchAll(
      new RegExp(`function ${IDENTIFIER}\\([^)]*\\)\\{`, "gu"),
    ),
  ];
  for (const match of starts.reverse()) {
    const open = match.index + match[0].length - 1;
    const close = findMatchingBrace(source, open);
    if (close >= index) {
      return { start: match.index, text: source.slice(match.index, close + 1) };
    }
  }
  return null;
}

function promptRailQuerySymbol(source) {
  const queryKey = "queryKey:[`prompt-rail-history`,";
  const queryIndex = source.indexOf(queryKey);
  if (queryIndex < 0 || source.indexOf(queryKey, queryIndex + 1) >= 0) return null;

  const prefixStart = Math.max(0, queryIndex - 1_000);
  const prefix = source.slice(prefixStart, queryIndex);
  const assignments = [
    ...prefix.matchAll(
      new RegExp(`(${IDENTIFIER})=${IDENTIFIER}\\(${IDENTIFIER},\\(`, "gu"),
    ),
  ];
  return assignments.at(-1)?.[1] ?? null;
}

function hasCompletePromptRailIndex(source) {
  const required = [
    "itemsView:`notLoaded`,sortDirection:`desc`",
    "itemsView:`full`,sortDirection:`desc`",
    "prompt-rail-history",
  ];
  if (!required.every((anchor) => source.includes(anchor))) return false;

  const complete = new RegExp(
    `\\.nextCursor==null\\)return\\{items:${IDENTIFIER}\\.reverse\\(\\),complete:!0\\}`,
    "u",
  );
  const incomplete = new RegExp(
    `return\\{items:${IDENTIFIER}\\.reverse\\(\\),complete:!1\\}`,
    "u",
  );
  return complete.test(source) && incomplete.test(source);
}

function hasOfficialThreadNavigationHistoryIndex(source) {
  if (source.includes(RETIRED_UPSTREAM_FLAG) || !hasCompletePromptRailIndex(source)) {
    return false;
  }

  const querySymbol = promptRailQuerySymbol(source);
  if (querySymbol == null) return false;
  const usagePattern = new RegExp(
    `\\{data:(?<data>${IDENTIFIER})\\}=(?<reader>${IDENTIFIER})\\(` +
      `${escapeRegExp(querySymbol)},(?<enabled>${IDENTIFIER})\\?(?<thread>${IDENTIFIER}):null\\),` +
      `(?<complete>${IDENTIFIER})=\\k<enabled>&&\\k<data>\\?\\.complete===!0`,
    "gu",
  );
  const usages = [...source.matchAll(usagePattern)];
  if (usages.length !== 1) return false;

  const usage = usages[0];
  const owner = containingFunction(source, usage.index);
  if (owner == null) return false;
  const localUsageIndex = usage.index - owner.start;
  const prefix = owner.text.slice(0, localUsageIndex);
  const assignmentStart = prefix.lastIndexOf(`${usage.groups.enabled}=`);
  if (assignmentStart < 0) return false;
  const gate = prefix.slice(assignmentStart + usage.groups.enabled.length + 1);
  return (
    gate.includes("===`paginated`") &&
    gate.includes("===`legacy`") &&
    gate.includes("!==`subagent`") &&
    !gate.includes("readFlag")
  );
}

function isThreadNavigationHistoryIndexAsset(source) {
  return hasOfficialThreadNavigationHistoryIndex(source);
}

function applyLinuxThreadNavigationHistoryIndexPatch(source) {
  if (!hasOfficialThreadNavigationHistoryIndex(source)) {
    throw new Error(
      "Current thread navigation does not satisfy the flag-free metadata index contract",
    );
  }
  return source;
}

module.exports = {
  applyLinuxThreadNavigationHistoryIndexPatch,
  hasOfficialThreadNavigationHistoryIndex,
  isThreadNavigationHistoryIndexAsset,
};
