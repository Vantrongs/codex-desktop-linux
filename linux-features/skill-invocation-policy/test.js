#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  applyWebviewAssetPatchDescriptors,
  normalizePatchDescriptors,
} = require("../../scripts/patches/engine.js");
const {
  loadLinuxFeaturePatchDescriptors,
} = require("../../scripts/lib/linux-features.js");
const {
  COMPOSER_FILTER_NAME,
  COMPOSER_PATCH_MARKER,
  COMPOSER_REGISTRATION_PATCH_MARKER,
  COMPOSER_TRIGGER_PATCH_MARKER,
  COMPONENT_NAME,
  PATCH_MARKER,
  applySkillInvocationComposerPatch,
  applySkillInvocationPolicyPatch,
  descriptors,
  skillInvocationComposerRuntimeSource,
  skillInvocationPolicyRuntimeSource,
} = require("./patch.js");

function skillCardFixture() {
  return [
    "function rc(e){let t=(0,sc.c)(138),{hostId:c,skill:h,onSkillsUpdated:T}=e,",
    "[z,ee]=(0,cc.useState)(null),",
    "oe=e=>Be(`write-skill-config`,h.name.includes(`:`)?{hostId:c,name:h.name,enabled:e}:{hostId:c,path:h.path,enabled:e}),",
    "ue=l(oe),de=z!=null&&(ue.isPending||h.enabled!==z)?z:h.enabled,",
    "ze=headerToggle,Ue=moreMenu,",
    "We=(0,J.jsxs)(`div`,{className:`flex items-center gap-2`,children:[ze,Ue]}),",
    "j=`toggle`,Ke=label,xe=!1,",
    "et=j===`toggle`?()=>((0,J.jsxs)(`div`,{className:`flex items-center gap-2`,children:[",
    "(0,J.jsx)(ke,{tooltipContent:(0,J.jsx)(G,{...Ke}),children:(0,J.jsx)(Ki,{checked:de,disabled:xe})})",
    "]})):null;return We}var sc;",
  ].join("");
}

function composerFixture() {
  return [
    "function qU(e=null,{enableFileMentions:n=!0,enableSkillMentions:a=!0,enableSlashCommands:o=!0}={}){",
    "let d=o?(typeof o==`boolean`?{}:o).triggers??[`/`]:[],",
    "f={...n?{\"@\":`at-mention`}:{},...a?{$:`skill-mention`}:{},...Object.fromEntries(d.map(e=>[e,`slash-command`]))}}",
    "function UB(e,t){let n=e.nodeBefore?.text,r=n?.match(ZB),i=t[`@`]===`at-mention`?n?.match(QB):null,",
    "a=t.$===`skill-mention`?n?.match($B):null,o=r?.[1],s=r?.[2];",
    "if(s==null||o!==`/`&&o!==`@`&&o!==`$`)return null;return{kind:t[o],query:s,trigger:o}}",
    "var ZB=/(?:^|\\s)([/@$])([\\p{L}\\p{N}\\p{M}.:_/\\\\-]*)$/u,",
    "QB=/(?:^|[\\s([{])@([^@]*)$/u,$B=/(?:^|[\\s([{])\\$([^$]*)$/u;",
    "function XW(e){let t=(0,rG.c)(32),",
    "{className:n,query:r,onUpdateSelectedMention:i,onAddMention:a,onRequestClose:o,cwd:s,roots:l,hostId:u,isHomeMenu:d,chromeVariant:f,keyboardEventTarget:p}=e,",
    "y={isLoading:!1},b=apps,{skills:x,isLoading:S}=data,C=roots,O=tG([",
    "...(0,aG.default)(x.filter(e=>e.enabled&&Dz(e,C)).map(mapSkill),QW),",
    "...b==null?[]:b.map(e=>mapApp(e))],r),",
    "k=O.length===0&&(S||b==null&&y.isLoading),M=`composer.skillMentionList.noResults`;return{O,k,M}}",
    "function PG(e){let t=(0,AG.c)(60),n=e.suggestions;let j=n.ui?.query??``,M;",
    "M=(0,NG.jsx)(XW,{className:d,query:j,onUpdateSelectedMention:n.setSelectedMention,",
    "onAddMention:n.addMention,onRequestClose:n.closeAutocomplete})}",
  ].join("");
}

function currentComposerRegistrationUiFixture() {
  return [
    "function wa(e=null,{enableSkillMentions:a=!0,enableSlashCommands:o=!0}={}){",
    "let u=o?(typeof o==`boolean`?{}:o).triggers??[`/`]:[],d={...a?{$:`skill-mention`}:{},...Object.fromEntries(u.map(e=>[e,`slash-command`]))}}",
    "function oo(e){let t=(0,mo.c)(33),{className:n,query:r,onUpdateSelectedMention:a,onAddMention:o,onRequestClose:s,placement:c,cwd:l,roots:u,hostId:d,isHomeMenu:f,chromeVariant:p,keyboardEventTarget:m}=e,",
    "x={isLoading:!1},S=apps,{skills:C,isLoading:w}=data,T=roots,M=list([...(0,go.default)(C.filter(e=>e.enabled&&Yn(e,T)).map(mapSkill),sortSkill),...S==null?[]:S.map(e=>mapApp(e))],r),",
    "N=M.length===0&&(w||S==null&&x.isLoading),L=`composer.skillMentionList.noResults`;return{M,N,L}}",
    "function bo(e){let t=(0,So.c)(61),n=e.autocomplete;if(!n.ui?.active)return null;let M=n.ui?.query??``,P;",
    "P=(0,To.jsx)(oo,{className:f,query:M,onUpdateSelectedMention:n.setSelectedMention,onAddMention:n.addMention,onRequestClose:n.closeAutocomplete})}",
    "function browser(e){let Ge=e.autocomplete,Q=(0,To.jsx)(oo,{className:`max-h-full w-full`,query:Ge.ui?.query??``,keyboardEventTarget:s,onUpdateSelectedMention:Ge.setSelectedMention})}",
  ].join("");
}

function currentComposerTriggerFixture() {
  return [
    "function U(e,t){let n=e.nodeBefore?.text,r=n?.match(K),o=r?.[1],s=r?.[2];",
    "if(s==null||o!==`/`&&o!==`@`&&o!==`$`)return null;return{kind:t[o],query:s,trigger:o}}",
    "var K=/(?:^|\\s)([/@$])([\\p{L}\\p{N}\\p{M}.:_/\\\\-]*)$/u;",
  ].join("");
}

function applyPatchTwice(source) {
  const once = applySkillInvocationPolicyPatch(source);
  assert.notEqual(once, source);
  assert.equal(applySkillInvocationPolicyPatch(once), once);
  return once;
}

function withTempDir(callback) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "skill-invocation-policy-"));
  try {
    return callback(tempDir);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

function withFeatureConfig(enabled, callback) {
  const previous = process.env.CODEX_LINUX_FEATURES_CONFIG;
  return withTempDir((tempDir) => {
    const configPath = path.join(tempDir, "features.json");
    fs.writeFileSync(configPath, `${JSON.stringify({ enabled })}\n`);
    process.env.CODEX_LINUX_FEATURES_CONFIG = configPath;
    try {
      return callback(path.resolve(__dirname, ".."));
    } finally {
      if (previous == null) {
        delete process.env.CODEX_LINUX_FEATURES_CONFIG;
      } else {
        process.env.CODEX_LINUX_FEATURES_CONFIG = previous;
      }
    }
  });
}

function runtimeButton({
  skill,
  enabled = true,
  isUpdating = false,
  response = { effectiveEnabled: true },
}) {
  const calls = [];
  const updates = [];
  const state = [];
  let cursor = 0;
  const ReactRuntime = {
    useEffect(effect) {
      effect();
    },
    useState(initialValue) {
      const index = cursor;
      cursor += 1;
      if (!(index in state)) {
        state[index] = typeof initialValue === "function" ? initialValue() : initialValue;
      }
      return [state[index], (value) => {
        state[index] = typeof value === "function" ? value(state[index]) : value;
      }];
    },
  };
  const JsxRuntime = {
    jsx(type, props) {
      return { type, props };
    },
  };
  const bridge = async (method, payload) => {
    calls.push({ method, payload });
    return response;
  };
  const runtime = skillInvocationPolicyRuntimeSource({
    reactVar: "ReactRuntime",
    jsxVar: "JsxRuntime",
    bridgeVar: "bridge",
  });
  const component = Function(
    "ReactRuntime",
    "JsxRuntime",
    "bridge",
    `${runtime};return ${COMPONENT_NAME};`,
  )(ReactRuntime, JsxRuntime, bridge);
  let currentSkill = skill;
  const render = (nextSkill = currentSkill) => {
    currentSkill = nextSkill;
    cursor = 0;
    return component({
      hostId: "local",
      skill: currentSkill,
      enabled,
      isUpdating,
      onUpdated(value) {
        updates.push(value);
      },
    });
  };
  return { button: render(), calls, render, updates };
}

test("feature stays disabled until selected and loads both opt-in descriptors", () => {
  withFeatureConfig([], (featuresRoot) => {
    assert.deepEqual(loadLinuxFeaturePatchDescriptors({ featuresRoot }), []);
  });

  withFeatureConfig(["skill-invocation-policy"], (featuresRoot) => {
    const loaded = loadLinuxFeaturePatchDescriptors({ featuresRoot });
    assert.deepEqual(
      loaded.map((descriptor) => [descriptor.id, descriptor.phase, descriptor.ciPolicy]),
      [
        ["feature:skill-invocation-policy:skill-invocation-policy-ui", "webview-asset", "opt-in"],
        ["feature:skill-invocation-policy:skill-invocation-policy-composer-ui", "webview-asset", "opt-in"],
        ["feature:skill-invocation-policy:skill-invocation-policy-composer-trigger", "webview-asset", "opt-in"],
      ],
    );
  });
});

test("descriptors target the Skill card and main composer chunks", () => {
  assert.deepEqual(
    descriptors.map((descriptor) => [descriptor.id, descriptor.phase, descriptor.ciPolicy]),
    [
      ["skill-invocation-policy-ui", "webview-asset", "opt-in"],
      ["skill-invocation-policy-composer-ui", "webview-asset", "opt-in"],
      ["skill-invocation-policy-composer-trigger", "webview-asset", "opt-in"],
    ],
  );
  assert.equal(descriptors[0].pattern.test("plugin-detail-page-DmxssFl8.js"), true);
  assert.equal(descriptors[0].pattern.test("skills-page-Cfu9UALJ.js"), false);
  assert.equal(
    descriptors[1].pattern.test(
      "app-initial~artifact-tab-content.electron~app-main~pull-request-code-review~new-thread-pane~current.js",
    ),
    true,
  );
  assert.equal(
    descriptors[1].pattern.test(
      "app-initial~artifact-tab-content.electron~app-main~appgen-settings-page~page~current.js",
    ),
    true,
  );
  assert.equal(descriptors[1].pattern.test("app-initial-BHB6SClA.js"), true);
  assert.equal(descriptors[1].pattern.test("app-initial-Czet5G9g.css"), false);
  assert.equal(descriptors[1].pattern.test("plugin-detail-page-DmxssFl8.js"), false);
});

test("composer patch adds strict $/! routing atomically and idempotently", () => {
  const source = composerFixture();
  const patched = applySkillInvocationComposerPatch(source);

  assert.notEqual(patched, source);
  assert.equal(applySkillInvocationComposerPatch(patched), patched);
  assert.match(patched, new RegExp(COMPOSER_PATCH_MARKER));
  assert.match(patched, new RegExp(COMPOSER_REGISTRATION_PATCH_MARKER));
  assert.match(patched, new RegExp(COMPOSER_TRIGGER_PATCH_MARKER));
  assert.match(patched, /\$:`skill-mention`,"!":`skill-mention`/);
  assert.match(patched, /\(\[\/@\$!\]\)/);
  assert.match(patched, /o!==`\$`&&o!==`!`/);
  assert.match(patched, /invocationTrigger:j\[0\],query:j\.slice\(1\)/);
  assert.match(
    patched,
    /codexLinuxSkillMatchesInvocationTrigger\(e,codexLinuxInvocationTrigger\)&&Dz\(e,C\)/,
  );
  assert.match(patched, /codexLinuxInvocationTrigger===`!`\?\[\]:b==null/);
});

test("composer patch fails closed when a required anchor drifts", () => {
  const source = composerFixture().replace(
    "k=O.length===0&&(S||b==null&&y.isLoading),",
    "k=O.length===0&&S,",
  );
  assert.throws(
    () => applySkillInvocationComposerPatch(source),
    /Could not install manual Skill composer policy/u,
  );
});

test("composer patch supports the current split trigger and Skill menu chunks", () => {
  const registrationUi = applySkillInvocationComposerPatch(currentComposerRegistrationUiFixture());
  const trigger = applySkillInvocationComposerPatch(currentComposerTriggerFixture());

  assert.match(registrationUi, new RegExp(COMPOSER_REGISTRATION_PATCH_MARKER));
  assert.match(registrationUi, new RegExp(COMPOSER_PATCH_MARKER));
  assert.doesNotMatch(registrationUi, new RegExp(COMPOSER_TRIGGER_PATCH_MARKER));
  assert.match(registrationUi, /invocationTrigger:M\[0\],query:M\.slice\(1\)/);
  assert.match(
    registrationUi,
    /invocationTrigger:Ge\.ui\?\.trigger\?\?`\$`,query:Ge\.ui\?\.query\?\?``/,
  );
  assert.match(trigger, new RegExp(COMPOSER_TRIGGER_PATCH_MARKER));
  assert.doesNotMatch(trigger, new RegExp(COMPOSER_PATCH_MARKER));
  assert.equal(applySkillInvocationComposerPatch(registrationUi), registrationUi);
  assert.equal(applySkillInvocationComposerPatch(trigger), trigger);
});

test("composer rejects a damaged alternate Skill menu contract", () => {
  const patched = applySkillInvocationComposerPatch(currentComposerRegistrationUiFixture());
  for (const damaged of [
    patched.replace(
      "invocationTrigger:Ge.ui?.trigger??`$`,query:Ge.ui?.query??``",
      "query:Ge.ui?.query??``",
    ),
    patched.replace("invocationTrigger:M[0]", "invocationTrigger:M[1]"),
    patched.replace(
      "invocationTrigger:Ge.ui?.trigger??`$`",
      "invocationTrigger:Ge.ui?.query",
    ),
  ]) {
    assert.notEqual(damaged, patched);
    assert.throws(
      () => applySkillInvocationComposerPatch(damaged),
      /partial manual Skill composer policy markers/u,
    );
  }
});

test("composer patch preserves the current multi-argument Skill availability predicate", () => {
  const source = currentComposerRegistrationUiFixture().replace(
    "Yn(e,T)",
    "Yn(e,T,b,j)",
  );
  const patched = applySkillInvocationComposerPatch(source);

  assert.notEqual(patched, source);
  assert.match(
    patched,
    /codexLinuxSkillMatchesInvocationTrigger\(e,codexLinuxInvocationTrigger\)&&Yn\(e,T,b,j\)/,
  );
});

test("composer registration patches every current Skill trigger map", () => {
  const source = [
    "let f={...o?{$:`skill-mention`}:{}};",
    "controller.setSuggestionTriggers(enabled?{\"/\":`slash-command`,$:`skill-mention`}:{\"/\":`slash-command`});",
    "const triggers={\"/\":`slash-command`,$:`skill-mention`};",
  ].join("");

  const patched = applySkillInvocationComposerPatch(source);
  assert.equal(
    patched.match(/\$:`skill-mention`,"!":`skill-mention`/gu)?.length,
    3,
  );
  assert.equal(
    patched.match(new RegExp(COMPOSER_REGISTRATION_PATCH_MARKER, "gu"))?.length,
    1,
  );
  assert.equal(applySkillInvocationComposerPatch(patched), patched);
});

test("invocation trigger strictly separates automatic and manual-only Skills", () => {
  const matches = Function(
    `${skillInvocationComposerRuntimeSource()};return ${COMPOSER_FILTER_NAME};`,
  )();
  const automatic = { enabled: true, allowImplicitInvocation: true };
  const defaultAutomatic = { enabled: true };
  const manual = { enabled: true, allowImplicitInvocation: false };
  const disabledManual = { enabled: false, allowImplicitInvocation: false };

  assert.equal(matches(automatic, "$"), true);
  assert.equal(matches(defaultAutomatic, "$"), true);
  assert.equal(matches(manual, "$"), false);
  assert.equal(matches(automatic, "!"), false);
  assert.equal(matches(defaultAutomatic, "!"), false);
  assert.equal(matches(manual, "!"), true);
  assert.equal(matches(disabledManual, "!"), false);
});

test("patch adds A/! controls to the Skill row and preview header atomically", () => {
  const patched = applyPatchTwice(skillCardFixture());

  assert.match(patched, new RegExp(PATCH_MARKER));
  assert.match(patched, /allowImplicitInvocation:i/);
  assert.match(patched, /children:m\?`!`:`A`/);
  assert.equal(
    patched.match(/codexLinuxSkillInvocationPolicyButton,\{hostId:c,skill:h,enabled:de,isUpdating:ue\.isPending,onUpdated:T\}/g)?.length,
    2,
  );
});

test("patch fails closed when only part of the UI contract matches", () => {
  const partial = skillCardFixture().replace(
    "j===`toggle`",
    "children:[extraAction,extraMenu],j===`toggle`",
  );
  assert.throws(
    () => applySkillInvocationPolicyPatch(partial),
    /Could not resolve the Skill preview header actions/u,
  );
});

test("patch rejects a damaged installed Skill policy runtime", () => {
  const patched = applySkillInvocationPolicyPatch(skillCardFixture());
  for (const damaged of [
    patched.replace(
      "function codexLinuxSkillInvocationPolicyKey",
      "function codexLinuxSkillInvocationPolicyKeyDrift",
    ),
    patched.replace(
      "t?.path??t?.name??`unknown`",
      "t?.name??`unknown`",
    ),
  ]) {
    assert.notEqual(damaged, patched);
    assert.throws(
      () => applySkillInvocationPolicyPatch(damaged),
      /incomplete existing invocation-policy marker/u,
    );
  }
});

test("standalone policy cache keys same-named Skills by path", () => {
  const runtime = skillInvocationPolicyRuntimeSource({
    reactVar: "ReactRuntime",
    jsxVar: "JsxRuntime",
    bridgeVar: "bridge",
  });
  const key = Function(`${runtime};return codexLinuxSkillInvocationPolicyKey;`)();
  assert.notEqual(
    key("local", { name: "review", path: "/project-a/review/SKILL.md" }),
    key("local", { name: "review", path: "/project-b/review/SKILL.md" }),
  );
  assert.equal(
    key("local", { name: "plugin:review", path: "/cache-a/review/SKILL.md" }),
    key("local", { name: "plugin:review", path: "/cache-b/review/SKILL.md" }),
  );
});

test("manual-only button sends a false implicit-invocation override by plugin-qualified name", async () => {
  const { button, calls, updates } = runtimeButton({
    skill: {
      name: "mattpocock-skills:ask-matt",
      path: "/skills/ask-matt/SKILL.md",
      enabled: true,
      allowImplicitInvocation: true,
    },
  });
  const events = [];

  assert.equal(button.type, "button");
  assert.equal(button.props.children, "A");
  assert.equal(button.props["aria-pressed"], false);
  await button.props.onClick({
    preventDefault: () => events.push("preventDefault"),
    stopPropagation: () => events.push("stopPropagation"),
  });

  assert.deepEqual(events, ["preventDefault", "stopPropagation"]);
  assert.deepEqual(calls, [{
    method: "write-skill-config",
    payload: {
      hostId: "local",
      name: "mattpocock-skills:ask-matt",
      enabled: true,
      allowImplicitInvocation: false,
    },
  }]);
  assert.deepEqual(updates, [true]);
});

test("manual-only skill is marked with ! and can restore automatic routing by path", async () => {
  const { button, calls } = runtimeButton({
    skill: {
      name: "local-skill",
      path: "/skills/local-skill/SKILL.md",
      enabled: true,
      allowImplicitInvocation: false,
    },
  });

  assert.equal(button.props.children, "!");
  assert.equal(button.props["aria-pressed"], true);
  assert.match(button.props.title, /invoke with !local-skill/);
  await button.props.onClick({ preventDefault() {}, stopPropagation() {} });

  assert.deepEqual(calls[0].payload, {
    hostId: "local",
    path: "/skills/local-skill/SKILL.md",
    enabled: true,
    allowImplicitInvocation: true,
  });
});

test("policy control is disabled when the Skill itself is disabled", async () => {
  const { button, calls } = runtimeButton({
    enabled: false,
    skill: {
      name: "local-skill",
      path: "/skills/local-skill/SKILL.md",
      enabled: false,
      allowImplicitInvocation: false,
    },
  });

  assert.equal(button.props.disabled, true);
  await button.props.onClick({ preventDefault() {}, stopPropagation() {} });
  assert.deepEqual(calls, []);
});

test("policy control is disabled while the ordinary enabled-state write is pending", async () => {
  const { button, calls } = runtimeButton({
    isUpdating: true,
    skill: {
      name: "local-skill",
      path: "/skills/local-skill/SKILL.md",
      enabled: true,
      allowImplicitInvocation: true,
    },
  });

  assert.equal(button.props.disabled, true);
  await button.props.onClick({ preventDefault() {}, stopPropagation() {} });
  assert.deepEqual(calls, []);
});

test("remote catalog Skill metadata without a materialized path has no policy control", () => {
  const { button, calls } = runtimeButton({
    skill: {
      name: "ask-matt",
      path: null,
      enabled: true,
      allowImplicitInvocation: true,
    },
  });

  assert.equal(button, null);
  assert.deepEqual(calls, []);
});

test("authoritative metadata replaces the temporary local A/! state after refetch", async () => {
  const initialSkill = {
    name: "local-skill",
    path: "/skills/local-skill/SKILL.md",
    enabled: true,
    allowImplicitInvocation: true,
  };
  const harness = runtimeButton({ skill: initialSkill });

  await harness.button.props.onClick({ preventDefault() {}, stopPropagation() {} });
  assert.equal(harness.render(initialSkill).props.children, "!");

  const serverConfirmedManual = { ...initialSkill, allowImplicitInvocation: false };
  assert.equal(harness.render(serverConfirmedManual).props.children, "!");

  const externallyRestoredAutomatic = { ...initialSkill, allowImplicitInvocation: true };
  harness.render(externallyRestoredAutomatic);
  assert.equal(harness.render(externallyRestoredAutomatic).props.children, "A");
});

test("an explicit RPC failure does not publish a new policy state", async () => {
  const harness = runtimeButton({
    response: { success: false, effectiveEnabled: true },
    skill: {
      name: "local-skill",
      path: "/skills/local-skill/SKILL.md",
      enabled: true,
      allowImplicitInvocation: true,
    },
  });

  await harness.button.props.onClick({ preventDefault() {}, stopPropagation() {} });
  assert.deepEqual(harness.updates, []);
  assert.equal(harness.render().props.children, "A");
});

test("enabled descriptor patches a matching extracted webview asset", () => {
  withTempDir((extractedDir) => {
    const assetsDir = path.join(extractedDir, "webview", "assets");
    const assetPath = path.join(assetsDir, "plugin-detail-page-fixture.js");
    const composerPath = path.join(
      assetsDir,
      "app-initial-BHB6SClA.js",
    );
    const decoyPath = path.join(assetsDir, "skills-page-decoy.js");
    fs.mkdirSync(assetsDir, { recursive: true });
    fs.writeFileSync(assetPath, skillCardFixture());
    fs.writeFileSync(composerPath, composerFixture());
    fs.writeFileSync(decoyPath, "console.log(`decoy`);");

    applyWebviewAssetPatchDescriptors(
      extractedDir,
      normalizePatchDescriptors(descriptors),
      {},
      null,
    );

    const patched = fs.readFileSync(assetPath, "utf8");
    const patchedComposer = fs.readFileSync(composerPath, "utf8");
    assert.match(patched, new RegExp(PATCH_MARKER));
    assert.match(patched, /allowImplicitInvocation/);
    assert.match(patchedComposer, new RegExp(COMPOSER_PATCH_MARKER));
    assert.equal(fs.readFileSync(decoyPath, "utf8"), "console.log(`decoy`);");
  });
});

test("enabled descriptor patches both current split composer chunks", () => {
  withTempDir((extractedDir) => {
    const assetsDir = path.join(extractedDir, "webview", "assets");
    const uiPath = path.join(
      assetsDir,
      "app-initial~artifact-tab-content.electron~app-main~appgen-settings-page~current.js",
    );
    const triggerPath = path.join(
      assetsDir,
      "app-initial~artifact-tab-content.electron~app-main~pull-request-code-review~new-thread-pane~current.js",
    );
    fs.mkdirSync(assetsDir, { recursive: true });
    fs.writeFileSync(uiPath, currentComposerRegistrationUiFixture());
    fs.writeFileSync(triggerPath, currentComposerTriggerFixture());

    applyWebviewAssetPatchDescriptors(
      extractedDir,
      normalizePatchDescriptors([descriptors[1], descriptors[2]]),
      {},
      null,
    );

    const patchedUi = fs.readFileSync(uiPath, "utf8");
    const patchedTrigger = fs.readFileSync(triggerPath, "utf8");
    assert.match(patchedUi, new RegExp(COMPOSER_REGISTRATION_PATCH_MARKER));
    assert.match(patchedUi, new RegExp(COMPOSER_PATCH_MARKER));
    assert.match(patchedTrigger, new RegExp(COMPOSER_TRIGGER_PATCH_MARKER));
  });
});
