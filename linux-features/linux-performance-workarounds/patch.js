"use strict";

const {
  CI_POLICY_REQUIRED_UPSTREAM,
  webviewAssetPatch,
} = require("../../scripts/patches/descriptor.js");
const {
  AGENT_ACTIVITY_LAYOUT_MARKER,
  applyLinuxAgentActivityLayoutStabilityPatch,
  isAgentActivityLayoutAsset,
} = require("../../scripts/patches/impl/webview/agent-activity-layout-stability.js");
const {
  THREAD_VIRTUALIZER_LAYOUT_MARKER,
  applyLinuxThreadVirtualizerLayoutStabilityPatch,
  isThreadVirtualizerLayoutAsset,
} = require("../../scripts/patches/impl/webview/thread-virtualizer-layout-stability.js");
const {
  applyLinuxAppShellTabLayoutPerformancePatch,
  applyLinuxMarkdownAnimationPerformancePatch,
  applyLinuxSidebarScrollPerformancePatch,
  matchesLinuxAppShellTabLayoutPerformanceContract,
  matchesLinuxMarkdownAnimationPerformanceContract,
  matchesLinuxSidebarScrollPerformanceContract,
} = require("./implementation.js");

module.exports = [
  webviewAssetPatch({
    id: "sidebar-scroll",
    phase: "webview-asset",
    order: 20_100,
    ciPolicy: "optional",
    pattern: /^app-initial-[^.]+\.js$/,
    assetMatch: matchesLinuxSidebarScrollPerformanceContract,
    missingDescription: "main sidebar scroll bundle",
    skipDescription: "sidebar scroll performance workaround",
    apply: applyLinuxSidebarScrollPerformancePatch,
  }),
  webviewAssetPatch({
    id: "app-shell-tab-layout",
    phase: "webview-asset",
    order: 20_110,
    ciPolicy: "optional",
    pattern: /^app-initial-[^.]+\.js$/,
    assetMatch: matchesLinuxAppShellTabLayoutPerformanceContract,
    missingDescription: "app-shell tab layout bundle",
    skipDescription: "app-shell tab layout performance workaround",
    apply: applyLinuxAppShellTabLayoutPerformancePatch,
  }),
  webviewAssetPatch({
    id: "markdown-animation",
    phase: "webview-asset",
    order: 20_120,
    ciPolicy: "optional",
    pattern: /^app-initial-[^.]+\.css$/,
    assetMatch: matchesLinuxMarkdownAnimationPerformanceContract,
    missingDescription: "streaming Markdown animation stylesheet",
    skipDescription: "Markdown animation performance workaround",
    apply: applyLinuxMarkdownAnimationPerformancePatch,
  }),
  webviewAssetPatch({
    id: "linux-agent-activity-layout-stability",
    order: 20_130,
    ciPolicy: CI_POLICY_REQUIRED_UPSTREAM,
    pattern: /^subagent-activity-chip-group-[^.]+\.js$/,
    assetMatch: isAgentActivityLayoutAsset,
    missingDescription: "agent activity disclosure webview bundle",
    skipDescription: "Linux agent activity disclosure layout stability patch",
    requiredMarkers: [AGENT_ACTIVITY_LAYOUT_MARKER],
    apply: applyLinuxAgentActivityLayoutStabilityPatch,
  }),
  webviewAssetPatch({
    id: "linux-thread-virtualizer-layout-stability",
    order: 20_140,
    ciPolicy: CI_POLICY_REQUIRED_UPSTREAM,
    pattern: /^open-sources-side-panel-tab-[^.]+\.js$/,
    assetMatch: isThreadVirtualizerLayoutAsset,
    missingDescription: "thread virtualizer webview bundle",
    skipDescription: "Linux thread virtualizer layout stability patch",
    requiredMarkers: [THREAD_VIRTUALIZER_LAYOUT_MARKER],
    apply: applyLinuxThreadVirtualizerLayoutStabilityPatch,
  }),
];
