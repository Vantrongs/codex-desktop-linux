"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const {
  applyLinuxSubagentRuntimeStatusPatch,
  classifySubagentRuntimeStatus,
  hasOfficialSubagentRuntimeStatusContract,
  hasUnsafeSubagentRuntimeStatusInference,
  isSubagentRuntimeStatusAsset,
} = require("./subagent-runtime-status.js");

function fixture() {
  return [
    "function Build({cachedConversations:e,conversationTurns:t,getIndexedSubagentItems:n,getIndexedSubagentProgress:r,parentConversationId:i,sourceLinkedThreads:a,sourceLinkedThreadsDiscoveryComplete:o=a!=null,threadSummaries:s=[]}){",
    "let child={threadRuntimeStatus:e.runtimeStatus??n.threadRuntimeStatus},membership={runtimeStatus:e.runtimeStatus,thread:e.thread,conversationId:e.conversationId};",
    "return Project({membership,latestReference:ref,childConversation:child,currentParentTurnKey:key,discoveryComplete:o,runtimeStatus:membership.runtimeStatus??runtime(summaryById.get(membership.conversationId),cached)??membership.thread?.status??null})}",
    "function Project({membership:e,latestReference:t,childConversation:n,currentParentTurnKey:r,discoveryComplete:i,runtimeStatus:a}){",
    "if(t==null)return null;let o=agentStatus(t),s=turnStatus(n);",
    "if(o===`hidden`&&a?.type!==`active`||a?.type===`systemError`)return null;",
    "let l=turnState(n),u;u=a==null?i?`done`:l===`inProgress`?`active`:l===`notInProgress`?`done`:o===`waiting`?`waiting`:o===`done`?`done`:`active`:a.type===`active`?`active`:`done`;",
    "return{status:u,statusSummary:u===`active`?summary(n):null,showInlineActivity:e.showInlineActivity}}",
  ].join("");
}

test("only an explicit live runtime remains active", () => {
  assert.equal(classifySubagentRuntimeStatus({ type: "active" }), "active");
  assert.equal(classifySubagentRuntimeStatus({ type: "idle" }), "done");
  assert.equal(classifySubagentRuntimeStatus({ type: "notLoaded" }), "done");
  assert.equal(classifySubagentRuntimeStatus({ type: "systemError" }), "hidden");
  assert.equal(classifySubagentRuntimeStatus(null), "done");
});

test("official projector uses canonical runtime state without rewriting the bundle", () => {
  const source = fixture();
  assert.equal(isSubagentRuntimeStatusAsset(source), true);
  assert.equal(hasOfficialSubagentRuntimeStatusContract(source), true);
  assert.equal(hasUnsafeSubagentRuntimeStatusInference(source), false);
  assert.equal(applyLinuxSubagentRuntimeStatusPatch(source), source);
});

test("subagent status verification fails closed on historical reactivation", () => {
  for (const damaged of [
    fixture().replace(
      "a.type===`active`?`active`:`done`",
      "a.type===`notLoaded`?o:`active`",
    ),
    fixture().replace("membership.thread?.status??null", "null"),
    fixture().replace("a?.type===`systemError`", "a?.type===`active`"),
  ]) {
    assert.equal(hasOfficialSubagentRuntimeStatusContract(damaged), false);
    assert.equal(hasUnsafeSubagentRuntimeStatusInference(damaged), true);
    assert.throws(
      () => applyLinuxSubagentRuntimeStatusPatch(damaged),
      /does not satisfy the canonical runtime status contract/u,
    );
  }
});

test(
  "current upstream bundle satisfies the canonical runtime status contract",
  { skip: process.env.CODEX_WEBVIEW_ASSET == null },
  () => {
    const source = fs.readFileSync(process.env.CODEX_WEBVIEW_ASSET, "utf8");
    assert.equal(isSubagentRuntimeStatusAsset(source), true);
    assert.equal(hasOfficialSubagentRuntimeStatusContract(source), true);
    assert.equal(hasUnsafeSubagentRuntimeStatusInference(source), false);
    assert.equal(applyLinuxSubagentRuntimeStatusPatch(source), source);
  },
);
