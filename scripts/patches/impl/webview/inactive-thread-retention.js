"use strict";

const INACTIVE_THREAD_RETENTION_MARKER =
  "codexLinuxInactiveThreadRetentionThirtyMinutes";
const IDENTIFIER = "[A-Za-z_$][\\w$]*";

const UPSTREAM_RETENTION_PATTERN = new RegExp(
  `(${IDENTIFIER})=3600\\*1e3,` +
    `(${IDENTIFIER})=15e3,` +
    `(${IDENTIFIER})=4,` +
    `(${IDENTIFIER})=class\\{params;inactiveOwnerConversationSinceById=new Map`,
  "gu",
);
const INSTALLED_RETENTION_PATTERN = new RegExp(
  `void` +
    "`" +
    INACTIVE_THREAD_RETENTION_MARKER +
    "`" +
    `,(${IDENTIFIER})=30\\*60\\*1e3,` +
    `(${IDENTIFIER})=15e3,` +
    `(${IDENTIFIER})=4,` +
    `(${IDENTIFIER})=class\\{params;inactiveOwnerConversationSinceById=new Map`,
  "gu",
);

const RETENTION_CLASS_END_PATTERN = new RegExp(
  `hasActiveConversationView\\((${IDENTIFIER})\\)\\{return this\\.params\\.` +
    `threadStore\\.isConversationActive\\(\\1\\)\\}`,
  "u",
);

function matchesRetentionContract(source, retentionIndex) {
  const remainder = source.slice(retentionIndex, retentionIndex + 30_000);
  const classEnd = RETENTION_CLASS_END_PATTERN.exec(remainder);
  if (classEnd == null) return false;
  const retentionClass = remainder.slice(0, classEnd.index + classEnd[0].length);
  const id = IDENTIFIER;
  const inactivityGuardPattern = new RegExp(
    `(${id})==null\\|\\|\\1\\.resumeState!==` +
      "`resumed`" +
      `\\|\\|this\\.params\\.streamState\\.getStreamRole\\((${id})\\)` +
      `\\?\\.role!==` +
      "`owner`" +
      `\\|\\|this\\.hasActiveConversationView\\(\\2\\)` +
      `\\|\\|this\\.params\\.streamState\\.hasFollowersOrPendingFollowerReconnect\\(\\2\\)` +
      `(?:\\|\\|this\\.unsubscribingConversationIds\\.has\\(\\2\\))?` +
      `\\|\\|this\\.shouldKeepConversationLoaded\\(\\1\\)\\)continue`,
    "gu",
  );
  const safeClearPattern = new RegExp(
    `${id}=!${id}&&!this\\.hasActiveConversationView\\(${id}\\)&&` +
      `!this\\.params\\.streamState\\.hasFollowersOrPendingFollowerReconnect\\(${id}\\)&&` +
      `!this\\.shouldKeepConversationLoaded\\(${id}\\)`,
    "u",
  );

  return (
    retentionClass.includes("inactive_thread_unsubscribe_started") &&
    retentionClass.includes("inactive_thread_unsubscribed") &&
    retentionClass.includes("thread/unsubscribe") &&
    retentionClass.includes("resumeState=`needs_resume`") &&
    retentionClass.includes("turnsPagination={olderCursor:null") &&
    retentionClass.includes("threadRuntimeStatus?.type===`active`") &&
    retentionClass.includes("?.status===`inProgress`") &&
    retentionClass.includes("hasFollowersOrPendingFollowerReconnect") &&
    retentionClass.includes("this.shouldKeepConversationLoaded(") &&
    retentionClass.includes("waitingOnApproval") &&
    retentionClass.includes("waitingOnUserInput") &&
    [...retentionClass.matchAll(inactivityGuardPattern)].length === 2 &&
    safeClearPattern.test(retentionClass) &&
    new RegExp(`${IDENTIFIER}\\(${IDENTIFIER},\\[\\],!1\\)`, "u").test(
      retentionClass,
    )
  );
}

function matches(pattern, source) {
  return [...source.matchAll(new RegExp(pattern.source, "gu"))];
}

function hasInstalledInactiveThreadRetention(source) {
  const installed = matches(INSTALLED_RETENTION_PATTERN, source);
  return (
    source.split(INACTIVE_THREAD_RETENTION_MARKER).length - 1 === 1 &&
    installed.length === 1 &&
    matches(UPSTREAM_RETENTION_PATTERN, source).length === 0 &&
    matchesRetentionContract(source, installed[0].index)
  );
}

function isInactiveThreadRetentionAsset(source) {
  if (source.includes(INACTIVE_THREAD_RETENTION_MARKER)) {
    return hasInstalledInactiveThreadRetention(source);
  }
  const upstream = matches(UPSTREAM_RETENTION_PATTERN, source);
  return upstream.length === 1 && matchesRetentionContract(source, upstream[0].index);
}

function applyLinuxInactiveThreadRetentionPatch(source) {
  if (source.includes(INACTIVE_THREAD_RETENTION_MARKER)) {
    if (hasInstalledInactiveThreadRetention(source)) return source;
    throw new Error("Found partial inactive thread retention patch");
  }

  const upstream = matches(UPSTREAM_RETENTION_PATTERN, source);
  if (
    upstream.length !== 1 ||
    !matchesRetentionContract(source, upstream[0].index)
  ) {
    throw new Error("Could not find unique inactive thread retention policy");
  }

  const match = upstream[0];
  const replacement =
    `void\`${INACTIVE_THREAD_RETENTION_MARKER}\`,` +
    `${match[1]}=30*60*1e3,${match[2]}=15e3,${match[3]}=4,` +
    `${match[4]}=class{params;inactiveOwnerConversationSinceById=new Map`;
  return (
    source.slice(0, match.index) +
    replacement +
    source.slice(match.index + match[0].length)
  );
}

module.exports = {
  INACTIVE_THREAD_RETENTION_MARKER,
  applyLinuxInactiveThreadRetentionPatch,
  hasInstalledInactiveThreadRetention,
  isInactiveThreadRetentionAsset,
};
