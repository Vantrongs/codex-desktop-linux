"use strict";

const { extractedAppPatch } = require("../../../../descriptor.js");
const {
  applyLinuxRendererMinidumpRetentionExtractedAppPatch,
} = require("../../../../impl/main-process/minidump-retention.js");

module.exports = extractedAppPatch({
  id: "linux-renderer-minidump-retention",
  phase: "extracted-app:pre-webview",
  order: 50,
  ciPolicy: "required-upstream",
  apply: applyLinuxRendererMinidumpRetentionExtractedAppPatch,
});
