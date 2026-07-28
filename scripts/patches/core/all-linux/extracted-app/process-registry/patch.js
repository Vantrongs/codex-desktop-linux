"use strict";

const { extractedAppPatch } = require("../../../../descriptor.js");
const {
  applyLinuxProcessRegistryDurabilityExtractedAppPatch,
} = require("../../../../impl/main-process/process-registry.js");

module.exports = extractedAppPatch({
  id: "linux-process-registry-durability",
  phase: "extracted-app:pre-webview",
  order: 45,
  ciPolicy: "required-upstream",
  apply: applyLinuxProcessRegistryDurabilityExtractedAppPatch,
});
