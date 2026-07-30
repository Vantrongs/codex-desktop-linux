"use strict";

const {
  CI_POLICY_REQUIRED_UPSTREAM,
  webviewAssetPatch,
} = require("../../../../descriptor.js");
const {
  THREAD_VIRTUALIZER_LAYOUT_MARKER,
  applyLinuxThreadVirtualizerLayoutStabilityPatch,
  isThreadVirtualizerLayoutAsset,
} = require("../../../../impl/webview/thread-virtualizer-layout-stability.js");

module.exports = [webviewAssetPatch({
  id: "linux-thread-virtualizer-layout-stability",
  order: 1067,
  ciPolicy: CI_POLICY_REQUIRED_UPSTREAM,
  pattern: /^conversation-source-[^.]+\.js$/,
  assetMatch: isThreadVirtualizerLayoutAsset,
  missingDescription: "thread virtualizer webview bundle",
  skipDescription: "Linux thread virtualizer layout stability patch",
  requiredMarkers: [THREAD_VIRTUALIZER_LAYOUT_MARKER],
  apply: applyLinuxThreadVirtualizerLayoutStabilityPatch,
})];
