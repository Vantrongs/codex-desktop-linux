"use strict";

const {
  CI_POLICY_REQUIRED_UPSTREAM,
  webviewAssetPatch,
} = require("../../../../descriptor.js");
const {
  AGENT_ACTIVITY_LAYOUT_MARKER,
  applyLinuxAgentActivityLayoutStabilityPatch,
  isAgentActivityLayoutAsset,
} = require("../../../../impl/webview/agent-activity-layout-stability.js");

module.exports = [webviewAssetPatch({
  id: "linux-agent-activity-layout-stability",
  order: 1065,
  ciPolicy: CI_POLICY_REQUIRED_UPSTREAM,
  pattern: /^app-(?:initial|main)-[^.]+\.js$/,
  assetMatch: isAgentActivityLayoutAsset,
  missingDescription: "agent activity disclosure webview bundle",
  skipDescription: "Linux agent activity disclosure layout stability patch",
  requiredMarkers: [AGENT_ACTIVITY_LAYOUT_MARKER],
  apply: applyLinuxAgentActivityLayoutStabilityPatch,
})];
