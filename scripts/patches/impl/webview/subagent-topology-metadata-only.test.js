"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const {
  SUBAGENT_TOPOLOGY_METADATA_MARKER,
  applyLinuxSubagentTopologyMetadataOnlyPatch,
  hasEagerSubagentHistoryHydration,
  isSubagentTopologyMetadataAsset,
} = require("./subagent-topology-metadata-only.js");

function fixture() {
  return [
    "class Topology{async listDescendantThreads(e){let c={ancestorThreadId:e};",
    "return await this.params.requestClient.sendRequest(`thread/read`,{threadId:e,includeTurns:!1})}",
    "async readPaginatedDescendantHistory(e){let t=new Set,n=new Set,r=[],i=null,a=null;",
    "do{let o=await this.params.requestClient.sendRequest(`thread/turns/list`,",
    "{threadId:e.id,cursor:a,limit:5,sortDirection:`asc`,itemsView:`full`},",
    "{priority:`background`,source:`collab_hydration`});",
    "for(let e of o.data){r.push(e),i=e}a=o.nextCursor}while(a!=null);",
    "return{thread:{...e,turns:r},spawnedThreadIds:Array.from(t)}}}",
  ].join("");
}

test("topology recovery keeps child content unloaded", async () => {
  const source = fixture();
  assert.equal(isSubagentTopologyMetadataAsset(source), true);
  assert.equal(hasEagerSubagentHistoryHydration(source), true);

  const patched = applyLinuxSubagentTopologyMetadataOnlyPatch(source);
  assert.equal(applyLinuxSubagentTopologyMetadataOnlyPatch(patched), patched);
  assert.equal(hasEagerSubagentHistoryHydration(patched), false);
  assert.equal(patched.split(SUBAGENT_TOPOLOGY_METADATA_MARKER).length - 1, 1);
  assert.doesNotMatch(patched, /thread\/turns\/list|itemsView:`full`/u);
  assert.match(
    patched,
    /async readPaginatedDescendantHistory\(e\)\{return void`codexLinuxSubagentTopologyMetadataOnly`,\{thread:e,spawnedThreadIds:\[\]\}\}/u,
  );
});

test("topology metadata patch rejects a damaged installed method", () => {
  const patched = applyLinuxSubagentTopologyMetadataOnlyPatch(fixture());
  const damaged = patched.replace("spawnedThreadIds:[]", "spawnedThreadIds:e.turns");
  assert.equal(isSubagentTopologyMetadataAsset(damaged), false);
  assert.throws(
    () => applyLinuxSubagentTopologyMetadataOnlyPatch(damaged),
    /partial subagent topology metadata patch/u,
  );
});

test(
  "current upstream bundle eagerly scans a missing descendant history",
  { skip: process.env.CODEX_WEBVIEW_ASSET == null },
  () => {
    const source = fs.readFileSync(process.env.CODEX_WEBVIEW_ASSET, "utf8");
    assert.equal(isSubagentTopologyMetadataAsset(source), true);
    assert.equal(hasEagerSubagentHistoryHydration(source), true);
    const patched = applyLinuxSubagentTopologyMetadataOnlyPatch(source);
    assert.equal(hasEagerSubagentHistoryHydration(patched), false);
  },
);
