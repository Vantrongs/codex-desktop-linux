"use strict";

const {
  CI_POLICY_REQUIRED_UPSTREAM,
  extractedAppPatch,
  mainBundlePatch,
  webviewAssetPatch,
} = require("../../scripts/patches/descriptor.js");
const {
  applyLinuxRendererCrashDiagnosticsPatch,
} = require("../../scripts/patches/impl/main-process/crash-diagnostics.js");
const {
  applyLinuxRendererMinidumpRetentionExtractedAppPatch,
} = require("../../scripts/patches/impl/main-process/minidump-retention.js");
const {
  applyLinuxRendererCrashBreadcrumbsPatch,
  matchesLinuxRendererCrashBreadcrumbsContract,
} = require("../../scripts/patches/impl/webview/renderer-crash-breadcrumbs.js");

module.exports = [
  extractedAppPatch({
    id: "linux-renderer-minidump-retention",
    phase: "extracted-app:pre-webview",
    order: 30_050,
    ciPolicy: CI_POLICY_REQUIRED_UPSTREAM,
    apply: applyLinuxRendererMinidumpRetentionExtractedAppPatch,
  }),
  mainBundlePatch({
    id: "linux-renderer-crash-diagnostics",
    order: 30_100,
    ciPolicy: CI_POLICY_REQUIRED_UPSTREAM,
    apply: applyLinuxRendererCrashDiagnosticsPatch,
  }),
  webviewAssetPatch({
    id: "linux-renderer-crash-breadcrumbs",
    order: 30_110,
    ciPolicy: CI_POLICY_REQUIRED_UPSTREAM,
    pattern: /^(?:app-initial|app-main)-[^.]+\.js$/,
    assetMatch: matchesLinuxRendererCrashBreadcrumbsContract,
    missingDescription: "desktop global-error webview bundle",
    skipDescription: "Linux renderer crash breadcrumb patch",
    requiredMarkers: [
      "function codexLinuxInstallRendererCrashBreadcrumbs()",
      "[codex-linux-renderer-breadcrumb]",
    ],
    apply: applyLinuxRendererCrashBreadcrumbsPatch,
  }),
];
