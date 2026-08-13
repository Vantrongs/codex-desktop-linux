"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const {
  THREAD_HISTORY_PAGINATION_MARKER,
  applyLinuxThreadHistoryPaginationPatch,
  hasUnsafeThreadHistoryDrainGate,
  isThreadHistoryPaginationAsset,
} = require("./thread-history-pagination.js");

function fixture() {
  return [
    "function Gate(e,t){if(e==null||!t())return!1;let n=e.get(Store);",
    "return n?.loadingStatus===`Ready`&&readFlag(n,`1865103671`).get(`enabled`,!1)===!0}",
    "function Manager(){this.suppressResumeHistoryDrain=()=>Gate(scope,()=>this.supportsPaginatedThreadHistory());",
    "this.loadRemainingConversationTurns=()=>request({source:`tail_history`})}",
  ].join("");
}

test("supported paginated history suppresses the eager resume drain without a remote flag", () => {
  const source = fixture();
  assert.equal(isThreadHistoryPaginationAsset(source), true);
  assert.equal(hasUnsafeThreadHistoryDrainGate(source), true);

  const patched = applyLinuxThreadHistoryPaginationPatch(source);
  assert.equal(applyLinuxThreadHistoryPaginationPatch(patched), patched);
  assert.equal(hasUnsafeThreadHistoryDrainGate(patched), false);
  assert.equal(patched.split(THREAD_HISTORY_PAGINATION_MARKER).length - 1, 1);
  assert.match(patched, /function Gate\(e,t\)\{return t\(\)===!0\}/u);
  assert.doesNotMatch(patched, /1865103671|loadingStatus===`Ready`/u);
  assert.match(patched, /source:`tail_history`/u);
});

test("history pagination patch rejects marker-only and semantically damaged output", () => {
  const patched = applyLinuxThreadHistoryPaginationPatch(fixture());
  const markerOnly = `void\`${THREAD_HISTORY_PAGINATION_MARKER}\`;function unrelated(){}`;
  const damaged = patched.replace("return t()===!0", "return!1");

  assert.throws(
    () => applyLinuxThreadHistoryPaginationPatch(markerOnly),
    /partial thread history pagination patch/u,
  );
  assert.equal(isThreadHistoryPaginationAsset(damaged), false);
  assert.throws(
    () => applyLinuxThreadHistoryPaginationPatch(damaged),
    /partial thread history pagination patch/u,
  );
});

test(
  "current upstream bundle has the eager history drain gate",
  { skip: process.env.CODEX_WEBVIEW_ASSET == null },
  () => {
    const source = fs.readFileSync(process.env.CODEX_WEBVIEW_ASSET, "utf8");
    assert.equal(isThreadHistoryPaginationAsset(source), true);
    assert.equal(hasUnsafeThreadHistoryDrainGate(source), true);
    const patched = applyLinuxThreadHistoryPaginationPatch(source);
    assert.equal(hasUnsafeThreadHistoryDrainGate(patched), false);
  },
);
