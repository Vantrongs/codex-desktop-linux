"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const {
  applyLinuxSubagentTopologyMetadataOnlyPatch,
  hasEagerSubagentHistoryHydration,
  hasMetadataOnlyTopologyContract,
  isSubagentTopologyMetadataAsset,
} = require("./subagent-topology-metadata-only.js");

function fixture() {
  return [
    "class Topology{async listDescendantThreads(e){let c={ancestorThreadId:e};",
    "return await this.params.requestClient.sendRequest(`thread/read`,{threadId:e,includeTurns:!1})}",
    "async readPaginatedDescendantTopology(e){let t=new Set,n=new Set,r=null,i=null;",
    "do{let a=await this.params.requestClient.sendRequest(`thread/turns/list`,",
    "{threadId:e.id,cursor:i,limit:5,sortDirection:`asc`,itemsView:`full`},",
    "{priority:`background`,source:`collab_hydration`});for(let e of a.data){",
    "r={...e,items:[],itemsView:`notLoaded`};for(let n of e.items)",
    "if(n.type===`subAgentActivity`&&n.kind===`started`)t.add(n.agentThreadId);",
    "else if(n.type===`collabAgentToolCall`&&n.tool===`spawnAgent`)",
    "for(let e of n.receiverThreadIds)t.add(e)}i=a.nextCursor}while(i!=null);",
    "return{thread:{...e,turns:r==null?[]:[r]},spawnedThreadIds:Array.from(t)}}}",
  ].join("");
}

test("current topology recovery retains only metadata and the final empty turn", () => {
  const source = fixture();
  assert.equal(isSubagentTopologyMetadataAsset(source), true);
  assert.equal(hasMetadataOnlyTopologyContract(source), true);
  assert.equal(hasEagerSubagentHistoryHydration(source), false);
  assert.equal(applyLinuxSubagentTopologyMetadataOnlyPatch(source), source);
});

test("topology verification fails closed on restored child content", () => {
  for (const damaged of [
    fixture().replace("items:[]", "items:e.items"),
    fixture().replace("itemsView:`notLoaded`", "itemsView:`full`"),
    fixture().replace(
      "r={...e,items:[],itemsView:`notLoaded`}",
      "r={...e,items:[],itemsView:`notLoaded`};r=e",
    ),
    fixture().replace("turns:r==null?[]:[r]", "turns:allTurns"),
    fixture().replace("tool===`spawnAgent`", "tool===`sendInput`"),
  ]) {
    assert.equal(isSubagentTopologyMetadataAsset(damaged), false);
    assert.equal(hasEagerSubagentHistoryHydration(damaged), true);
    assert.throws(
      () => applyLinuxSubagentTopologyMetadataOnlyPatch(damaged),
      /does not satisfy the metadata-only contract/u,
    );
  }
});

test(
  "current upstream bundle satisfies the metadata-only topology contract",
  { skip: process.env.CODEX_WEBVIEW_ASSET == null },
  () => {
    const source = fs.readFileSync(process.env.CODEX_WEBVIEW_ASSET, "utf8");
    assert.equal(isSubagentTopologyMetadataAsset(source), true);
    assert.equal(hasMetadataOnlyTopologyContract(source), true);
    assert.equal(hasEagerSubagentHistoryHydration(source), false);
    assert.equal(applyLinuxSubagentTopologyMetadataOnlyPatch(source), source);
  },
);
