"use strict";
const fs = require("node:fs");
const path = require("node:path");

function writeUnifiedComputerUseFixture(installDir) {
  const target = path.join(installDir, "resources/plugins/openai-bundled/plugins/unified-computer-use");
  fs.mkdirSync(path.join(target, ".codex-plugin"), { recursive: true });
  fs.writeFileSync(path.join(target, ".codex-plugin/plugin.json"), JSON.stringify({
    name: "unified-computer-use", version: "26.908.31748", mcpServers: "./.mcp.json",
  }));
  fs.writeFileSync(path.join(target, ".mcp.json"), JSON.stringify({
    mcpServers: { cua_repl: { command: "node", args: [], enabled: false } },
  }));
  const globalsPath = path.join(installDir,
    "resources/cua_node/lib/node_modules/@oai/cua/dist/lib/js/oai_js_cua/src/tinysky_alt/globals.js");
  const originalGlobals = 'const selected=nodeRepl.env.CUA_REPL_ENABLED_SURFACES;const cua=await create({browser:surfaces.has("browser"),computer:surfaces.has("computer")});';
  fs.mkdirSync(path.dirname(globalsPath), { recursive: true });
  fs.writeFileSync(globalsPath, originalGlobals);
  return { globalsPath, originalGlobals };
}

module.exports = { writeUnifiedComputerUseFixture };
