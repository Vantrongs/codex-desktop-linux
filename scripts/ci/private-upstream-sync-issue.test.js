"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  ISSUE_LABELS,
  MANUAL_ONLY_LABEL,
  OWNERSHIP_MARKER,
  TITLE,
  closeResolvedPrivateUpstreamSyncFailure,
  recordPrivateUpstreamSyncFailure,
} = require("./private-upstream-sync-issue.js");

function githubHarness(issues) {
  const calls = [];
  return {
    calls,
    github: {
      rest: {
        issues: {
          listForRepo: async (input) => {
            calls.push(["list", input]);
            return { data: issues };
          },
          create: async (input) => {
            calls.push(["create", input]);
            return { data: { number: 100 } };
          },
          createComment: async (input) => {
            calls.push(["comment", input]);
            return { data: {} };
          },
          update: async (input) => {
            calls.push(["update", input]);
            return { data: {} };
          },
        },
      },
    },
  };
}

const repo = { owner: "owner", repo: "repo" };

test("same-title human issue is never treated as automation-owned", async () => {
  const harness = githubHarness([
    { number: 7, title: TITLE, body: "human report", labels: [MANUAL_ONLY_LABEL] },
  ]);

  const result = await recordPrivateUpstreamSyncFailure({
    github: harness.github,
    repo,
    runUrl: "https://example.test/run/1",
  });

  assert.deepEqual(result, { action: "created", issueNumber: 100 });
  assert.deepEqual(harness.calls.map(([name]) => name), ["list", "create"]);
  const created = harness.calls[1][1];
  assert.equal(created.title, TITLE);
  assert.match(created.body, new RegExp(OWNERSHIP_MARKER.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.deepEqual(created.labels, ISSUE_LABELS);
});

test("manual-only automation issue is not commented on or closed", async () => {
  const issue = {
    number: 8,
    title: TITLE,
    body: `${OWNERSHIP_MARKER}\nowned`,
    labels: [{ name: MANUAL_ONLY_LABEL }],
  };
  const failureHarness = githubHarness([issue]);
  const failure = await recordPrivateUpstreamSyncFailure({
    github: failureHarness.github,
    repo,
    runUrl: "https://example.test/run/2",
  });
  assert.deepEqual(failure, { action: "ignored-manual-only", issueNumber: 8 });
  assert.deepEqual(failureHarness.calls.map(([name]) => name), ["list"]);

  const successHarness = githubHarness([issue]);
  const success = await closeResolvedPrivateUpstreamSyncFailure({
    github: successHarness.github,
    repo,
  });
  assert.deepEqual(success, { action: "ignored-manual-only", issueNumber: 8 });
  assert.deepEqual(successHarness.calls.map(([name]) => name), ["list"]);
});

test("owned non-manual issue receives failure comments and is closed on recovery", async () => {
  const issue = {
    number: 9,
    title: TITLE,
    body: `${OWNERSHIP_MARKER}\nowned`,
    labels: [],
  };
  const failureHarness = githubHarness([issue]);
  const failure = await recordPrivateUpstreamSyncFailure({
    github: failureHarness.github,
    repo,
    runUrl: "https://example.test/run/3",
  });
  assert.deepEqual(failure, { action: "commented", issueNumber: 9 });
  assert.deepEqual(failureHarness.calls.map(([name]) => name), ["list", "comment"]);
  assert.match(failureHarness.calls[1][1].body, /run\/3/);

  const successHarness = githubHarness([issue]);
  const success = await closeResolvedPrivateUpstreamSyncFailure({
    github: successHarness.github,
    repo,
  });
  assert.deepEqual(success, { action: "closed", issueNumber: 9 });
  assert.deepEqual(successHarness.calls.map(([name]) => name), ["list", "update"]);
  assert.deepEqual(
    {
      issue_number: successHarness.calls[1][1].issue_number,
      state: successHarness.calls[1][1].state,
      state_reason: successHarness.calls[1][1].state_reason,
    },
    { issue_number: 9, state: "closed", state_reason: "completed" },
  );
});
