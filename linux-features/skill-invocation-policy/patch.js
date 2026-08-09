"use strict";

const JS_IDENT = "[A-Za-z_$][\\w$]*";
const PATCH_MARKER = "codexLinuxSkillInvocationPolicyV1";
const COMPOSER_PATCH_MARKER = "codexLinuxManualSkillComposerV1";
const COMPOSER_REGISTRATION_PATCH_MARKER = "codexLinuxManualSkillRegistrationV1";
const COMPOSER_TRIGGER_PATCH_MARKER = "codexLinuxManualSkillTriggerV1";
const COMPOSER_FILTER_NAME = "codexLinuxSkillMatchesInvocationTrigger";
const COMPONENT_NAME = "codexLinuxSkillInvocationPolicyButton";

function warn(message) {
  console.warn(`WARN: ${message} - skipping Skill invocation policy patch`);
}

function countOccurrences(source, needle) {
  let count = 0;
  let cursor = 0;
  while ((cursor = source.indexOf(needle, cursor)) >= 0) {
    count += 1;
    cursor += needle.length;
  }
  return count;
}

function replaceExactlyOnce(source, needle, replacement) {
  if (countOccurrences(source, needle) !== 1) {
    return null;
  }
  return source.replace(needle, () => replacement);
}

function skillInvocationComposerRuntimeSource() {
  return (
    `const ${COMPOSER_PATCH_MARKER}=!0;` +
    `function ${COMPOSER_FILTER_NAME}(e,t){return e?.enabled===!0&&` +
    `(t===\`!\`?e?.allowImplicitInvocation===!1:e?.allowImplicitInvocation!==!1)}`
  );
}

function skillInvocationPolicyRuntimeSource({ reactVar, jsxVar, bridgeVar }) {
  return [
    `const ${PATCH_MARKER}=!0,` +
      `codexLinuxSkillInvocationPolicyValues=new Map,` +
      `codexLinuxSkillInvocationPolicyListeners=new Map;`,
    `function codexLinuxSkillInvocationPolicyKey(e,t){return String(e??\`local\`)+\`:\`+String(t?.name??t?.path??\`unknown\`)}`,
    `function codexLinuxBroadcastSkillInvocationPolicy(e,t){for(let n of codexLinuxSkillInvocationPolicyListeners.get(e)??[])n(t)}`,
    `function codexLinuxPublishSkillInvocationPolicy(e,t,n){codexLinuxSkillInvocationPolicyValues.set(e,{value:t,observedMetadata:n}),codexLinuxBroadcastSkillInvocationPolicy(e,t)}`,
    `function ${COMPONENT_NAME}(e){let{hostId:t,skill:n,enabled:r,isUpdating:i,onUpdated:a}=e,o=codexLinuxSkillInvocationPolicyKey(t,n),s=n?.allowImplicitInvocation!==!1,[c,l]=(0,${reactVar}.useState)(()=>codexLinuxSkillInvocationPolicyValues.get(o)?.value??s),[u,d]=(0,${reactVar}.useState)(!1),[f,p]=(0,${reactVar}.useState)(null);(0,${reactVar}.useEffect)(()=>{let e=codexLinuxSkillInvocationPolicyListeners.get(o);e||(e=new Set,codexLinuxSkillInvocationPolicyListeners.set(o,e)),e.add(l);let t=codexLinuxSkillInvocationPolicyValues.get(o);return t==null?l(s):s!==t.observedMetadata&&(codexLinuxSkillInvocationPolicyValues.delete(o),codexLinuxBroadcastSkillInvocationPolicy(o,s)),()=>{e.delete(l),e.size===0&&codexLinuxSkillInvocationPolicyListeners.delete(o)}},[o,s]);if(n?.path==null)return null;let m=c===!1,h=u||i,g=h?\`Updating skill invocation policy\`:f??(m?\`Manual only — invoke with !\${n?.name??\`skill\`}; the model will not choose it automatically\`:\`Allow only manual invocation\`),y=m?\`Manual only: \${n?.name??\`skill\`}\`:\`Automatic skill selection allowed: \${n?.name??\`skill\`}\`;return(0,${jsxVar}.jsx)(\`button\`,{type:\`button\`,title:g,\"aria-label\":y,\"aria-pressed\":m,disabled:!r||h,className:\`h-token-button-composer min-w-7 rounded-md border border-token-border-default bg-transparent px-2 text-xs font-semibold text-token-text-secondary focus-visible:opacity-100 \${m?\`opacity-100\`:\`opacity-50 hover:opacity-100\`}\`,onClick:async e=>{e.preventDefault(),e.stopPropagation();if(!r||h)return;d(!0),p(null);let i=!c;try{let e=await ${bridgeVar}(\`write-skill-config\`,n?.name?.includes(\`:\`)?{hostId:t,name:n.name,enabled:r,allowImplicitInvocation:i}:{hostId:t,path:n?.path,enabled:r,allowImplicitInvocation:i});if(e?.success===!1)throw Error(\`Skill invocation policy update failed\`);codexLinuxPublishSkillInvocationPolicy(o,i,s),a?.(!0)}catch(e){p(\`Failed to update skill invocation policy\`)}finally{d(!1)}},children:m?\`!\`:\`A\`})}`,
  ].join("");
}

function findSkillCardBinding(source) {
  const requestIndex = source.indexOf("`write-skill-config`");
  if (requestIndex < 0) {
    return null;
  }

  const functionHeaderPattern = new RegExp(
    `function (${JS_IDENT})\\(e\\)\\{let (${JS_IDENT})=\\(0,(${JS_IDENT})\\.c\\)\\((\\d+)\\),`,
    "g",
  );
  let header = null;
  for (const match of source.matchAll(functionHeaderPattern)) {
    if (match.index > requestIndex) {
      break;
    }
    header = match;
  }
  if (header == null) {
    return null;
  }

  const start = header.index;
  const endMarker = source.indexOf("}var ", requestIndex);
  if (endMarker < 0) {
    return null;
  }
  const end = endMarker + 1;
  const block = source.slice(start, end);
  const propsMatch = block.match(
    new RegExp(
      `^function ${JS_IDENT}\\(e\\)\\{let ${JS_IDENT}=\\(0,${JS_IDENT}\\.c\\)\\(\\d+\\),\\{([^{}]+)\\}=e,`,
    ),
  );
  const reactMatch = block.match(new RegExp(`\\(0,(${JS_IDENT})\\.useState\\)\\(null\\)`));
  const jsxMatch = block.match(new RegExp(`\\(0,(${JS_IDENT})\\.jsx\\)\\(`));
  const bridgeMatch = block.match(new RegExp(`(${JS_IDENT})\\(\`write-skill-config\`,`));
  if (propsMatch == null || reactMatch == null || jsxMatch == null || bridgeMatch == null) {
    return null;
  }

  const props = propsMatch[1];
  const propVar = (name) => props.match(new RegExp(`(?:^|,)${name}:(${JS_IDENT})(?:,|$)`))?.[1] ?? null;
  const hostIdVar = propVar("hostId");
  const skillVar = propVar("skill");
  const onUpdatedVar = propVar("onSkillsUpdated");
  if (hostIdVar == null || skillVar == null || onUpdatedVar == null) {
    return null;
  }

  const enabledMatch = block
    .slice(block.indexOf("`write-skill-config`"))
    .match(
      new RegExp(
        `,(${JS_IDENT})=(${JS_IDENT})!=null&&\\((${JS_IDENT})\\.isPending\\|\\|` +
          `${skillVar}\\.enabled!==\\2\\)\\?\\2:${skillVar}\\.enabled`,
      ),
    );
  if (enabledMatch == null) {
    return null;
  }

  return {
    block,
    bridgeVar: bridgeMatch[1],
    enabledVar: enabledMatch[1],
    end,
    hostIdVar,
    jsxVar: jsxMatch[1],
    mutationVar: enabledMatch[3],
    onUpdatedVar,
    reactVar: reactMatch[1],
    skillVar,
    start,
  };
}

function applySkillInvocationPolicyPatch(source) {
  if (source.includes(PATCH_MARKER)) {
    if (
      source.includes(`function ${COMPONENT_NAME}(`) &&
      source.includes("allowImplicitInvocation:")
    ) {
      return source;
    }
    warn("Found an incomplete existing invocation-policy marker");
    return source;
  }

  const binding = findSkillCardBinding(source);
  if (binding == null) {
    if (source.includes("skills.card.disabledBadge") || source.includes("write-skill-config")) {
      warn("Could not resolve the current Skill card component");
    }
    return source;
  }

  const {
    block,
    bridgeVar,
    enabledVar,
    hostIdVar,
    jsxVar,
    mutationVar,
    onUpdatedVar,
    reactVar,
    skillVar,
    start,
    end,
  } = binding;
  const manualButton =
    `(0,${jsxVar}.jsx)(${COMPONENT_NAME},{hostId:${hostIdVar},skill:${skillVar},` +
    `enabled:${enabledVar},isUpdating:${mutationVar}.isPending,onUpdated:${onUpdatedVar}})`;

  const headerPattern = new RegExp(
    `children:\\[(${JS_IDENT}),(${JS_IDENT})\\]`,
    "g",
  );
  const toggleBranchIndex = block.indexOf("===`toggle`");
  if (toggleBranchIndex < 0) {
    warn("Could not find the installed Skill toggle branch");
    return source;
  }
  const beforeToggle = block.slice(0, toggleBranchIndex);
  const headerMatches = [...beforeToggle.matchAll(headerPattern)];
  if (headerMatches.length !== 1) {
    warn("Could not resolve the Skill preview header actions");
    return source;
  }
  const headerNeedle = headerMatches[0][0];
  const headerReplacement = `children:[${headerMatches[0][1]},${manualButton},${headerMatches[0][2]}]`;

  const togglePattern = new RegExp(
    `\\(0,${jsxVar}\\.jsx\\)\\((${JS_IDENT}),\\{tooltipContent:` +
      `\\(0,${jsxVar}\\.jsx\\)\\((${JS_IDENT}),\\{\\.\\.\\.(${JS_IDENT})\\}\\),` +
      `children:\\(0,${jsxVar}\\.jsx\\)\\((${JS_IDENT}),\\{checked:${enabledVar},`,
  );
  const toggleMatch = block.match(togglePattern);
  if (toggleMatch == null || countOccurrences(block, toggleMatch[0]) !== 1) {
    warn("Could not resolve the installed Skill enabled control");
    return source;
  }

  let patchedBlock = replaceExactlyOnce(block, headerNeedle, headerReplacement);
  if (patchedBlock == null) {
    warn("Skill preview header action anchor was not unique");
    return source;
  }
  patchedBlock = replaceExactlyOnce(
    patchedBlock,
    toggleMatch[0],
    `${manualButton},${toggleMatch[0]}`,
  );
  if (patchedBlock == null) {
    warn("Installed Skill enabled-control anchor was not unique");
    return source;
  }

  const runtime = skillInvocationPolicyRuntimeSource({ reactVar, jsxVar, bridgeVar });
  return `${source.slice(0, start)}${runtime}${patchedBlock}${source.slice(end)}`;
}

function replacePatternExactlyOnce(source, pattern, replacement, description) {
  const matches = [...source.matchAll(new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`))];
  if (matches.length !== 1) {
    warn(`Could not resolve the current ${description} (matches: ${matches.length})`);
    return null;
  }
  return source.replace(pattern, () => replacement);
}

function findFunctionBlockContaining(source, needle) {
  const needleIndex = source.indexOf(needle);
  if (needleIndex < 0) {
    return null;
  }

  const headerPattern = new RegExp(`function (${JS_IDENT})\\(e\\)\\{`, "g");
  let header = null;
  for (const match of source.matchAll(headerPattern)) {
    if (match.index > needleIndex) {
      break;
    }
    header = match;
  }
  if (header == null) {
    return null;
  }

  const start = header.index;
  const bodyStart = start + header[0].length - 1;
  let depth = 0;
  let quote = null;
  let escaped = false;
  for (let index = bodyStart; index < source.length; index += 1) {
    const char = source[index];
    if (quote != null) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }
    if (char === "`" || char === '"' || char === "'") {
      quote = char;
    } else if (char === "{") {
      depth += 1;
    } else if (char === "}" && --depth === 0) {
      return {
        block: source.slice(start, index + 1),
        end: index + 1,
        name: header[1],
        start,
      };
    }
  }
  return null;
}

function applySkillInvocationComposerTriggerPatch(source) {
  if (source.includes(COMPOSER_TRIGGER_PATCH_MARKER)) {
    return source;
  }
  if (!source.includes("nodeBefore?.text") || !source.includes("[/@$]")) {
    return source;
  }

  const replacements = [
    [
      "/(?:^|\\s)([/@$])([\\p{L}\\p{N}\\p{M}.:_/\\\\-]*)$/u",
      `/*${COMPOSER_TRIGGER_PATCH_MARKER}*//(?:^|\\s)([/@$!])([\\p{L}\\p{N}\\p{M}.:_/\\\\-]*)$/u`,
      "composer trigger parser",
    ],
    [
      's==null||o!==`/`&&o!==`@`&&o!==`$`',
      's==null||o!==`/`&&o!==`@`&&o!==`$`&&o!==`!`',
      "composer trigger validation",
    ],
  ];

  let patched = source;
  for (const [needle, replacement, description] of replacements) {
    const next = replaceExactlyOnce(patched, needle, replacement);
    if (next == null) {
      warn(
        `Could not resolve the current ${description} (matches: ${countOccurrences(patched, needle)})`,
      );
      return source;
    }
    patched = next;
  }
  return patched;
}

function applySkillInvocationComposerRegistrationPatch(source) {
  if (source.includes(COMPOSER_REGISTRATION_PATCH_MARKER)) {
    return source;
  }
  const registrationPattern = /\$:`skill-mention`(?!,"!":`skill-mention`)/gu;
  const registrations = [...source.matchAll(registrationPattern)];
  if (registrations.length === 0) {
    return source;
  }
  let installedMarker = false;
  return source.replace(registrationPattern, () => {
    const marker = installedMarker
      ? ""
      : `/*${COMPOSER_REGISTRATION_PATCH_MARKER}*/`;
    installedMarker = true;
    return `${marker}$:\`skill-mention\`,"!":\`skill-mention\``;
  });
}

function applySkillInvocationComposerUiPatch(source) {
  if (source.includes(COMPOSER_PATCH_MARKER)) {
    return source;
  }
  if (!source.includes("composer.skillMentionList.noResults")) {
    return source;
  }

  const binding = findFunctionBlockContaining(source, "composer.skillMentionList.noResults");
  if (binding == null) {
    warn("Could not resolve the current Skill mention menu function");
    return source;
  }

  const propsMatch = binding.block.match(
    new RegExp(
      `^function ${binding.name}\\(e\\)\\{let ${JS_IDENT}=\\(0,${JS_IDENT}\\.c\\)\\(\\d+\\),\\{([^{}]+)\\}=e,`,
    ),
  );
  if (propsMatch == null) {
    warn("Could not resolve the current Skill mention menu props");
    return source;
  }
  const propVar = (name) =>
    propsMatch[1].match(new RegExp(`(?:^|,)${name}:(${JS_IDENT})(?:,|$)`))?.[1] ?? null;
  const classNameVar = propVar("className");
  const queryVar = propVar("query");
  if (classNameVar == null || queryVar == null) {
    warn("Could not resolve the current Skill mention menu query binding");
    return source;
  }

  let patchedBlock = replaceExactlyOnce(
    binding.block,
    `className:${classNameVar},query:${queryVar}`,
    `className:${classNameVar},invocationTrigger:codexLinuxInvocationTrigger,query:${queryVar}`,
  );
  if (patchedBlock == null) {
    warn("Skill mention menu invocation-trigger prop anchor was not unique");
    return source;
  }

  const skillFilterPattern = new RegExp(
    `(${JS_IDENT})\\.filter\\(e=>e\\.enabled&&(${JS_IDENT}\\(e(?:,${JS_IDENT})+\\))\\)`,
  );
  const skillFilterMatch = patchedBlock.match(skillFilterPattern);
  if (skillFilterMatch == null) {
    warn("Could not resolve the current Skill invocation-policy filter");
    return source;
  }
  patchedBlock = replacePatternExactlyOnce(
    patchedBlock,
    skillFilterPattern,
    `${skillFilterMatch[1]}.filter(e=>${COMPOSER_FILTER_NAME}(e,codexLinuxInvocationTrigger)&&${skillFilterMatch[2]})`,
    "Skill invocation-policy filter",
  );
  if (patchedBlock == null) {
    return source;
  }

  const appsPattern = new RegExp(`\\.\\.\\.(${JS_IDENT})==null\\?\\[\\]:\\1\\.map\\(e=>`);
  const appsMatch = patchedBlock.match(appsPattern);
  if (appsMatch == null) {
    warn("Could not resolve the current manual-only app exclusion");
    return source;
  }
  patchedBlock = replacePatternExactlyOnce(
    patchedBlock,
    appsPattern,
    `...codexLinuxInvocationTrigger===\`!\`?[]:${appsMatch[1]}==null?[]:${appsMatch[1]}.map(e=>`,
    "manual-only app exclusion",
  );
  if (patchedBlock == null) {
    return source;
  }

  const loadingPattern = new RegExp(
    `(${JS_IDENT})=(${JS_IDENT})\\.length===0&&\\((${JS_IDENT})\\|\\|${appsMatch[1]}==null&&(${JS_IDENT})\\.isLoading\\),`,
  );
  const loadingMatch = patchedBlock.match(loadingPattern);
  if (loadingMatch == null) {
    warn("Could not resolve the current manual-only loading state (matches: 0)");
    return source;
  }
  patchedBlock = replacePatternExactlyOnce(
    patchedBlock,
    loadingPattern,
    `${loadingMatch[1]}=${loadingMatch[2]}.length===0&&(${loadingMatch[3]}||codexLinuxInvocationTrigger!==\`!\`&&${appsMatch[1]}==null&&${loadingMatch[4]}.isLoading),`,
    "manual-only loading state",
  );
  if (patchedBlock == null) {
    return source;
  }

  let patched = `${source.slice(0, binding.start)}${skillInvocationComposerRuntimeSource()}${patchedBlock}${source.slice(binding.end)}`;
  const queryPattern = new RegExp(`let (${JS_IDENT})=(${JS_IDENT})\\.ui\\?\\.query\\?\\?\`\`,`);
  const queryMatch = patched.match(queryPattern);
  if (queryMatch == null) {
    warn("Could not resolve the current composer trigger cache dependency");
    return source;
  }
  patched = replacePatternExactlyOnce(
    patched,
    queryPattern,
    `let ${queryMatch[1]}=\`\${${queryMatch[2]}.ui?.trigger??\`$\`}\${${queryMatch[2]}.ui?.query??\`\`}\`,`,
    "composer trigger cache dependency",
  );
  if (patched == null) {
    return source;
  }

  const menuCallPattern = new RegExp(
    `\\(0,(${JS_IDENT})\\.jsx\\)\\(${binding.name},\\{className:(${JS_IDENT}),query:${queryMatch[1]},onUpdateSelectedMention:`,
  );
  const menuCallMatch = patched.match(menuCallPattern);
  if (menuCallMatch == null) {
    warn("Could not resolve the current Skill mention menu call");
    return source;
  }
  const menuCall = menuCallMatch[0];
  const patchedCall = menuCall.replace(
    `query:${queryMatch[1]}`,
    `invocationTrigger:${queryMatch[1]}[0],query:${queryMatch[1]}.slice(1)`,
  );
  const withCall = replaceExactlyOnce(patched, menuCall, patchedCall);
  if (withCall == null) {
    warn("Skill mention menu call anchor was not unique");
    return source;
  }
  return withCall;
}

function applySkillInvocationComposerPatch(source) {
  const expectsRegistration =
    !source.includes(COMPOSER_REGISTRATION_PATCH_MARKER) &&
    source.includes('$:`skill-mention`');
  const expectsTrigger = source.includes("nodeBefore?.text") && source.includes("[/@$]");
  const expectsUi = source.includes("composer.skillMentionList.noResults");
  let patched = source;

  if (expectsRegistration) {
    patched = applySkillInvocationComposerRegistrationPatch(patched);
    if (!patched.includes(COMPOSER_REGISTRATION_PATCH_MARKER)) {
      return source;
    }
  }
  if (expectsTrigger) {
    patched = applySkillInvocationComposerTriggerPatch(patched);
    if (!patched.includes(COMPOSER_TRIGGER_PATCH_MARKER)) {
      return source;
    }
  }
  if (expectsUi) {
    patched = applySkillInvocationComposerUiPatch(patched);
    if (!patched.includes(COMPOSER_PATCH_MARKER)) {
      return source;
    }
  }
  return patched;
}

const descriptors = [
  {
    id: "skill-invocation-policy-ui",
    phase: "webview-asset",
    order: 20_680,
    ciPolicy: "opt-in",
    pattern: /^plugin-detail-page-.*\.js$/,
    missingDescription: "shared plugin detail and installed Skill card webview bundle",
    skipDescription: "Skill invocation policy UI patch",
    requiredMarkers: [PATCH_MARKER],
    apply: applySkillInvocationPolicyPatch,
  },
  {
    id: "skill-invocation-policy-composer",
    phase: "webview-asset",
    order: 20_681,
    ciPolicy: "opt-in",
    pattern: /^app-initial(?:~artifact-tab-content\.electron~app-main~.*|-[A-Za-z0-9_-]+)\.js$/,
    missingDescription: "main composer trigger and Skill mention webview bundles",
    skipDescription: "manual-only Skill composer menu patch",
    requiredMarkers: [
      COMPOSER_REGISTRATION_PATCH_MARKER,
      COMPOSER_TRIGGER_PATCH_MARKER,
      COMPOSER_PATCH_MARKER,
    ],
    apply: applySkillInvocationComposerPatch,
  },
];

module.exports = {
  COMPOSER_FILTER_NAME,
  COMPOSER_PATCH_MARKER,
  COMPOSER_REGISTRATION_PATCH_MARKER,
  COMPOSER_TRIGGER_PATCH_MARKER,
  COMPONENT_NAME,
  PATCH_MARKER,
  applySkillInvocationComposerPatch,
  applySkillInvocationComposerRegistrationPatch,
  applySkillInvocationComposerTriggerPatch,
  applySkillInvocationComposerUiPatch,
  applySkillInvocationPolicyPatch,
  descriptors,
  skillInvocationComposerRuntimeSource,
  skillInvocationPolicyRuntimeSource,
};
