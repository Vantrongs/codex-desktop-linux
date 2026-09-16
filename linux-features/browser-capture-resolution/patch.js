"use strict";

const { mainBundlePatch, CI_POLICY_REQUIRED_UPSTREAM } = require("../../scripts/patches/descriptor.js");
const { applyBrowserCaptureResolutionPatch } = require("./implementation.js");

module.exports = [mainBundlePatch({
  id: "browser-capture-resolution",
  order: 30_200,
  ciPolicy: CI_POLICY_REQUIRED_UPSTREAM,
  apply: applyBrowserCaptureResolutionPatch,
})];
