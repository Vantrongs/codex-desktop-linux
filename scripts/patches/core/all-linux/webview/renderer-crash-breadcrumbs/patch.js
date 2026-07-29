"use strict";

const { webviewAssetPatch } = require("../../../../descriptor.js");
const {
  applyLinuxRendererCrashBreadcrumbsPatch,
} = require("../../../../impl/webview/renderer-crash-breadcrumbs.js");

module.exports = [
  webviewAssetPatch({
    id: "linux-renderer-crash-breadcrumbs",
    phase: "webview-asset",
    order: 1070,
    ciPolicy: "required-upstream",
    pattern: /^app-main-[^.]+\.js$/,
    missingDescription: "desktop global-error webview bundle",
    skipDescription: "Linux renderer crash breadcrumb patch",
    requiredMarkers: [
      "function codexLinuxInstallRendererCrashBreadcrumbs()",
      "[codex-linux-renderer-breadcrumb]",
    ],
    apply: applyLinuxRendererCrashBreadcrumbsPatch,
  }),
];
