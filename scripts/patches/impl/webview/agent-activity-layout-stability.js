"use strict";

const { findMatchingBrace } = require("../../lib/minified-js.js");

const AGENT_ACTIVITY_LAYOUT_MARKER =
  "codexLinuxAgentActivityDiscreteDisclosure";

const INITIAL_STATE_PATTERN =
  /([A-Za-z_$][\w$]*)=\(\)=>([A-Za-z_$][\w$]*)\?([A-Za-z_$][\w$]*)\?`expanded`:([A-Za-z_$][\w$]*)(?:&&typeof ([A-Za-z_$][\w$]*)!=`function`)?\?`closing`:`collapsed`:`collapsed`/u;
const DISCLOSURE_STATE_PATTERN =
  /let\[([A-Za-z_$][\w$]*),([A-Za-z_$][\w$]*)\]=\(0,[A-Za-z_$][\w$]*\.useState\)\(([A-Za-z_$][\w$]*)\),([A-Za-z_$][\w$]*)=\1===`opening`\|\|\1===`expanded`,([A-Za-z_$][\w$]*)=\1===`expanded`/u;
const TOGGLE_HANDLER_PATTERN =
  /([A-Za-z_$][\w$]*)=\(\)=>\{if\(([A-Za-z_$][\w$]*)\)\{([A-Za-z_$][\w$]*)\(`closing`\);return\}if\(([A-Za-z_$][\w$]*)\?\.\(\),([A-Za-z_$][\w$]*)===`closing`\)\{\3\(`expanded`\);return\}\3\(`opening`\),requestAnimationFrame\(\(\)=>\{\3\(([A-Za-z_$][\w$]*)\)\}\)\}/u;
const MOTION_BODY_PATTERN =
  /([A-Za-z_$][\w$]*)=([A-Za-z_$][\w$]*)&&([A-Za-z_$][\w$]*)!==`collapsed`\?\(0,([A-Za-z_$][\w$]*)\.jsx\)\(([A-Za-z_$][\w$]*)\.div,\{initial:!1,animate:([A-Za-z_$][\w$]*)\?\{opacity:1,height:`auto`\}:\{opacity:0,height:0\},transition:[A-Za-z_$][\w$]*,style:\{overflow:`hidden`,pointerEvents:([A-Za-z_$][\w$]*)\?`auto`:`none`\},onAnimationComplete:\(\)=>\{([A-Za-z_$][\w$]*)\(([A-Za-z_$][\w$]*)\)\},children:(?:typeof ([A-Za-z_$][\w$]*)==`function`\?\10\(\):\10|([A-Za-z_$][\w$]*))\}\):null/u;

const INSTALLED_INITIAL_STATE_PATTERN =
  /=\(\)=>[A-Za-z_$][\w$]*&&[A-Za-z_$][\w$]*\?`expanded`:`collapsed`/gu;
const INSTALLED_TOGGLE_PATTERN =
  /=\(\)=>\{if\([A-Za-z_$][\w$]*\)\{[A-Za-z_$][\w$]*\(`collapsed`\);return\}[A-Za-z_$][\w$]*\?\.\(\),[A-Za-z_$][\w$]*\(`expanded`\)\}/gu;
const INSTALLED_BODY_PATTERN =
  /=[A-Za-z_$][\w$]*&&[A-Za-z_$][\w$]*\?\(0,[A-Za-z_$][\w$]*\.jsx\)\(`div`,\{style:\{overflow:`hidden`\},children:(?:typeof ([A-Za-z_$][\w$]*)==`function`\?\1\(\):\1|([A-Za-z_$][\w$]*))\}\):null/gu;

function hasInstalledAgentActivityLayout(source) {
  return source.split(AGENT_ACTIVITY_LAYOUT_MARKER).length - 1 === 1 &&
    [...source.matchAll(INSTALLED_INITIAL_STATE_PATTERN)].length === 1 &&
    [...source.matchAll(INSTALLED_TOGGLE_PATTERN)].length === 1 &&
    [...source.matchAll(INSTALLED_BODY_PATTERN)].length === 1 &&
    findAgentActivityDisclosureComponents(source).length === 0;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function findDisclosurePropertyAliases(componentText, parameter) {
  const destructuringPattern = new RegExp(
    `\\{([^{}]*)\\}=${escapeRegExp(parameter)}(?:,|;)`,
    "gu",
  );
  const requiredProperties = [
    "summaryTransition",
    "shouldAnimateInitialCollapse",
    "canExpand",
    "defaultExpanded",
    "onExpand",
    "children",
  ];

  for (const match of componentText.matchAll(destructuringPattern)) {
    const entries = match[1];
    const aliases = {};
    let complete = true;
    for (const property of requiredProperties) {
      const propertyMatch = new RegExp(
        `(?:^|,)${property}:([A-Za-z_$][\\w$]*)(?=,|$)`,
        "u",
      ).exec(entries);
      if (propertyMatch == null) {
        complete = false;
        break;
      }
      aliases[property] = propertyMatch[1];
    }
    if (complete) return aliases;
  }
  return null;
}

function hasCoherentDisclosureContract(componentText, parameter) {
  const aliases = findDisclosurePropertyAliases(componentText, parameter);
  const initial = INITIAL_STATE_PATTERN.exec(componentText);
  const state = DISCLOSURE_STATE_PATTERN.exec(componentText);
  const toggle = TOGGLE_HANDLER_PATTERN.exec(componentText);
  const body = MOTION_BODY_PATTERN.exec(componentText);
  if (aliases == null || initial == null || state == null || toggle == null || body == null) {
    return false;
  }

  const effectiveCanExpand = initial[2];
  const effectiveDefaultExpanded = initial[3];
  const canExpandDefaults = [
    `${effectiveCanExpand}=${aliases.canExpand}===void 0?!0:${aliases.canExpand}`,
    `${effectiveCanExpand}=${aliases.canExpand}===void 0||${aliases.canExpand}`,
  ];
  const expandedDefaults = [
    `${effectiveDefaultExpanded}=${aliases.defaultExpanded}===void 0?!1:${aliases.defaultExpanded}`,
    `${effectiveDefaultExpanded}=${aliases.defaultExpanded}!==void 0&&${aliases.defaultExpanded}`,
  ];

  return (
    canExpandDefaults.some((candidate) => componentText.includes(candidate)) &&
    expandedDefaults.some((candidate) => componentText.includes(candidate)) &&
    initial[4] === aliases.shouldAnimateInitialCollapse &&
    (initial[5] == null || initial[5] === aliases.children) &&
    state[3] === initial[1] &&
    toggle[2] === state[4] &&
    toggle[3] === state[2] &&
    toggle[4] === aliases.onExpand &&
    toggle[5] === state[1] &&
    body[2] === effectiveCanExpand &&
    body[3] === state[1] &&
    body[6] === state[5] &&
    body[7] === state[5] &&
    body[8] === state[2] &&
    (body[10] ?? body[11]) === aliases.children
  );
}

function findAgentActivityDisclosureComponents(source) {
  const candidates = [];
  const functionPattern =
    /function ([A-Za-z_$][\w$]*)\(([A-Za-z_$][\w$]*)\)\{(?=[\s\S]{0,768}?summaryTransition)/gu;
  let match;
  while ((match = functionPattern.exec(source)) != null) {
    const openBrace = match.index + match[0].length - 1;
    const closeBrace = findMatchingBrace(source, openBrace);
    if (closeBrace === -1) continue;
    const text = source.slice(match.index, closeBrace + 1);
    if (
      text.includes("summaryTransition") &&
      text.includes("shouldAnimateInitialCollapse") &&
      text.includes("canExpand") &&
      hasCoherentDisclosureContract(text, match[2])
    ) {
      candidates.push({
        name: match[1],
        start: match.index,
        end: closeBrace + 1,
        text,
      });
    }
  }
  return candidates;
}

function isAgentActivityLayoutAsset(source) {
  if (source.includes(AGENT_ACTIVITY_LAYOUT_MARKER)) {
    return hasInstalledAgentActivityLayout(source);
  }
  return findAgentActivityDisclosureComponents(source).length === 1;
}

function hasUnsafeAgentActivityLayout(source) {
  return findAgentActivityDisclosureComponents(source).length > 0;
}

function replaceUnique(source, pattern, replacement, description) {
  const matches = [
    ...source.matchAll(new RegExp(pattern.source, `${pattern.flags}g`)),
  ];
  if (matches.length !== 1) {
    throw new Error(`Could not find unique ${description}`);
  }
  return source.replace(pattern, replacement);
}

function applyLinuxAgentActivityLayoutStabilityPatch(source) {
  if (source.includes(AGENT_ACTIVITY_LAYOUT_MARKER)) {
    if (hasInstalledAgentActivityLayout(source)) return source;
    throw new Error("Found partial agent activity layout stability markers");
  }

  const candidates = findAgentActivityDisclosureComponents(source);
  if (candidates.length !== 1) {
    throw new Error("Could not find unique agent activity disclosure component");
  }

  const component = candidates[0];
  let patchedComponent = replaceUnique(
    component.text,
    INITIAL_STATE_PATTERN,
    (_match, initializer, canExpand, defaultExpanded, _shouldAnimate) =>
      `${initializer}=()=>${canExpand}&&${defaultExpanded}?\`expanded\`:\`collapsed\``,
    "agent activity initial disclosure state",
  );
  patchedComponent = replaceUnique(
    patchedComponent,
    TOGGLE_HANDLER_PATTERN,
    (_match, handler, expanded, setter, onExpand) =>
      `${handler}=()=>{if(${expanded}){${setter}(\`collapsed\`);return}${onExpand}?.(),${setter}(\`expanded\`)}`,
    "agent activity disclosure toggle handler",
  );
  patchedComponent = replaceUnique(
    patchedComponent,
    MOTION_BODY_PATTERN,
    (
      _match,
      body,
      canExpand,
      _state,
      jsxRuntime,
      _motion,
      expanded,
      pointerEventsExpanded,
      _setter,
      _completion,
      lazyChildren,
      directChildren,
    ) => {
      if (expanded !== pointerEventsExpanded) {
        throw new Error(
          "Agent activity disclosure animation and pointer-event states diverged",
        );
      }
      const children = lazyChildren ?? directChildren;
      const renderedChildren = lazyChildren == null
        ? children
        : `typeof ${children}==\`function\`?${children}():${children}`;
      return `${body}=${canExpand}&&${expanded}?(0,${jsxRuntime}.jsx)(\`div\`,{style:{overflow:\`hidden\`},children:${renderedChildren}}):null`;
    },
    "agent activity disclosure motion body",
  );

  const remainingLayoutAnimationParts = [
    ["height-auto", "height:`auto`"],
    ["animation-frame", "requestAnimationFrame"],
    ["animation-complete", "onAnimationComplete"],
  ]
    .filter(([, needle]) => patchedComponent.includes(needle))
    .map(([name]) => name);
  if (remainingLayoutAnimationParts.length > 0) {
    throw new Error(
      `Agent activity disclosure still contains layout animation parts: ${remainingLayoutAnimationParts.join(", ")}`,
    );
  }

  const marker = `void\`${AGENT_ACTIVITY_LAYOUT_MARKER}\`;`;
  return (
    source.slice(0, component.start) +
    marker +
    patchedComponent +
    source.slice(component.end)
  );
}

module.exports = {
  AGENT_ACTIVITY_LAYOUT_MARKER,
  applyLinuxAgentActivityLayoutStabilityPatch,
  hasUnsafeAgentActivityLayout,
  isAgentActivityLayoutAsset,
};
