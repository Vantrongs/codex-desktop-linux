"use strict";

const JS_IDENT = "[A-Za-z_$][\\w$]*";
const PATCH_MARKER = "codexLinuxGitPluginUpdateV1";
const COMPONENT_NAME = "codexLinuxGitPluginUpdateButton";
const PARENT_BUSY_STATE = "codexLinuxGitPluginUpdateBusyV1";
const PARENT_BUSY_SETTER = "setCodexLinuxGitPluginUpdateBusyV1";

function warn(message) {
  console.warn(`WARN: ${message} - skipping Git plugin update button patch`);
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

function pluginUpdateRuntimeSource({ bridgeVar, jsxVar, reactVar }) {
  return [
    `const ${PATCH_MARKER}=!0;`,
    `function ${COMPONENT_NAME}(e){let{hostId:t,installed:n,isBusy:r,marketplaceName:i,marketplacePath:a,pluginName:o,pluginSource:s,onBusyChange:k,onUpdated:c}=e,l=s?.source??s?.type,u=l===\`git\`||l===\`git-subdir\`,[d,f]=(0,${reactVar}.useState)(null),[p,m]=(0,${reactVar}.useState)(!1),[h,g]=(0,${reactVar}.useState)(null),y=(0,${reactVar}.useRef)(!1);(0,${reactVar}.useEffect)(()=>{if(n!==!0||!u)return f(!1),()=>{};let e=!1;return f(null),${bridgeVar}(\`read-config-for-host\`,{hostId:t,includeLayers:!1,cwd:null}).then(t=>{let n=t?.config?.marketplaces?.[i];e||f(n?.source_type===\`git\`||n?.sourceType===\`git\`)}).catch(()=>{e||f(!1)}),()=>{e=!0}},[t,n,i,u]);if(n!==!0||!u||a==null||o==null)return null;let b=(globalThis.document?.documentElement?.lang??globalThis.navigator?.language??\`en\`).toLowerCase().startsWith(\`ru\`),x=p?b?\`Обновление…\`:\`Updating…\`:h===\`failed\`?b?\`Ошибка обновления\`:\`Update failed\`:h===\`refresh-failed\`?b?\`Обновлено · Повторить\`:\`Updated · Retry refresh\`:h===\`updated\`?b?\`Обновлено\`:\`Updated\`:b?\`Обновить\`:\`Update\`,S=h===\`failed\`?b?\`Не удалось обновить плагин\`:\`Failed to update plugin\`:h===\`refresh-failed\`?b?\`Плагин обновлён; повторить обновление данных\`:\`Plugin updated; retry data refresh\`:b?\`Обновить плагин из Git\`:\`Update plugin from Git\`,C=d==null;return(0,${jsxVar}.jsx)(\`button\`,{type:\`button\`,className:\`h-token-button-composer min-w-20 rounded-md border border-token-border-default bg-transparent px-3 text-sm font-medium text-token-text-secondary hover:bg-token-bg-secondary\`,disabled:p||r||C,title:S,\"aria-label\":S,onClick:async e=>{e.preventDefault(),e.stopPropagation();if(y.current||r||C)return;if(y.current=!0,m(!0),h===\`refresh-failed\`){try{await c?.(),g(\`updated\`)}catch{g(\`refresh-failed\`)}finally{y.current=!1,m(!1)}return}g(null),k?.(!0);try{if(d===!0){let e=await ${bridgeVar}(\`upgrade-marketplaces\`,{hostId:t,marketplaceName:i});if(e?.errors?.length>0)throw Error(\`Git marketplace upgrade failed\`)}await ${bridgeVar}(\`install-plugin\`,{hostId:t,marketplacePath:a,pluginName:o}),g(\`updated\`);try{await c?.()}catch{g(\`refresh-failed\`)}}catch(e){g(\`failed\`)}finally{y.current=!1,m(!1),k?.(!1)}},children:x})}`,
  ].join("");
}

function findPluginDetailBinding(source) {
  const headerPattern = new RegExp(
    `function (${JS_IDENT})\\(\\{hostId:(${JS_IDENT}),pluginName:(${JS_IDENT}),` +
      `marketplacePath:(${JS_IDENT}),[^}]*\\}=\\{\\}\\)\\{`,
  );
  const header = source.match(headerPattern);
  if (header == null || header.index == null) {
    return null;
  }

  const start = header.index;
  const endMarker = source.indexOf("}function ", start + header[0].length);
  if (endMarker < 0) {
    return null;
  }
  const end = endMarker + 1;
  const block = source.slice(start, end);
  if (!block.includes("plugin-summary") && !block.includes("summary.installed")) {
    return null;
  }

  const reactMatch = block.match(new RegExp(`\\(0,(${JS_IDENT})\\.useState\\)\\(!1\\)`));
  const jsxMatch = block.match(new RegExp(`\\(0,(${JS_IDENT})\\.jsx\\)\\((${JS_IDENT}),\\{blockedReason:`));
  const bridgeMatch = source.match(
    new RegExp("await (" + JS_IDENT + ")\\(`read-plugin`,"),
  );
  const pluginMatch = block.match(new RegExp(`plugin:(${JS_IDENT}),refetch:(${JS_IDENT})`));
  const busyMatch = block.match(
    new RegExp(`isUninstalling:(${JS_IDENT}),isUpdatingEnabled:(${JS_IDENT}),shareActions:null`),
  );
  if (
    reactMatch == null ||
    jsxMatch == null ||
    bridgeMatch == null ||
    pluginMatch == null ||
    busyMatch == null
  ) {
    return null;
  }

  const hostIdMatch = block.match(new RegExp(`,(${JS_IDENT})=${header[2]}\\?\\?[^,]+`));
  const directMarketplacePathMatch = block.match(
    new RegExp(`directMarketplacePath:(${JS_IDENT})`),
  );
  const marketplacePathMatch = directMarketplacePathMatch == null
    ? null
    : block.match(new RegExp(`,(${JS_IDENT})=${directMarketplacePathMatch[1]}\\?\\?[^,]+`));
  const pluginVar = pluginMatch[1];
  const refetchVar = pluginMatch[2];
  const refreshMatch = block.match(
    new RegExp(`(${JS_IDENT})=\\(0,${reactMatch[1]}\\.useEffectEvent\\)\\(async\\(\\)=>\\{await (${JS_IDENT})\\(`),
  );
  if (hostIdMatch == null || marketplacePathMatch == null || refreshMatch == null) {
    return null;
  }

  return {
    block,
    bridgeVar: bridgeMatch[1],
    busyVars: [busyMatch[1], busyMatch[2]],
    end,
    hostIdVar: hostIdMatch[1],
    jsxVar: jsxMatch[1],
    marketplacePathVar: marketplacePathMatch[1],
    pluginVar,
    reactVar: reactMatch[1],
    refreshVar: refreshMatch[1],
    refetchVar,
    stateAnchor: reactMatch[0],
    start,
  };
}

function applyPluginUpdateButtonPatch(source) {
  if (source.includes(PATCH_MARKER)) {
    if (source.includes(`function ${COMPONENT_NAME}(`) && source.includes("`upgrade-marketplaces`")) {
      return source;
    }
    warn("Found an incomplete existing update-button marker");
    return source;
  }

  const binding = findPluginDetailBinding(source);
  if (binding == null) {
    if (source.includes("plugins.detail.install") || source.includes("summary.installed")) {
      warn("Could not resolve the current plugin detail component");
    }
    return source;
  }

  const {
    block,
    bridgeVar,
    busyVars,
    end,
    hostIdVar,
    jsxVar,
    marketplacePathVar,
    pluginVar,
    reactVar,
    refreshVar,
    stateAnchor,
    start,
  } = binding;
  const anchor =
    `isUninstalling:${busyVars[0]},isUpdatingEnabled:${busyVars[1]},shareActions:null`;
  if (countOccurrences(block, anchor) !== 1) {
    warn("Plugin detail share-action anchor was not unique");
    return source;
  }

  const action =
    `isUninstalling:${busyVars[0]}||${PARENT_BUSY_STATE},` +
    `isUpdatingEnabled:${busyVars[1]},` +
    `shareActions:(0,${jsxVar}.jsx)(${COMPONENT_NAME},{hostId:${hostIdVar},` +
    `installed:${pluginVar}.summary.installed,` +
    `isBusy:${busyVars.join("||")}||${PARENT_BUSY_STATE},` +
    `marketplaceName:${pluginVar}.marketplaceName,` +
    `marketplacePath:${pluginVar}.marketplacePath??${marketplacePathVar},` +
    `pluginName:${pluginVar}.summary.name,pluginSource:${pluginVar}.summary.source,` +
    `onBusyChange:${PARENT_BUSY_SETTER},onUpdated:${refreshVar}})`;
  const state =
    `${stateAnchor},[${PARENT_BUSY_STATE},${PARENT_BUSY_SETTER}]=` +
    `(0,${reactVar}.useState)(!1)`;
  const patchedBlock = block.replace(stateAnchor, state).replace(anchor, action);
  const runtime = pluginUpdateRuntimeSource({ bridgeVar, jsxVar, reactVar });
  return `${source.slice(0, start)}${runtime}${patchedBlock}${source.slice(end)}`;
}

const descriptors = [
  {
    id: "plugin-update-button-ui",
    phase: "webview-asset",
    order: 20_690,
    ciPolicy: "opt-in",
    pattern: /^plugin-detail-page-.*\.js$/,
    missingDescription: "plugin detail webview bundle",
    skipDescription: "Git plugin update button patch",
    apply: applyPluginUpdateButtonPatch,
  },
];

module.exports = {
  COMPONENT_NAME,
  PATCH_MARKER,
  applyPluginUpdateButtonPatch,
  descriptors,
  findPluginDetailBinding,
  pluginUpdateRuntimeSource,
};
