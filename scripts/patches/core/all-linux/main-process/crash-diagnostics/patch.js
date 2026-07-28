"use strict";

const { mainBundlePatch } = require("../../../../descriptor.js");
const {
  applyLinuxRendererCrashDiagnosticsPatch,
} = require("../../../../impl/main-process/crash-diagnostics.js");

module.exports = mainBundlePatch({
  id: "linux-renderer-crash-diagnostics",
  phase: "main-bundle",
  order: 125,
  ciPolicy: "required-upstream",
  apply: applyLinuxRendererCrashDiagnosticsPatch,
});
