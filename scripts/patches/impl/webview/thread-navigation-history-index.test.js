"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const {
  applyLinuxThreadNavigationHistoryIndexPatch,
  hasOfficialThreadNavigationHistoryIndex,
  isThreadNavigationHistoryIndexAsset,
} = require("./thread-navigation-history-index.js");

function fixture() {
  return [
    "async function index(){let r=[],i=null;for(let a=0;a<10;a+=1){let t=await list({cursor:i,limit:100,itemsView:`notLoaded`,sortDirection:`desc`});",
    "if(r.push(...t.data),t.nextCursor==null)return{items:r.reverse(),complete:!0};i=t.nextCursor}",
    "return{items:r.reverse(),complete:!1}}",
    "async function preview(){return list({itemsView:`full`,sortDirection:`desc`})}",
    "var railQuery;railQuery=query(atom,(threadId,{get:get})=>{return{queryKey:[`prompt-rail-history`,threadId]}});",
    "function Thread(){let mode=read(modeAtom,threadId),timeline=!0,voice=!1,kind=`root`,",
    "enabled=timeline&&(mode===`paginated`||mode===`legacy`&&supported(host))&&!voice&&kind!==`subagent`,",
    "{data:indexData}=read(railQuery,enabled?threadId:null),complete=enabled&&indexData?.complete===!0;",
    "return build({historyItems:indexData?.items,complete})}",
  ].join("");
}

test("official navigation uses the complete metadata index without a remote flag", () => {
  const source = fixture();
  assert.equal(isThreadNavigationHistoryIndexAsset(source), true);
  assert.equal(hasOfficialThreadNavigationHistoryIndex(source), true);
  assert.equal(applyLinuxThreadNavigationHistoryIndexPatch(source), source);
});

test("navigation verification fails closed on eager, gated, or incomplete history", () => {
  for (const damaged of [
    fixture().replace("itemsView:`notLoaded`", "itemsView:`full`"),
    fixture().replace("complete:!0", "complete:!1"),
    fixture().replace(
      "timeline&&(mode===`paginated`",
      "readFlag(`209459230`)&&timeline&&(mode===`paginated`",
    ),
    fixture().replace("kind!==`subagent`", "kind===`subagent`"),
  ]) {
    assert.equal(hasOfficialThreadNavigationHistoryIndex(damaged), false);
    assert.throws(
      () => applyLinuxThreadNavigationHistoryIndexPatch(damaged),
      /does not satisfy the flag-free metadata index contract/u,
    );
  }
});

test(
  "current upstream bundle satisfies the flag-free metadata navigation contract",
  { skip: process.env.CODEX_WEBVIEW_ASSET == null },
  () => {
    const source = fs.readFileSync(process.env.CODEX_WEBVIEW_ASSET, "utf8");
    assert.equal(isThreadNavigationHistoryIndexAsset(source), true);
    assert.equal(hasOfficialThreadNavigationHistoryIndex(source), true);
    assert.equal(applyLinuxThreadNavigationHistoryIndexPatch(source), source);
  },
);
