"use strict";

const MARKER = "codexLinuxOwnsNativeCua";
const CURRENT = /await [A-Za-z_$][\w$]*\(\{browser:([A-Za-z_$][\w$]*)\.has\("browser"\),computer:\1\.has\("computer"\)\}\)/g;
const INSTALLED = /await [A-Za-z_$][\w$]*\(\{browser:([A-Za-z_$][\w$]*)\.has\("browser"\),computer:\/\*codexLinuxOwnsNativeCua\*\/!1\}\)/g;

function patchLinuxNativeRuntime(source) {
  const current = [...source.matchAll(CURRENT)];
  const installed = [...source.matchAll(INSTALLED)];
  const markerCount = source.split(MARKER).length - 1;
  if (!source.includes("CUA_REPL_ENABLED_SURFACES")) {
    throw new Error("Linux native CUA runtime lost its surface selection contract");
  }
  if (current.length === 0 && installed.length === 1 && markerCount === 1) return source;
  if (current.length !== 1 || installed.length !== 0 || markerCount !== 0) {
    throw new Error("Linux native CUA runtime initialization contract drift");
  }
  // Browser creation and selected-surface validation remain upstream. The
  // banner installs our native client after globals.js finishes; upstream Sky
  // must not send its incompatible {type: "setup"} request to our RPC service.
  return source.replace(CURRENT, match => match.replace(
    /computer:[A-Za-z_$][\w$]*\.has\("computer"\)/,
    `computer:/*${MARKER}*/!1`,
  ));
}

module.exports = { patchLinuxNativeRuntime };
