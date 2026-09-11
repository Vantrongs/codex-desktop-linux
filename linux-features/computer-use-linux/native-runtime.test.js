"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { pathToFileURL } = require("node:url");
const test = require("node:test");
const { patchLinuxNativeRuntime } = require("./native-runtime.js");

const fixture = 'const selected=nodeRepl.env.CUA_REPL_ENABLED_SURFACES;const cua=await create({browser:surfaces.has("browser"),computer:surfaces.has("computer")});';

test("native initialization retains browser selection and rejects ambiguous or damaged ownership", () => {
  const patched = patchLinuxNativeRuntime(fixture);
  assert.match(patched, /browser:surfaces\.has\("browser"\)/u);
  assert.match(patched, /computer:\/\*codexLinuxOwnsNativeCua\*\/!1/u);
  assert.equal(patchLinuxNativeRuntime(patched), patched);
  for (const source of [fixture + fixture, fixture.replace('computer:surfaces', 'computer:other'),
    patched.replace('*/!1', '*/!0'), fixture + patched]) {
    assert.throws(() => patchLinuxNativeRuntime(source), /contract drift/u);
  }
});

test("actual bundled CUA initializes every selected surface without upstream Sky RPC",
  { skip: process.env.CODEX_CUA_RUNTIME_ROOT == null }, () => {
    const directory = path.join(process.env.CODEX_CUA_RUNTIME_ROOT,
      "dist/lib/js/oai_js_cua/src/tinysky_alt");
    const source = patchLinuxNativeRuntime(fs.readFileSync(path.join(directory, "globals.js"), "utf8"))
      .replace('"./create_tinysky_alt.js"', JSON.stringify(pathToFileURL(path.join(directory, "create_tinysky_alt.js")).href));
    const globalsUrl = "data:text/javascript;base64," + Buffer.from(source).toString("base64");
    for (const surfaces of ["browser", "computer", "browser,computer"]) {
      const probe = `
        const assert = await import('node:assert/strict');
        const calls = [];
        globalThis.nodeRepl = { env: {CUA_REPL_ENABLED_SURFACES: ${JSON.stringify(surfaces)}}, write() {},
          rpc: async (service, request) => {
            calls.push([service, request]);
            assert.equal(service, 'browser', 'upstream Sky must not initialize');
            assert.equal(request.method, 'setup');
            return {apiManifest: {interfaces: {}}, disabledMemberIds: []};
          }};
        await import(${JSON.stringify(globalsUrl)});
        if (${surfaces.includes("computer")}) {
          const {installLinuxComputerUse} = await import(${JSON.stringify(pathToFileURL(path.join(__dirname, "native-client.mjs")).href)});
          installLinuxComputerUse(cua);
        }
        assert.equal(typeof cua.getApp, ${JSON.stringify(surfaces.includes("computer") ? "function" : "undefined")});
        assert.equal(typeof cua.getBrowser, ${JSON.stringify(surfaces.includes("browser") ? "function" : "undefined")});
        assert.equal(calls.length, ${surfaces.includes("browser") ? 1 : 0});
      `;
      const result = spawnSync(process.execPath, ["--input-type=module", "--eval", probe],
        { encoding: "utf8", timeout: 5000 });
      assert.equal(result.status, 0, `${surfaces}: ${result.error ?? ""}\n${result.stderr}`);
    }
  });

module.exports = { fixture };
