"use strict";

const TITLE = "Automated private-feature upstream sync failed";
const OWNERSHIP_MARKER = "<!-- private-upstream-sync-failure:v1 -->";
const MANUAL_ONLY_LABEL = "workflow: manual only";
const ISSUE_LABELS = [
  "type: maintenance",
  "area: ci and tooling",
  "area: linux features",
  "status: ready for work",
];

function hasLabel(issue, name) {
  return (issue.labels ?? []).some((label) =>
    (typeof label === "string" ? label : label?.name) === name);
}

function isOwnedIssue(issue) {
  return issue.pull_request == null &&
    issue.title === TITLE &&
    issue.body?.includes(OWNERSHIP_MARKER) === true;
}

async function listOwnedOpenIssues(github, repo) {
  const { data: issues } = await github.rest.issues.listForRepo({
    ...repo,
    state: "open",
    per_page: 100,
  });
  return issues.filter(isOwnedIssue).sort((left, right) => left.number - right.number);
}

function failureBody(runUrl) {
  return [
    OWNERSHIP_MARKER,
    "The scheduled merge of `ilysenko/codex-desktop-linux:main` into the private feature branch failed.",
    "",
    `Workflow run: ${runUrl}`,
    "",
    "The private branch and deployed package were not advanced. Resolve the merge or patch drift locally, then rerun the workflow.",
  ].join("\n");
}

async function recordPrivateUpstreamSyncFailure({ github, repo, runUrl }) {
  const body = failureBody(runUrl);
  const [existing] = await listOwnedOpenIssues(github, repo);
  if (existing == null) {
    const { data: created } = await github.rest.issues.create({
      ...repo,
      title: TITLE,
      body,
      labels: ISSUE_LABELS,
    });
    return { action: "created", issueNumber: created.number };
  }
  if (hasLabel(existing, MANUAL_ONLY_LABEL)) {
    return { action: "ignored-manual-only", issueNumber: existing.number };
  }
  await github.rest.issues.createComment({
    ...repo,
    issue_number: existing.number,
    body,
  });
  return { action: "commented", issueNumber: existing.number };
}

async function closeResolvedPrivateUpstreamSyncFailure({ github, repo }) {
  const [existing] = await listOwnedOpenIssues(github, repo);
  if (existing == null) {
    return { action: "not-found" };
  }
  if (hasLabel(existing, MANUAL_ONLY_LABEL)) {
    return { action: "ignored-manual-only", issueNumber: existing.number };
  }
  await github.rest.issues.update({
    ...repo,
    issue_number: existing.number,
    state: "closed",
    state_reason: "completed",
  });
  return { action: "closed", issueNumber: existing.number };
}

module.exports = {
  ISSUE_LABELS,
  MANUAL_ONLY_LABEL,
  OWNERSHIP_MARKER,
  TITLE,
  closeResolvedPrivateUpstreamSyncFailure,
  failureBody,
  hasLabel,
  isOwnedIssue,
  recordPrivateUpstreamSyncFailure,
};
