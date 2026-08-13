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
    "var ttl,retry,max,Evictor,init=module(()=>{ttl=3600*1e3,retry=15e3,max=4,",
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
    "log(`inactive_thread_unsubscribe_started`);send(`thread/unsubscribe`);",
    "log(`inactive_thread_unsubscribed`);state.turnsPagination={olderCursor:null};",
    "let safe=!side&&!this.hasActiveConversationView(e)&&",
    "!this.params.streamState.hasFollowersOrPendingFollowerReconnect(e)&&",
    "!this.shouldKeepConversationLoaded(e);clear(e,[],!1);state.resumeState=`needs_resume`}",
    "getStatus(e){switch(e.type){case`approval`:return`waitingOnApproval`;",
    "case`userInput`:return`waitingOnUserInput`}}",
    "hasActiveConversationView(e){return this.params.threadStore.isConversationActive(e)}}})",
  ].join("");
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
  assert.doesNotMatch(patched, /ttl=3600\*1e3/u);
  assert.match(patched, /threadRuntimeStatus\?\.type===`active`/u);
  assert.match(patched, /thread\/unsubscribe/u);
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
  "current upstream bundle retains inactive owner threads for one hour",
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
    assert.notEqual(activeRuntimeEvicted, patched);
    assert.notEqual(activeViewIgnored, patched);
    assert.equal(hasInstalledInactiveThreadRetention(activeRuntimeEvicted), false);
    assert.equal(hasInstalledInactiveThreadRetention(activeViewIgnored), false);
  },
);
