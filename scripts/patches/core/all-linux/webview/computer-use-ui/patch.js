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
    pattern: /^app-initial~artifact-tab-content\.electron~notebook-preview-panel~app-main~settings-command-~cajo70vh-[^.]+\.js$/,
    missingDescription: "current Computer Use host-platform bundle",
    skipDescription: "Linux Computer Use host-platform patch",
    apply: applyLinuxComputerUseHostPlatformPatch,
  }),
  webviewAssetPatch({
    id: "linux-computer-use-install-flow",
    phase: "webview-asset",
    order: 1110,
    ciPolicy: "opt-in",
    enabled: (context) => context.enableComputerUseUi,
    pattern: /^app-initial~avatarOverlayCompositionSurface~artifact-tab-content\.electron~notebook-preview-~iaq4jiqv-[^.]+\.js$/,
    missingDescription: "current Computer Use install flow bundle",
    skipDescription: "Linux Computer Use install flow patch",
    requiredMarkers: [COMPUTER_USE_INSTALL_FLOW_MARKER],
    apply: applyLinuxComputerUseInstallFlowPatch,
  }),
];
