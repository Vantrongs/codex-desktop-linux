"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const vm = require("node:vm");
const {
  isThreadHistoryPaginationAsset,
  verifyLinuxThreadHistoryPagination,
} = require("./thread-history-pagination.js");

function fixture() {
  return "const settings={history:{paginatedHistoryEnabled:!0}};" +
    "function Manager(supported){this.runtimeSettings={};" +
    "this.supportsPaginatedThreadHistory=()=>supported;" +
    "this.suppressResumeHistoryDrain=this.runtimeSettings.suppressResumeHistoryDrain??" +
    "(()=>this.supportsPaginatedThreadHistory()&&settings.history.paginatedHistoryEnabled);" +
    "this.loadRemainingConversationTurns=()=>({source:`tail_history`})}";
}

test("native pagination suppresses eager draining only for capable servers without rewriting", () => {
  const source = fixture();
  assert.equal(verifyLinuxThreadHistoryPagination(source), source);
  const context = {};
  vm.runInNewContext(source + ";result=[new Manager(true).suppressResumeHistoryDrain()," +
    "new Manager(false).suppressResumeHistoryDrain()];", context);
  assert.deepEqual(Array.from(context.result), [true, false]);
});

test("native pagination verification rejects disabled, gated, duplicate, and unguarded contracts", () => {
  for (const source of [
    fixture().replace("paginatedHistoryEnabled:!0", "paginatedHistoryEnabled:!1"),
    fixture().replace("paginatedHistoryEnabled:!0", "paginatedHistoryEnabled:remoteFlag()"),
    fixture().replace("this.supportsPaginatedThreadHistory()&&", ""),
    fixture() + ";settings.history.paginatedHistoryEnabled=false;",
    fixture() + fixture(),
    fixture().replace("source:`tail_history`", "source:`full_history`"),
  ]) {
    assert.equal(isThreadHistoryPaginationAsset(source), false);
    assert.throws(() => verifyLinuxThreadHistoryPagination(source), /native thread history pagination/u);
  }
});

test("current official bundle enables native pagination without the retired remote gate",
  { skip: process.env.CODEX_WEBVIEW_ASSET == null }, () => {
    const source = fs.readFileSync(process.env.CODEX_WEBVIEW_ASSET, "utf8");
    assert.equal(verifyLinuxThreadHistoryPagination(source), source);
  });
