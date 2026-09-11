"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const {
  INACTIVE_THREAD_RETENTION_MARKER,
  applyLinuxInactiveThreadRetentionPatch,
  hasInstalledInactiveThreadRetention,
  isInactiveThreadRetentionAsset,
} = require("./inactive-thread-retention.js");

function fixture() {
  return [
    "var ttl,retry,max,Evictor,init=module(()=>{ttl=10800*1e3,retry=15e3,max=10,",
    "Evictor=class{params;inactiveOwnerConversationSinceById=new Map;",
    "shouldKeepConversationLoaded(e){return e.threadRuntimeStatus?.type===`active`||",
    "e.turn?.status===`inProgress`} getNextCheckAtMs(e){let i=e,n=e;",
    "if(i==null||i.resumeState!==`resumed`||this.params.streamState.getStreamRole(n)?.role!==`owner`||",
    "this.hasActiveConversationView(n)||this.params.streamState.hasFollowersOrPendingFollowerReconnect(n)||",
    "this.unsubscribingConversationIds.has(n)||this.shouldKeepConversationLoaded(i))continue}",
    "getInactiveOwnerConversationIdsToUnsubscribe(e){let i=e,n=e;",
    "if(i==null||i.resumeState!==`resumed`||this.params.streamState.getStreamRole(n)?.role!==`owner`||",
    "this.hasActiveConversationView(n)||this.params.streamState.hasFollowersOrPendingFollowerReconnect(n)||",
    "this.unsubscribingConversationIds.has(n)||this.shouldKeepConversationLoaded(i))continue}",
    "async evict(e){",
    "log(`inactive_thread_unsubscribe_started`);await this.params.requestClient.sendRequest(`thread/unsubscribe`,{threadId:e});",
    "let state=this.params.threadStore.getConversation(e);log(`inactive_thread_unsubscribed`);",
    "let safe=!side&&!this.hasActiveConversationView(e)&&",
    "!this.params.streamState.hasFollowersOrPendingFollowerReconnect(e)&&",
    "!this.shouldKeepConversationLoaded(state);this.params.threadStore.updateConversationState(e,s=>{",
    "safe&&(clear(s,[],!1),s.turnsPagination={olderCursor:null});",
    "s.resumeState=`needs_resume`})}",
    "getStatus(e){switch(e.type){case`approval`:return`waitingOnApproval`;",
    "case`userInput`:return`waitingOnUserInput`}}",
    "hasActiveConversationView(e){return this.params.threadStore.isConversationActive(e)}}})",
  ].join("");
}

function currentFixture() {
  return fixture()
    .replace(
      /this\.params\.streamState\.getStreamRole\(n\)\?\.role!==`owner`\|\|/gu,
      "!this.params.streamState.ownsConversationHistoryStream(n)||",
    )
    .replace(
      /this\.params\.streamState\.hasFollowersOrPendingFollowerReconnect\(n\)/gu,
      "this.hasOwnedStreamFollowers(n)",
    )
    .replace(
      /!this\.params\.streamState\.hasFollowersOrPendingFollowerReconnect\(e\)/gu,
      "!this.hasOwnedStreamFollowers(e)",
    )
    .replace(
      "hasActiveConversationView(e){return this.params.threadStore.isConversationActive(e)}",
      "hasActiveConversationView(e){return this.params.threadStore.isConversationActive(e)}" +
        "hasOwnedStreamFollowers(e){return this.params.streamState.getStreamRole(e)?.role===`owner`&&" +
        "this.params.streamState.hasFollowersOrPendingFollowerReconnect(e)}",
    );
}

function replaceAfter(source, anchor, search, replacement) {
  const anchorIndex = source.indexOf(anchor);
  const searchIndex = source.indexOf(search, anchorIndex);
  assert.notEqual(anchorIndex, -1);
  assert.notEqual(searchIndex, -1);
  return (
    source.slice(0, searchIndex) +
    replacement +
    source.slice(searchIndex + search.length)
  );
}

test("inactive owner threads release renderer history after thirty minutes", () => {
  const source = fixture();
  assert.equal(isInactiveThreadRetentionAsset(source), true);

  const patched = applyLinuxInactiveThreadRetentionPatch(source);
  assert.equal(applyLinuxInactiveThreadRetentionPatch(patched), patched);
  assert.equal(hasInstalledInactiveThreadRetention(patched), true);
  assert.equal(patched.split(INACTIVE_THREAD_RETENTION_MARKER).length - 1, 1);
  assert.match(
    patched,
    /void`codexLinuxInactiveThreadRetentionThirtyMinutes`,ttl=30\*60\*1e3/u,
  );
  assert.doesNotMatch(patched, /ttl=10800\*1e3/u);
  assert.match(patched, /retry=15e3,max=10/u);
  assert.match(patched, /threadRuntimeStatus\?\.type===`active`/u);
  assert.match(patched, /thread\/unsubscribe/u);
});

test("inactive retention accepts the current stream ownership contract", () => {
  const source = currentFixture();
  assert.equal(isInactiveThreadRetentionAsset(source), true);

  const patched = applyLinuxInactiveThreadRetentionPatch(source);
  assert.equal(hasInstalledInactiveThreadRetention(patched), true);
  assert.match(patched, /ownsConversationHistoryStream/u);
  assert.match(patched, /hasOwnedStreamFollowers/u);
  assert.match(patched, /ttl=30\*60\*1e3/u);
});

test("inactive retention rejects follower checks for a different conversation", () => {
  const damaged = currentFixture().replace(
    "!this.hasOwnedStreamFollowers(e)&&!this.shouldKeepConversationLoaded(state)",
    "!this.hasOwnedStreamFollowers(n)&&!this.shouldKeepConversationLoaded(state)",
  );

  assert.equal(isInactiveThreadRetentionAsset(damaged), false);
  assert.throws(
    () => applyLinuxInactiveThreadRetentionPatch(damaged),
    /Could not find unique inactive thread retention policy/u,
  );
});

test("inactive retention rejects view and follower checks for the state object", () => {
  const damaged = currentFixture()
    .replace(
      "!this.hasActiveConversationView(e)&&",
      "!this.hasActiveConversationView(n)&&",
    )
    .replace(
      "!this.hasOwnedStreamFollowers(e)&&!this.shouldKeepConversationLoaded(state)",
      "!this.hasOwnedStreamFollowers(n)&&!this.shouldKeepConversationLoaded(state)",
    );

  assert.equal(isInactiveThreadRetentionAsset(damaged), false);
  assert.throws(
    () => applyLinuxInactiveThreadRetentionPatch(damaged),
    /Could not find unique inactive thread retention policy/u,
  );
});

test("inactive retention rejects broken cleanup transaction correlations", () => {
  for (const [label, damaged] of [
    [
      "unsubscribe completion",
      currentFixture().replace(
        "await this.params.requestClient.sendRequest(`thread/unsubscribe`,{threadId:e})",
        "this.params.requestClient.sendRequest(`thread/unsubscribe`,{threadId:e})",
      ),
    ],
    [
      "unsubscribe callee",
      currentFixture().replace(
        "this.params.requestClient.sendRequest(`thread/unsubscribe`,{threadId:e})",
        "this.params.logger.info(`thread/unsubscribe`,{threadId:e})",
      ),
    ],
    [
      "unsubscribe callee near-name",
      currentFixture().replace(
        "this.params.requestClient.sendRequest(`thread/unsubscribe`,{threadId:e})",
        "this.params.requestClient.sendRequestX(`thread/unsubscribe`,{threadId:e})",
      ),
    ],
    ["unsubscribe ID", currentFixture().replace("{threadId:e}", "{threadId:n}")],
    [
      "update target",
      currentFixture().replace(
        "updateConversationState(e,s=>",
        "updateConversationState(n,s=>",
      ),
    ],
    ["clear callback state", currentFixture().replace("clear(s,[],!1)", "clear(e,[],!1)")],
    [
      "safe guard",
      currentFixture().replace("safe&&(clear(s,[],!1)", "other&&(clear(s,[],!1)"),
    ],
    [
      "keep-loaded state",
      currentFixture().replace(
        "shouldKeepConversationLoaded(state)",
        "shouldKeepConversationLoaded(e)",
      ),
    ],
  ]) {
    assert.equal(isInactiveThreadRetentionAsset(damaged), false, label);
    assert.throws(
      () => applyLinuxInactiveThreadRetentionPatch(damaged),
      /Could not find unique inactive thread retention policy/u,
    );
  }
});

test("retention patch rejects marker-only and damaged timeout output", () => {
  const patched = applyLinuxInactiveThreadRetentionPatch(fixture());
  const markerOnly = `void\`${INACTIVE_THREAD_RETENTION_MARKER}\`;function unrelated(){}`;
  const damaged = patched.replace("ttl=30*60*1e3", "ttl=5*60*1e3");
  const activeRuntimeEvicted = patched.replace(
    "threadRuntimeStatus?.type===`active`",
    "threadRuntimeStatus?.type!==`active`",
  );
  const activeViewIgnored = patched.replace(
    "this.hasActiveConversationView(n)||",
    "!this.hasActiveConversationView(n)||",
  );

  assert.throws(
    () => applyLinuxInactiveThreadRetentionPatch(markerOnly),
    /partial inactive thread retention patch/u,
  );
  assert.equal(hasInstalledInactiveThreadRetention(damaged), false);
  assert.equal(hasInstalledInactiveThreadRetention(activeRuntimeEvicted), false);
  assert.equal(hasInstalledInactiveThreadRetention(activeViewIgnored), false);
  assert.throws(
    () => applyLinuxInactiveThreadRetentionPatch(damaged),
    /partial inactive thread retention patch/u,
  );
});

test(
  "current upstream bundle retains inactive owner threads for three hours",
  { skip: process.env.CODEX_WEBVIEW_ASSET == null },
  () => {
    const source = fs.readFileSync(process.env.CODEX_WEBVIEW_ASSET, "utf8");
    assert.equal(isInactiveThreadRetentionAsset(source), true);
    const patched = applyLinuxInactiveThreadRetentionPatch(source);
    assert.equal(hasInstalledInactiveThreadRetention(patched), true);

    const activeRuntimeEvicted = replaceAfter(
      patched,
      INACTIVE_THREAD_RETENTION_MARKER,
      "threadRuntimeStatus?.type===`active`",
      "threadRuntimeStatus?.type!==`active`",
    );
    const activeViewIgnored = replaceAfter(
      patched,
      INACTIVE_THREAD_RETENTION_MARKER,
      "||this.hasActiveConversationView(n)||",
      "||!this.hasActiveConversationView(n)||",
    );
    const wrongCleanupTarget = replaceAfter(
      patched,
      INACTIVE_THREAD_RETENTION_MARKER,
      "updateConversationState(e,e=>{i&&(",
      "updateConversationState(n,e=>{i&&(",
    );
    const wrongKeepState = replaceAfter(
      patched,
      INACTIVE_THREAD_RETENTION_MARKER,
      "shouldKeepConversationLoaded(n);this.params.threadStore.updateConversationState(e,",
      "shouldKeepConversationLoaded(e);this.params.threadStore.updateConversationState(e,",
    );
    const wrongUnsubscribeCallee = replaceAfter(
      patched,
      INACTIVE_THREAD_RETENTION_MARKER,
      "this.params.requestClient.sendRequest(`thread/unsubscribe`,{threadId:e})",
      "this.params.logger.info(`thread/unsubscribe`,{threadId:e})",
    );
    const missingUnsubscribeAwait = replaceAfter(
      patched,
      INACTIVE_THREAD_RETENTION_MARKER,
      "await this.params.requestClient.sendRequest(`thread/unsubscribe`,{threadId:e})",
      "this.params.requestClient.sendRequest(`thread/unsubscribe`,{threadId:e})",
    );
    const wrongUnsubscribeCalleeNearName = replaceAfter(
      patched,
      INACTIVE_THREAD_RETENTION_MARKER,
      "this.params.requestClient.sendRequest(`thread/unsubscribe`,{threadId:e})",
      "this.params.requestClient.sendRequestX(`thread/unsubscribe`,{threadId:e})",
    );
    assert.notEqual(activeRuntimeEvicted, patched);
    assert.notEqual(activeViewIgnored, patched);
    assert.notEqual(wrongCleanupTarget, patched);
    assert.notEqual(wrongKeepState, patched);
    assert.notEqual(wrongUnsubscribeCallee, patched);
    assert.notEqual(missingUnsubscribeAwait, patched);
    assert.notEqual(wrongUnsubscribeCalleeNearName, patched);
    assert.equal(hasInstalledInactiveThreadRetention(activeRuntimeEvicted), false);
    assert.equal(hasInstalledInactiveThreadRetention(activeViewIgnored), false);
    assert.equal(hasInstalledInactiveThreadRetention(wrongCleanupTarget), false);
    assert.equal(hasInstalledInactiveThreadRetention(wrongKeepState), false);
    assert.equal(hasInstalledInactiveThreadRetention(wrongUnsubscribeCallee), false);
    assert.equal(hasInstalledInactiveThreadRetention(missingUnsubscribeAwait), false);
    assert.equal(hasInstalledInactiveThreadRetention(wrongUnsubscribeCalleeNearName), false);
  },
);
