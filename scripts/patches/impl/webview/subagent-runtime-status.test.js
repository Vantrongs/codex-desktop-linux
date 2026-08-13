"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const {
  SUBAGENT_RUNTIME_STATUS_MARKER,
  applyLinuxSubagentRuntimeStatusPatch,
  classifySubagentRuntimeStatus,
  hasUnsafeSubagentRuntimeStatusInference,
  isSubagentRuntimeStatusAsset,
} = require("./subagent-runtime-status.js");

function fixture() {
  return [
    "function Build({cachedConversations:e,conversationTurns:t,getThreadRuntimeStatusEvidence:n,parentConversationId:r,sourceLinkedThreads:i,threadSummaries:a=[]}){",
    "let m={conversationId:`child`,thread:{status:{type:`notLoaded`}}},x={runtimeStatus:n?.(m.conversationId)??Arn(t,r)};return x}",
    "function Project({membership:e,latestReference:t,childConversation:n,currentParentTurnKey:r,inProgressParentTurnKeys:i,runtimeStatus:a}){",
    "if(t==null)return null;let o=e.thread?.status.type===`notLoaded`?e.runtimeStatus:e.thread?.status??e.runtimeStatus,",
    "s=mapAgent(t.agentState?.status),c=a==null||a.type===`notLoaded`?`unknown`:mapAgent(mapRuntime(a)),",
    "x=c===`active`||c===`unknown`&&s===`active`,w=!x&&(c===`done`||s===`done`);",
    "return{status:w?`done`:`active`,statusSummary:x?summary(n):null,showInlineActivity:e.showInlineActivity}}",
    "function TurnState(e){return e?.threadRuntimeStatus?.type===`active`?`inProgress`:e?.threadRuntimeStatus!=null&&e.threadRuntimeStatus.type!==`notLoaded`?`notInProgress`:e==null||e.turns.length===0?`unknown`:e.turns[e.turns.length-1]?.status===`inProgress`?`inProgress`:`notInProgress`}",
  ].join("");
}

function evaluatePatchedProjection() {
  const patched = applyLinuxSubagentRuntimeStatusPatch(fixture());
  return Function(
    "mapAgent",
    "mapRuntime",
    "summary",
    `${patched};return Project`,
  )(
    (status) => (status === "running" ? "active" : status),
    (status) => status,
    () => "summary",
  );
}

test("only an explicit live runtime remains active", () => {
  assert.equal(classifySubagentRuntimeStatus({ type: "active" }), "active");
  assert.equal(classifySubagentRuntimeStatus({ type: "idle" }), "done");
  assert.equal(classifySubagentRuntimeStatus({ type: "notLoaded" }), "done");
  assert.equal(classifySubagentRuntimeStatus({ type: "systemError" }), "hidden");
  assert.equal(classifySubagentRuntimeStatus(null), "done");
});

test("canonical thread status overrides historical started activity", () => {
  const source = fixture();
  assert.equal(isSubagentRuntimeStatusAsset(source), true);
  assert.equal(hasUnsafeSubagentRuntimeStatusInference(source), true);

  const patched = applyLinuxSubagentRuntimeStatusPatch(source);
  assert.equal(applyLinuxSubagentRuntimeStatusPatch(patched), patched);
  assert.equal(hasUnsafeSubagentRuntimeStatusInference(patched), false);
  assert.equal(patched.split(SUBAGENT_RUNTIME_STATUS_MARKER).length - 1, 1);
  assert.match(
    patched,
    /runtimeStatus:n\?\.\(m\.conversationId\)\?\?m\.thread\?\.status\?\?Arn\(t,r\)/u,
  );
  assert.match(patched, /c=codexLinuxSubagentRuntimeStatus\(a\?\?o\)/u);
  assert.match(
    patched,
    /e\?\.threadRuntimeStatus!=null\?e\.threadRuntimeStatus\.type===`active`\?`inProgress`:`notInProgress`/u,
  );
});

test("missing current status cannot reactivate historical running state", () => {
  const project = evaluatePatchedProjection();
  const projectStatus = (runtimeStatus) =>
    project({
      membership: { showInlineActivity: true },
      latestReference: { agentState: { status: "running" } },
      childConversation: null,
      currentParentTurnKey: null,
      inProgressParentTurnKeys: null,
      runtimeStatus,
    }).status;

  assert.equal(projectStatus(null), "done");
  assert.equal(projectStatus({ type: "notLoaded" }), "done");
  assert.equal(projectStatus({ type: "idle" }), "done");
  assert.equal(projectStatus({ type: "active" }), "active");
});

test("subagent status patch rejects partial installed output", () => {
  const patched = applyLinuxSubagentRuntimeStatusPatch(fixture());
  const missingCanonicalStatus = patched.replace(
    "runtimeStatus:n?.(m.conversationId)??m.thread?.status??Arn(t,r)",
    "runtimeStatus:n?.(m.conversationId)??Arn(t,r)",
  );
  const wrongNotLoadedMeaning = patched.replace(
    "case`idle`:case`notLoaded`:return`done`",
    "case`idle`:return`done`;case`notLoaded`:return`active`",
  );
  assert.equal(isSubagentRuntimeStatusAsset(missingCanonicalStatus), false);
  assert.throws(
    () => applyLinuxSubagentRuntimeStatusPatch(missingCanonicalStatus),
    /partial subagent runtime status patch/u,
  );
  assert.equal(isSubagentRuntimeStatusAsset(wrongNotLoadedMeaning), false);
  assert.throws(
    () => applyLinuxSubagentRuntimeStatusPatch(wrongNotLoadedMeaning),
    /partial subagent runtime status patch/u,
  );
});

test(
  "current upstream bundle misclassifies notLoaded historical agents",
  { skip: process.env.CODEX_WEBVIEW_ASSET == null },
  () => {
    const source = fs.readFileSync(process.env.CODEX_WEBVIEW_ASSET, "utf8");
    assert.equal(isSubagentRuntimeStatusAsset(source), true);
    assert.equal(hasUnsafeSubagentRuntimeStatusInference(source), true);
    const patched = applyLinuxSubagentRuntimeStatusPatch(source);
    assert.equal(hasUnsafeSubagentRuntimeStatusInference(patched), false);
  },
);
