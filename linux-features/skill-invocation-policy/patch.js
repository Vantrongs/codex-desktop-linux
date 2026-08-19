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

function skillInvocationPolicyRuntimeSource({
  reactVar,
  jsxVar,
  bridgeVar,
  requestClientProp = false,
}) {
  const requestTarget = requestClientProp ? "b.sendRequest" : bridgeVar;
  const requestMethod = requestClientProp
    ? "skills/config/write"
    : "write-skill-config";
  const hostPayload = requestClientProp ? "" : "hostId:t,";
  return [
    `const ${PATCH_MARKER}=!0,` +
      `codexLinuxSkillInvocationPolicyValues=new Map,` +
      `codexLinuxSkillInvocationPolicyListeners=new Map;`,
    `function codexLinuxSkillInvocationPolicyKey(e,t){let n=t?.name?.includes(\`:\`)?t.name:t?.path??t?.name??\`unknown\`;return String(e??\`local\`)+\`:\`+String(n)}`,
    `function codexLinuxBroadcastSkillInvocationPolicy(e,t){for(let n of codexLinuxSkillInvocationPolicyListeners.get(e)??[])n(t)}`,
    `function codexLinuxPublishSkillInvocationPolicy(e,t,n){codexLinuxSkillInvocationPolicyValues.set(e,{value:t,observedMetadata:n}),codexLinuxBroadcastSkillInvocationPolicy(e,t)}`,
    `function ${COMPONENT_NAME}(e){let{hostId:t,skill:n,enabled:r,isUpdating:i,onUpdated:a${requestClientProp ? ",requestClient:b" : ""}}=e,o=codexLinuxSkillInvocationPolicyKey(t,n),s=n?.allowImplicitInvocation!==!1,[c,l]=(0,${reactVar}.useState)(()=>codexLinuxSkillInvocationPolicyValues.get(o)?.value??s),[u,d]=(0,${reactVar}.useState)(!1),[f,p]=(0,${reactVar}.useState)(null);(0,${reactVar}.useEffect)(()=>{let e=codexLinuxSkillInvocationPolicyListeners.get(o);e||(e=new Set,codexLinuxSkillInvocationPolicyListeners.set(o,e)),e.add(l);let t=codexLinuxSkillInvocationPolicyValues.get(o);return t==null?l(s):s!==t.observedMetadata&&(codexLinuxSkillInvocationPolicyValues.delete(o),codexLinuxBroadcastSkillInvocationPolicy(o,s)),()=>{e.delete(l),e.size===0&&codexLinuxSkillInvocationPolicyListeners.delete(o)}},[o,s]);if(n?.path==null)return null;let m=c===!1,h=u||i,g=h?\`Updating skill invocation policy\`:f??(m?\`Manual only — invoke with !\${n?.name??\`skill\`}; the model will not choose it automatically\`:\`Allow only manual invocation\`),y=m?\`Manual only: \${n?.name??\`skill\`}\`:\`Automatic skill selection allowed: \${n?.name??\`skill\`}\`;return(0,${jsxVar}.jsx)(\`button\`,{type:\`button\`,title:g,\"aria-label\":y,\"aria-pressed\":m,disabled:!r||h,className:\`h-token-button-composer min-w-7 rounded-md border border-token-border-default bg-transparent px-2 text-xs font-semibold text-token-text-secondary focus-visible:opacity-100 \${m?\`opacity-100\`:\`opacity-50 hover:opacity-100\`}\`,onClick:async e=>{e.preventDefault(),e.stopPropagation();if(!r||h)return;d(!0),p(null);let i=!c;try{let e=await ${requestTarget}(\`${requestMethod}\`,n?.name?.includes(\`:\`)?{${hostPayload}name:n.name,enabled:r,allowImplicitInvocation:i}:{${hostPayload}path:n?.path,enabled:r,allowImplicitInvocation:i});if(e?.success===!1)throw Error(\`Skill invocation policy update failed\`);codexLinuxPublishSkillInvocationPolicy(o,i,s),a?.(!0)}catch(e){p(\`Failed to update skill invocation policy\`)}finally{d(!1)}},children:m?\`!\`:\`A\`})}`,
  ].join("");
}

function findLegacySkillCardBinding(source) {
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

function findCurrentSkillCardBinding(source) {
  const binding = findFunctionBlockContaining(source, "`skills/config/write`");
  if (binding == null) return null;
  const { block } = binding;
  const propsMatch = block.match(
    new RegExp(
      `^function ${binding.name}\\(e\\)\\{let ${JS_IDENT}=\\(0,${JS_IDENT}\\.c\\)\\(\\d+\\),\\{([^{}]+)\\}=e,`,
    ),
  );
  if (propsMatch == null) return null;
  const propVar = (name) =>
    propsMatch[1].match(new RegExp(`(?:^|,)${name}:(${JS_IDENT})(?:,|$)`))?.[1] ?? null;
  const hostIdVar = propVar("hostId");
  const skillVar = propVar("skill");
  const onUpdatedVar = propVar("onSkillsUpdated");
  const reactVar = block.match(new RegExp(`\\(0,(${JS_IDENT})\\.useState\\)\\(null\\)`))?.[1];
  const jsxVar = block.match(new RegExp(`\\(0,(${JS_IDENT})\\.jsx\\)\\(`))?.[1];
  if (
    hostIdVar == null || skillVar == null || onUpdatedVar == null ||
    reactVar == null || jsxVar == null
  ) return null;

  const requestMatch = block.match(
    new RegExp(
      `(${JS_IDENT})\\((${JS_IDENT}),${hostIdVar}\\)\\.sendRequest` +
        "\\(`skills/config/write`,",
    ),
  );
  const enabledMatch = block.match(
    new RegExp(
      `(${JS_IDENT})=(${JS_IDENT})!=null&&\\((${JS_IDENT})\\.isPending\\|\\|` +
        `${skillVar}\\.enabled!==\\2\\)\\?\\2:${skillVar}\\.enabled`,
    ),
  );
  if (requestMatch == null || enabledMatch == null) return null;

  const modalAnchor = block.match(
    new RegExp(
      `${JS_IDENT}=e=>\\{let\\{closePreview:${JS_IDENT}\\}=e;` +
        `return\\(0,${jsxVar}\\.jsxs\\)\\(` + "`div`" + `,\\{` +
        "className:`flex items-center gap-2`,children:\\[",
    ),
  )?.[0] ?? null;
  const cardAnchor = block.match(
    new RegExp(
      `${JS_IDENT}===` + "`toggle`" + `\\?e=>\\{` +
        `let\\{ignoreNextPreview:${JS_IDENT},openPreview:${JS_IDENT}\\}=e;` +
        `return\\(0,${jsxVar}\\.jsxs\\)\\(` + "`div`" + `,\\{` +
        "className:`flex items-center gap-2`,children:\\[",
    ),
  )?.[0] ?? null;
  if (modalAnchor == null || cardAnchor == null) return null;

  return {
    block,
    enabledVar: enabledMatch[1],
    end: binding.end,
    hostIdVar,
    insertionAnchors: [modalAnchor, cardAnchor],
    jsxVar,
    mutationVar: enabledMatch[3],
    onUpdatedVar,
    reactVar,
    requestClientExpression: `${requestMatch[1]}(${requestMatch[2]},${hostIdVar})`,
    skillVar,
    start: binding.start,
  };
}

function findSkillCardBinding(source) {
  return findLegacySkillCardBinding(source) ?? findCurrentSkillCardBinding(source);
}

function applySkillInvocationPolicyPatch(source) {
  if (source.includes(PATCH_MARKER)) {
    if (hasInstalledSkillInvocationPolicy(source)) {
      return source;
    }
    throw new Error("Found an incomplete existing invocation-policy marker");
  }

  const binding = findSkillCardBinding(source);
  if (binding == null) {
    throw new Error("Could not resolve the current Skill card component");
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
    requestClientExpression,
    skillVar,
    start,
    end,
  } = binding;
  const manualButton =
    `(0,${jsxVar}.jsx)(${COMPONENT_NAME},{hostId:${hostIdVar},skill:${skillVar},` +
    `enabled:${enabledVar},isUpdating:${mutationVar}.isPending,onUpdated:${onUpdatedVar}` +
    `${requestClientExpression == null ? "" : `,requestClient:${requestClientExpression}`}})`;

  if (binding.insertionAnchors != null) {
    let patchedBlock = block;
    for (const anchor of binding.insertionAnchors) {
      patchedBlock = replaceExactlyOnce(
        patchedBlock,
        anchor,
        `${anchor}${manualButton},`,
      );
      if (patchedBlock == null) {
        throw new Error("Current Skill policy action anchor was not unique");
      }
    }
    const runtime = skillInvocationPolicyRuntimeSource({
      reactVar,
      jsxVar,
      requestClientProp: true,
    });
    return `${source.slice(0, start)}${runtime}${patchedBlock}${source.slice(end)}`;
  }

  const headerPattern = new RegExp(
    `children:\\[(${JS_IDENT}),(${JS_IDENT})\\]`,
    "g",
  );
  const toggleBranchIndex = block.indexOf("===`toggle`");
  if (toggleBranchIndex < 0) {
    throw new Error("Could not find the installed Skill toggle branch");
  }
  const beforeToggle = block.slice(0, toggleBranchIndex);
  const headerMatches = [...beforeToggle.matchAll(headerPattern)];
  if (headerMatches.length !== 1) {
    throw new Error("Could not resolve the Skill preview header actions");
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
    throw new Error("Could not resolve the installed Skill enabled control");
  }

  let patchedBlock = replaceExactlyOnce(block, headerNeedle, headerReplacement);
  if (patchedBlock == null) {
    throw new Error("Skill preview header action anchor was not unique");
  }
  patchedBlock = replaceExactlyOnce(
    patchedBlock,
    toggleMatch[0],
    `${manualButton},${toggleMatch[0]}`,
  );
  if (patchedBlock == null) {
    throw new Error("Installed Skill enabled-control anchor was not unique");
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

function hasInstalledSkillInvocationPolicy(source) {
  const componentBinding = findFunctionBlockContaining(
    source,
    `function ${COMPONENT_NAME}(`,
  );
  if (componentBinding == null || componentBinding.name !== COMPONENT_NAME) {
    return false;
  }
  const component = componentBinding.block;
  const bridgeVar = component.match(
    new RegExp("(" + JS_IDENT + ")\\(`write-skill-config`,", "u"),
  )?.[1];
  const requestClientVar = component.match(
    new RegExp(`requestClient:(${JS_IDENT})`, "u"),
  )?.[1];
  const jsxVar = component.match(
    new RegExp(`\\(0,(${JS_IDENT})\\.jsx\\)\\(`, "u"),
  )?.[1];
  const reactVar = component.match(
    new RegExp(`\\(0,(${JS_IDENT})\\.useState\\)\\(`, "u"),
  )?.[1];
  if ((bridgeVar == null) === (requestClientVar == null) || jsxVar == null || reactVar == null) {
    return false;
  }
  const runtime = skillInvocationPolicyRuntimeSource({
    bridgeVar,
    jsxVar,
    reactVar,
    requestClientProp: requestClientVar != null,
  });
  const callPattern = new RegExp(
    `\\(0,${JS_IDENT}\\.jsx\\)\\(${COMPONENT_NAME},\\{hostId:${JS_IDENT},` +
      `skill:${JS_IDENT},enabled:${JS_IDENT},isUpdating:${JS_IDENT}\\.isPending,` +
      `onUpdated:${JS_IDENT}` +
      `${requestClientVar == null ? "" : `,requestClient:${JS_IDENT}\\(${JS_IDENT},${JS_IDENT}\\)`}` +
      `\\}\\)`,
    "gu",
  );
  const calls = [...source.matchAll(callPattern)].map((match) => match[0]);
  return countOccurrences(source, PATCH_MARKER) === 1 &&
    source.includes(runtime) &&
    calls.length === 2 &&
    calls[0] === calls[1];
}

function hasInstalledSkillInvocationRegistration(source) {
  const unpatchedRegistration = /\$:`skill-mention`(?!,"!":`skill-mention`)/gu;
  return countOccurrences(source, COMPOSER_REGISTRATION_PATCH_MARKER) === 1 &&
    countOccurrences(source, '$:`skill-mention`,"!":`skill-mention`') > 0 &&
    [...source.matchAll(unpatchedRegistration)].length === 0;
}

function hasInstalledSkillInvocationTrigger(source) {
  const installedValidation = new RegExp(
    `(${JS_IDENT})!==` + "`\\$`(?:&&\\1!==`>`)?&&\\1!==`!`",
    "u",
  );
  return countOccurrences(source, COMPOSER_TRIGGER_PATCH_MARKER) === 1 &&
    (source.includes("([/@$!])") || source.includes("([/@$>!])")) &&
    installedValidation.test(source) &&
    !source.includes("([/@$])") &&
    !source.includes("([/@$>])");
}

function hasInstalledSkillInvocationComposerUi(source) {
  if (
    countOccurrences(source, COMPOSER_PATCH_MARKER) !== 1 ||
    !source.includes(skillInvocationComposerRuntimeSource()) ||
    !source.includes(`${COMPOSER_FILTER_NAME}(e,codexLinuxInvocationTrigger)`) ||
    !source.includes("codexLinuxInvocationTrigger===`!`?[]:")
  ) {
    return false;
  }
  const binding = findFunctionBlockContaining(
    source,
    "composer.skillMentionList.noResults",
  );
  if (
    binding == null ||
    !binding.block.includes("invocationTrigger:codexLinuxInvocationTrigger")
  ) {
    return false;
  }
  const menuCallPattern = new RegExp(
    `\\(0,${JS_IDENT}\\.jsx\\)\\(${binding.name},\\{([\\s\\S]{0,800}?)onUpdateSelectedMention:`,
    "gu",
  );
  const menuCalls = [...source.matchAll(menuCallPattern)];
  const mainCallPattern = new RegExp(
    `invocationTrigger:(${JS_IDENT})\\[0\\],query:\\1\\.slice\\(1\\)`,
    "u",
  );
  const alternateCallPattern = new RegExp(
    "invocationTrigger:(" + JS_IDENT + ")\\.ui\\?\\.trigger\\?\\?`\\$`," +
      "query:\\1\\.ui\\?\\.query\\?\\?``",
    "u",
  );
  return menuCalls.length > 0 &&
    menuCalls.some((match) => mainCallPattern.test(match[1])) &&
    menuCalls.every((match) =>
      mainCallPattern.test(match[1]) || alternateCallPattern.test(match[1])
    );
}

function applySkillInvocationComposerTriggerPatch(source) {
  if (source.includes(COMPOSER_TRIGGER_PATCH_MARKER)) {
    if (hasInstalledSkillInvocationTrigger(source)) {
      return source;
    }
    throw new Error("Found partial manual Skill trigger parser markers");
  }
  if (
    !source.includes("nodeBefore?.text") ||
    (!source.includes("[/@$]") && !source.includes("[/@$>]"))
  ) {
    return source;
  }

  const hasBrowserTrigger = source.includes("[/@$>]");
  const triggerChars = hasBrowserTrigger ? "/@$>" : "/@$";
  const replacements = [
    [
      `/(?:^|\\s)([${triggerChars}])([\\p{L}\\p{N}\\p{M}.:_/\\\\-]*)$/u`,
      `/*${COMPOSER_TRIGGER_PATCH_MARKER}*//(?:^|\\s)([${triggerChars}!])([\\p{L}\\p{N}\\p{M}.:_/\\\\-]*)$/u`,
      "composer trigger parser",
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
  const validationPattern = new RegExp(
    `(${JS_IDENT})==null\\|\\|(${JS_IDENT})!==` + "`/`&&\\2!==`@`&&" +
      `\\2!==` + "`\\$`" + (hasBrowserTrigger ? "&&\\2!==`>`" : ""),
    "u",
  );
  const validationMatches = [...patched.matchAll(new RegExp(validationPattern.source, "gu"))];
  if (validationMatches.length !== 1) {
    warn(`Could not resolve the current composer trigger validation (matches: ${validationMatches.length})`);
    return source;
  }
  patched = patched.replace(
    validationPattern,
    () => `${validationMatches[0][0]}&&${validationMatches[0][2]}!==\`!\``,
  );
  return patched;
}

function applySkillInvocationComposerRegistrationPatch(source) {
  if (source.includes(COMPOSER_REGISTRATION_PATCH_MARKER)) {
    if (hasInstalledSkillInvocationRegistration(source)) {
      return source;
    }
    throw new Error("Found partial manual Skill trigger registration markers");
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
    if (hasInstalledSkillInvocationComposerUi(source)) {
      return source;
    }
    throw new Error("Found partial manual Skill composer policy markers");
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
  const alternateMenuCallPattern = new RegExp(
    `(\\(0,${JS_IDENT}\\.jsx\\)\\(${binding.name},\\{className:[^,]+,)` +
      `query:(${JS_IDENT})\\.ui\\?\\.query\\?\\?\`\``,
    "gu",
  );
  return withCall.replace(
    alternateMenuCallPattern,
    (_match, prefix, suggestionsVar) =>
      `${prefix}invocationTrigger:${suggestionsVar}.ui?.trigger??\`$\`,` +
      `query:${suggestionsVar}.ui?.query??\`\``,
  );
}

function applySkillInvocationComposerPatch(source) {
  const expectsRegistration =
    !source.includes(COMPOSER_REGISTRATION_PATCH_MARKER) &&
    source.includes('$:`skill-mention`');
  const expectsTrigger = source.includes("nodeBefore?.text") && source.includes("[/@$]");
  const expectsCurrentTrigger =
    source.includes("nodeBefore?.text") && source.includes("[/@$>]");
  const expectsUi = source.includes("composer.skillMentionList.noResults");
  let patched = source;

  if (expectsRegistration) {
    patched = applySkillInvocationComposerRegistrationPatch(patched);
    if (!patched.includes(COMPOSER_REGISTRATION_PATCH_MARKER)) {
      throw new Error("Could not install manual Skill trigger registration");
    }
  }
  if (expectsTrigger || expectsCurrentTrigger) {
    patched = applySkillInvocationComposerTriggerPatch(patched);
    if (!patched.includes(COMPOSER_TRIGGER_PATCH_MARKER)) {
      throw new Error("Could not install manual Skill trigger parser");
    }
  }
  if (expectsUi) {
    patched = applySkillInvocationComposerUiPatch(patched);
    if (!patched.includes(COMPOSER_PATCH_MARKER)) {
      throw new Error("Could not install manual Skill composer policy");
    }
  }
  return patched;
}

function applySkillInvocationRegistrationUiPatch(source) {
  let patched = applySkillInvocationComposerRegistrationPatch(source);
  if (!patched.includes(COMPOSER_REGISTRATION_PATCH_MARKER)) {
    throw new Error("Could not install manual Skill trigger registration");
  }
  patched = applySkillInvocationComposerUiPatch(patched);
  if (!patched.includes(COMPOSER_PATCH_MARKER)) {
    throw new Error("Could not install manual Skill composer policy");
  }
  return patched;
}

function applySkillInvocationTriggerAssetPatch(source) {
  const patched = applySkillInvocationComposerTriggerPatch(source);
  if (!patched.includes(COMPOSER_TRIGGER_PATCH_MARKER)) {
    throw new Error("Could not install manual Skill trigger parser");
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
    assetMatch: (source) =>
      source.includes("`write-skill-config`") ||
      source.includes("`skills/config/write`"),
    missingDescription: "shared plugin detail and installed Skill card webview bundle",
    skipDescription: "Skill invocation policy UI patch",
    requiredMarkers: [PATCH_MARKER],
    apply: applySkillInvocationPolicyPatch,
  },
  {
    id: "skill-invocation-policy-composer-ui",
    phase: "webview-asset",
    order: 20_681,
    ciPolicy: "opt-in",
    pattern: /^app-initial(?:~artifact-tab-content\.electron~app-main~.*|-[A-Za-z0-9_-]+)\.js$/,
    assetMatch: (source) =>
      source.includes('$:`skill-mention`') &&
      source.includes("composer.skillMentionList.noResults"),
    missingDescription: "Skill trigger registration and mention-menu webview bundle",
    skipDescription: "manual-only Skill composer menu and registration patch",
    requiredMarkers: [
      COMPOSER_REGISTRATION_PATCH_MARKER,
      COMPOSER_PATCH_MARKER,
    ],
    apply: applySkillInvocationRegistrationUiPatch,
  },
  {
    id: "skill-invocation-policy-composer-trigger",
    phase: "webview-asset",
    order: 20_682,
    ciPolicy: "opt-in",
    pattern: /^app-initial(?:~artifact-tab-content\.electron~app-main~.*|-[A-Za-z0-9_-]+)\.js$/,
    assetMatch: (source) =>
      source.includes("nodeBefore?.text") &&
      (source.includes("[/@$]") || source.includes("[/@$>]")),
    missingDescription: "Skill composer trigger-parser webview bundle",
    skipDescription: "manual-only Skill composer trigger parser patch",
    requiredMarkers: [COMPOSER_TRIGGER_PATCH_MARKER],
    apply: applySkillInvocationTriggerAssetPatch,
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
  applySkillInvocationRegistrationUiPatch,
  applySkillInvocationTriggerAssetPatch,
  applySkillInvocationComposerRegistrationPatch,
  applySkillInvocationComposerTriggerPatch,
  applySkillInvocationComposerUiPatch,
  applySkillInvocationPolicyPatch,
  descriptors,
  hasInstalledSkillInvocationComposerUi,
  hasInstalledSkillInvocationPolicy,
  hasInstalledSkillInvocationRegistration,
  hasInstalledSkillInvocationTrigger,
  skillInvocationComposerRuntimeSource,
  skillInvocationPolicyRuntimeSource,
};
