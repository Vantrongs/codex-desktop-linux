"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const {
  THREAD_NAVIGATION_HISTORY_INDEX_MARKER,
  applyLinuxThreadNavigationHistoryIndexPatch,
  hasInstalledThreadNavigationHistoryIndex,
  isThreadNavigationHistoryIndexAsset,
} = require("./thread-navigation-history-index.js");

function fixture() {
  return [
    "async function index(){let p=await list({itemsView:`notLoaded`,sortDirection:`desc`});",
    "if(p.nextCursor==null)return{items:r.reverse(),complete:!0};",
    "return{items:r.reverse(),complete:!1}}",
    "async function preview(){return list({itemsView:`full`,sortDirection:`desc`})}",
    "const query={queryKey:[`prompt-rail-history`,threadId]};",
    "function Thread(){let railFlag=readFlag(`209459230`),parent=null,mode=`paginated`,",
    "voice=!1,hidden=!1,kind=`root`,rail=railFlag&&parent==null&&mode===`paginated`&&!voice,",
    "enabled=rail&&!hidden&&kind!==`subagent`,{data:indexData}=use(query,enabled?threadId:null),",
    "complete=enabled&&indexData?.complete===!0;return build({historyItems:indexData.items,complete})}",
    "function Next(){}",
  ].join("");
}

test("paginated thread navigation uses the complete metadata index without a remote flag", () => {
  const source = fixture();
  assert.equal(isThreadNavigationHistoryIndexAsset(source), true);

  const patched = applyLinuxThreadNavigationHistoryIndexPatch(source);
  assert.equal(applyLinuxThreadNavigationHistoryIndexPatch(patched), patched);
  assert.equal(hasInstalledThreadNavigationHistoryIndex(patched), true);
  assert.equal(
    patched.split(THREAD_NAVIGATION_HISTORY_INDEX_MARKER).length - 1,
    1,
  );
  assert.match(
    patched,
    /railFlag=\(void`codexLinuxThreadNavigationUsesHistoryIndex`,!0\)/u,
  );
  assert.doesNotMatch(patched, /readFlag\(`209459230`\)/u);
  assert.match(patched, /complete===!0/u);
});

test("navigation patch rejects marker-only and semantically damaged output", () => {
  const patched = applyLinuxThreadNavigationHistoryIndexPatch(fixture());
  const markerOnly = `void\`${THREAD_NAVIGATION_HISTORY_INDEX_MARKER}\`;function unrelated(){}`;
  const damaged = patched.replace(
    "railFlag=(void`codexLinuxThreadNavigationUsesHistoryIndex`,!0)",
    "railFlag=(void`codexLinuxThreadNavigationUsesHistoryIndex`,!1)",
  );
  const wrongHistoryMode = patched.replace(
    "mode===`paginated`",
    "mode!==`paginated`",
  );
  const partialIndex = patched.replace("complete===!0", "complete!==!0");

  assert.throws(
    () => applyLinuxThreadNavigationHistoryIndexPatch(markerOnly),
    /partial thread navigation history index patch/u,
  );
  assert.equal(hasInstalledThreadNavigationHistoryIndex(damaged), false);
  assert.equal(hasInstalledThreadNavigationHistoryIndex(wrongHistoryMode), false);
  assert.equal(hasInstalledThreadNavigationHistoryIndex(partialIndex), false);
  assert.throws(
    () => applyLinuxThreadNavigationHistoryIndexPatch(damaged),
    /partial thread navigation history index patch/u,
  );
});

test(
  "current upstream bundle has the guarded metadata navigation index",
  { skip: process.env.CODEX_WEBVIEW_ASSET == null },
  () => {
    const source = fs.readFileSync(process.env.CODEX_WEBVIEW_ASSET, "utf8");
    assert.equal(isThreadNavigationHistoryIndexAsset(source), true);
    const patched = applyLinuxThreadNavigationHistoryIndexPatch(source);
    assert.equal(hasInstalledThreadNavigationHistoryIndex(patched), true);

    const wrongHistoryMode = patched.replace(
      /(=\(void`codexLinuxThreadNavigationUsesHistoryIndex`,!0\)[\s\S]{0,300}?[A-Za-z_$][\w$]*==null&&[A-Za-z_$][\w$]*)===`paginated`/u,
      "$1!==`paginated`",
    );
    assert.notEqual(wrongHistoryMode, patched);
    assert.equal(hasInstalledThreadNavigationHistoryIndex(wrongHistoryMode), false);
  },
);
