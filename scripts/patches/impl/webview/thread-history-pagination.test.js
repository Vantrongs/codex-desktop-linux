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
    "function Settings(e){return{history:{useTailHydration:!0,canonicalTurnHistory:!0,",
    "readPaginatedHistoryEnabled(){let t=e?.get(Store);return t?.loadingStatus===`Ready`&&",
    "readFlag(t,Flags.paginatedHistory).get(`enabled`,!1)===!0},readCatalogConsumptionEnabled:()=>!0}}",
    "function Manager(){this.suppressResumeHistoryDrain=this.runtimeSettings.suppressResumeHistoryDrain??",
    "(()=>this.supportsPaginatedThreadHistory()&&settings.history.readPaginatedHistoryEnabled());",
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
  assert.match(
    patched,
    /readPaginatedHistoryEnabled\(\)\{return void`codexLinuxThreadHistoryUsesServerPagination`,!0\}/u,
  );
  assert.doesNotMatch(patched, /Flags\.paginatedHistory|loadingStatus===`Ready`/u);
  assert.match(
    patched,
    /supportsPaginatedThreadHistory\(\)&&settings\.history\.readPaginatedHistoryEnabled\(\)/u,
  );
  assert.match(patched, /source:`tail_history`/u);
});

test("history pagination patch rejects marker-only and semantically damaged output", () => {
  const patched = applyLinuxThreadHistoryPaginationPatch(fixture());
  const markerOnly = `void\`${THREAD_HISTORY_PAGINATION_MARKER}\`;function unrelated(){}`;
  const damaged = patched.replace(
    `return void\`${THREAD_HISTORY_PAGINATION_MARKER}\`,!0`,
    `return void\`${THREAD_HISTORY_PAGINATION_MARKER}\`,!1`,
  );

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

test("history pagination patch requires capability checking in the drain gate", () => {
  const drifted =
    fixture().replace(
      "this.supportsPaginatedThreadHistory()&&settings.history",
      "settings.history",
    ) +
    "function unrelated(){return this.supportsPaginatedThreadHistory()}";

  assert.equal(isThreadHistoryPaginationAsset(drifted), false);
  assert.throws(
    () => applyLinuxThreadHistoryPaginationPatch(drifted),
    /current thread history resume drain capability gate/u,
  );
});

test("retired helper gate is rejected byte-identically", () => {
  const retired = [
    "function Gate(e,t){if(e==null||!t())return!1;let n=e.get(Store);",
    "return n?.loadingStatus===`Ready`&&readFlag(n,`1865103671`).get(`enabled`,!1)===!0}",
    "function Manager(){this.suppressResumeHistoryDrain=()=>Gate(scope,()=>this.supportsPaginatedThreadHistory());",
    "this.loadRemainingConversationTurns=()=>request({source:`tail_history`})}",
  ].join("");

  assert.equal(isThreadHistoryPaginationAsset(retired), false);
  assert.throws(
    () => applyLinuxThreadHistoryPaginationPatch(retired),
    /current thread history pagination settings gate/u,
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
