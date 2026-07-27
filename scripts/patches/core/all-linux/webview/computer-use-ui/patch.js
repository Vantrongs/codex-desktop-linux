"use strict";

const {
  webviewAssetPatch,
} = require("../../../../descriptor.js");
const {
  COMPUTER_USE_AVAILABILITY_MARKER,
  COMPUTER_USE_INSTALL_FLOW_MARKER,
  applyLinuxComputerUseHostPlatformPatch,
  applyLinuxComputerUseRendererAvailabilityPatch,
  applyLinuxComputerUseInstallFlowPatch,
  matchesLinuxComputerUseHostPlatformContract,
  matchesLinuxComputerUseInstallFlowContract,
} = require("../../../../impl/computer-use.js");

module.exports = [
  webviewAssetPatch({
    id: "linux-computer-use-ui-availability",
    phase: "webview-asset",
    order: 1100,
    ciPolicy: "opt-in",
    enabled: (context) => context.enableComputerUseUi,
    pattern: /^computer-use-settings-[^.]+\.js$/,
    missingDescription: "Computer Use availability bundle",
    skipDescription: "Linux Computer Use UI availability patch",
    requiredMarkers: [COMPUTER_USE_AVAILABILITY_MARKER],
    apply: applyLinuxComputerUseRendererAvailabilityPatch,
  }),
  webviewAssetPatch({
    id: "linux-computer-use-host-platform",
    phase: "webview-asset",
    order: 1105,
    ciPolicy: "opt-in",
    enabled: (context) => context.enableComputerUseUi,
    pattern: /^app-initial-[^.]+\.js$/,
    assetMatch: matchesLinuxComputerUseHostPlatformContract,
    missingDescription: "current Computer Use host-platform app-initial contract",
    skipDescription: "Linux Computer Use host-platform patch",
    apply: applyLinuxComputerUseHostPlatformPatch,
  }),
  webviewAssetPatch({
    id: "linux-computer-use-install-flow",
    phase: "webview-asset",
    order: 1110,
    ciPolicy: "opt-in",
    enabled: (context) => context.enableComputerUseUi,
    pattern: /^app-initial-[^.]+\.js$/,
    assetMatch: matchesLinuxComputerUseInstallFlowContract,
    missingDescription: "current Computer Use install flow app-initial contract",
    skipDescription: "Linux Computer Use install flow patch",
    requiredMarkers: [COMPUTER_USE_INSTALL_FLOW_MARKER],
    apply: applyLinuxComputerUseInstallFlowPatch,
  }),
];
