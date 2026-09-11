"use strict";

const {
  findMatchingBrace,
} = require("../../scripts/patches/lib/minified-js.js");

const JS_IDENT = "[A-Za-z_$][\\w$]*";
const PATCH_MARKER = "codexLinuxGitPluginUpdateV1";
const COMPONENT_NAME = "codexLinuxGitPluginUpdateButton";
const PARENT_BUSY_STATE = "codexLinuxGitPluginUpdateBusyV1";
const PARENT_BUSY_SETTER = "setCodexLinuxGitPluginUpdateBusyV1";

function countOccurrences(source, needle) {
  let count = 0;
  let cursor = 0;
  while ((cursor = source.indexOf(needle, cursor)) >= 0) {
    count += 1;
    cursor += needle.length;
  }
  return count;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function pluginUpdateRuntimeSource({
  bridgeVar,
  jsxVar,
  reactVar,
  requestClientProp = false,
}) {
  const requestTarget = requestClientProp ? "v.sendRequest" : bridgeVar;
  const configMethod = requestClientProp ? "config/read" : "read-config-for-host";
  const upgradeMethod = requestClientProp
    ? "marketplace/upgrade"
    : "upgrade-marketplaces";
  const installMethod = requestClientProp ? "plugin/install" : "install-plugin";
  const hostPayload = requestClientProp ? "" : "hostId:t,";
  bridgeVar = requestTarget;
  const runtime = [
    `const ${PATCH_MARKER}=!0;`,
    `function ${COMPONENT_NAME}(e){let{hostId:t,installed:n,isBusy:r,marketplaceName:i,marketplacePath:a,pluginName:o,pluginSource:s,onBusyChange:k,onUpdated:c}=e,l=s?.source??s?.type,u=l===\`git\`||l===\`git-subdir\`,[d,f]=(0,${reactVar}.useState)(null),[p,m]=(0,${reactVar}.useState)(!1),[h,g]=(0,${reactVar}.useState)(null),y=(0,${reactVar}.useRef)(!1);(0,${reactVar}.useEffect)(()=>{if(n!==!0||!u)return f(!1),()=>{};let e=!1;return f(null),${bridgeVar}(\`read-config-for-host\`,{hostId:t,includeLayers:!1,cwd:null}).then(t=>{let n=t?.config?.marketplaces?.[i];e||f(n?.source_type===\`git\`||n?.sourceType===\`git\`)}).catch(()=>{e||(f(null),g(\`failed\`))}),()=>{e=!0}},[t,n,i,u]);if(n!==!0||!u||a==null||o==null)return null;let b=(globalThis.document?.documentElement?.lang??globalThis.navigator?.language??\`en\`).toLowerCase().startsWith(\`ru\`),x=p?b?\`Обновление…\`:\`Updating…\`:h===\`failed\`?b?\`Ошибка обновления\`:\`Update failed\`:h===\`refresh-failed\`?b?\`Обновлено · Повторить\`:\`Updated · Retry refresh\`:h===\`updated\`?b?\`Обновлено\`:\`Updated\`:b?\`Обновить\`:\`Update\`,S=h===\`failed\`?b?\`Не удалось обновить плагин\`:\`Failed to update plugin\`:h===\`refresh-failed\`?b?\`Плагин обновлён; повторить обновление данных\`:\`Plugin updated; retry data refresh\`:b?\`Обновить плагин из Git\`:\`Update plugin from Git\`,C=d==null;return(0,${jsxVar}.jsx)(\`button\`,{type:\`button\`,className:\`h-token-button-composer min-w-20 rounded-md border border-token-border-default bg-transparent px-3 text-sm font-medium text-token-text-secondary hover:bg-token-bg-secondary\`,disabled:p||r||C,title:S,\"aria-label\":S,onClick:async e=>{e.preventDefault(),e.stopPropagation();if(y.current||r||C)return;if(y.current=!0,m(!0),h===\`refresh-failed\`){k?.(!0);try{await c?.(),g(\`updated\`)}catch{g(\`refresh-failed\`)}finally{y.current=!1,m(!1),k?.(!1)}return}g(null),k?.(!0);try{if(d===!0){let e=await ${bridgeVar}(\`upgrade-marketplaces\`,{hostId:t,marketplaceName:i});if(e?.errors?.length>0)throw Error(\`Git marketplace upgrade failed\`)}await ${bridgeVar}(\`install-plugin\`,{hostId:t,marketplacePath:a,pluginName:o}),g(\`updated\`);try{await c?.()}catch{g(\`refresh-failed\`)}}catch(e){g(\`failed\`)}finally{y.current=!1,m(!1),k?.(!1)}},children:x})}`,
  ].join("");
  let normalizedRuntime = runtime.replace(
    ".then(t=>{let n=t?.config?.marketplaces?.[i];e||f(n?.source_type===`git`||n?.sourceType===`git`)})",
    ".then(t=>{let n=t?.config?.marketplaces?.[i],r=n?.source_type??n?.sourceType;e||(n==null||typeof n!==`object`||r!==`git`&&r!==`local`?(f(null),g(`failed`)):(f(r===`git`),g(null)))})",
  );
  if (!requestClientProp) {
    return normalizedRuntime;
  }
  normalizedRuntime = normalizedRuntime
    .replace("onBusyChange:k,onUpdated:c}=e", "onBusyChange:k,onUpdated:c,requestClient:v}=e")
    .replace(
      "`read-config-for-host`,{hostId:t,includeLayers:!1,cwd:null}",
      `\`${configMethod}\`,{${hostPayload}includeLayers:!1,cwd:null}`,
    )
    .replace(
      "`upgrade-marketplaces`,{hostId:t,marketplaceName:i}",
      `\`${upgradeMethod}\`,{${hostPayload}marketplaceName:i??null}`,
    )
    .replace(
      "`install-plugin`,{hostId:t,marketplacePath:a,pluginName:o}",
      `\`${installMethod}\`,{${hostPayload}marketplacePath:a,pluginName:o}`,
    );
  return normalizedRuntime;
}

function hasInstalledPluginUpdateButton(source) {
  const componentHeader = `function ${COMPONENT_NAME}(`;
  const componentStart = source.indexOf(componentHeader);
  if (componentStart < 0) {
    return false;
  }
  const componentOpenBrace = source.indexOf("{", componentStart + componentHeader.length);
  const componentCloseBrace = findMatchingBrace(source, componentOpenBrace);
  if (componentOpenBrace < 0 || componentCloseBrace < 0) {
    return false;
  }
  const component = source.slice(componentStart, componentCloseBrace + 1);
  const bridgeVar = component.match(
    new RegExp("(" + JS_IDENT + ")\\(`read-config-for-host`,", "u"),
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
  const runtime = pluginUpdateRuntimeSource({
    bridgeVar,
    jsxVar,
    reactVar,
    requestClientProp: requestClientVar != null,
  });
  const parentActionPattern = new RegExp(
    `isUninstalling:(${JS_IDENT})\\|\\|${PARENT_BUSY_STATE},` +
      `isUpdatingEnabled:(${JS_IDENT}),` +
      `(?:(?!shareActions:)[\\s\\S]){0,500}?shareActions:` +
      `[\\s\\S]{0,180}?\\(0,(${JS_IDENT})\\.jsx\\)\\(${COMPONENT_NAME},\\{` +
      `hostId:(${JS_IDENT}),installed:(${JS_IDENT})\\.summary\\.installed,` +
      `isBusy:\\1\\|\\|\\2\\|\\|${PARENT_BUSY_STATE},` +
      `marketplaceName:\\5\\.marketplaceName,` +
      `marketplacePath:\\5\\.marketplacePath\\?\\?(${JS_IDENT}),` +
      `pluginName:\\5\\.summary\\.name,pluginSource:\\5\\.summary\\.source,` +
      `onBusyChange:${PARENT_BUSY_SETTER},onUpdated:(${JS_IDENT})` +
      `${requestClientVar == null ? "" : `,requestClient:${JS_IDENT}\\(${JS_IDENT},${JS_IDENT}\\)`}` +
      `\\}\\)`,
    "u",
  );
  return countOccurrences(source, PATCH_MARKER) === 1 &&
    source.includes(runtime) &&
    parentActionPattern.test(source) &&
    source.includes(
      `[${PARENT_BUSY_STATE},${PARENT_BUSY_SETTER}]=(0,${reactVar}.useState)(!1)`,
    );
}

function findLegacyPluginDetailBinding(source) {
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
  const pluginMatch = block.match(new RegExp(
    `plugin:(${JS_IDENT}),(?:${JS_IDENT}:${JS_IDENT},)*refetch:(${JS_IDENT})`,
  ));
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
    stateReplacement:
      `${reactMatch[0]},[${PARENT_BUSY_STATE},${PARENT_BUSY_SETTER}]=` +
      `(0,${reactMatch[1]}.useState)(!1)`,
    start,
  };
}

function findReactCompiledPluginDetailBinding(source) {
  const functionPattern = new RegExp(`function (${JS_IDENT})\\((${JS_IDENT})\\)\\{`, "g");
  const actionPattern = new RegExp(
    `isUninstalling:(${JS_IDENT}),isUpdatingEnabled:(${JS_IDENT}),` +
      `((?:(?!shareActions:)[\\s\\S]){0,500})shareActions:(null|${JS_IDENT})`,
  );
  const candidates = [];
  let functionMatch;
  while ((functionMatch = functionPattern.exec(source)) != null) {
    const openIndex = functionMatch.index + functionMatch[0].length - 1;
    const closeIndex = findMatchingBrace(source, openIndex);
    if (closeIndex === -1) {
      continue;
    }
    const block = source.slice(functionMatch.index, closeIndex + 1);
    const actionMatch = block.match(actionPattern);
    if (actionMatch != null && block.includes("summary.installed")) {
      candidates.push({
        actionMatch,
        block,
        end: closeIndex + 1,
        header: functionMatch[0],
        start: functionMatch.index,
      });
    }
  }
  if (candidates.length !== 1) {
    return null;
  }

  const { actionMatch, block, end, header, start } = candidates[0];
  const propsMatch = block.match(
    new RegExp(
      `\\{[^{}]*?hostId:(${JS_IDENT}),pluginName:(${JS_IDENT}),marketplacePath:(${JS_IDENT}),[^{}]*\\}=` +
        `${JS_IDENT}===void 0\\?\\{\\}:${JS_IDENT}`,
    ),
  );
  const reactMatch = block.match(new RegExp(`\\(0,(${JS_IDENT})\\.useState\\)\\(`));
  const jsxMatch = block.match(
    new RegExp(`\\(0,(${JS_IDENT})\\.jsx\\)\\((${JS_IDENT}),\\{blockedReason:`),
  ) ?? actionMatch[3].match(
    new RegExp(`\\(0,(${JS_IDENT})\\.jsx\\)\\((${JS_IDENT}),`),
  );
  const bridgeMatch = source.match(
    new RegExp("await (" + JS_IDENT + ")\\(`read-plugin`,"),
  );
  const pluginMatch = block.match(new RegExp(
    `plugin:(${JS_IDENT}),(?:${JS_IDENT}:${JS_IDENT},)*refetch:(${JS_IDENT})`,
  ));
  const requestFactoryMatch = source.match(
    new RegExp(
      `(${JS_IDENT})\\((${JS_IDENT}),(${JS_IDENT})\\)\\.sendRequest\\(` +
        "`skills/config/write`,",
    ),
  );
  let requestScopeMatch = null;
  if (requestFactoryMatch != null) {
    const sourceScopeVar = requestFactoryMatch[2];
    const beforeRequest = source.slice(0, requestFactoryMatch.index);
    const sourceScopeAssignments = [
      ...beforeRequest.matchAll(
        new RegExp(
          `(?:let |,)${escapeRegExp(sourceScopeVar)}=(${JS_IDENT}(?:\\(${JS_IDENT}\\))?)`,
          "g",
        ),
      ),
    ];
    const sourceScopeInitializer = sourceScopeAssignments.at(-1)?.[1];
    if (sourceScopeInitializer != null) {
      requestScopeMatch = block.match(
        new RegExp(
          `(?:let |,)(${JS_IDENT})=${escapeRegExp(sourceScopeInitializer)}(?:,|;)`,
        ),
      );
    }
  }
  const hasLegacyBridge = bridgeMatch != null;
  const hasCurrentRequestClient = requestFactoryMatch != null && requestScopeMatch != null;
  if (
    propsMatch == null ||
    reactMatch == null ||
    jsxMatch == null ||
    pluginMatch == null ||
    hasLegacyBridge === hasCurrentRequestClient
  ) {
    return null;
  }

  const hostIdMatch = block.match(
    new RegExp(`,(${JS_IDENT})=${propsMatch[1]}\\?\\?[^,]+`),
  );
  const directMarketplacePathMatch = block.match(
    new RegExp(`directMarketplacePath:(${JS_IDENT})`),
  );
  const marketplacePathMatch = directMarketplacePathMatch == null
    ? null
    : block.match(
      new RegExp(`,(${JS_IDENT})=${directMarketplacePathMatch[1]}\\?\\?[^,]+`),
    );
  if (hostIdMatch == null || marketplacePathMatch == null) {
    return null;
  }

  const hostIdVar = hostIdMatch[1];
  const refetchVar = pluginMatch[2];
  const refetchAnchor = `refetchPluginDetail:${refetchVar}`;
  const refreshEventVars = [];
  const refreshAsyncPattern = new RegExp(`(${JS_IDENT})=async\\(\\)=>\\{`, "g");
  let refreshAsyncMatch;
  while ((refreshAsyncMatch = refreshAsyncPattern.exec(block)) != null) {
    const openIndex = refreshAsyncMatch.index + refreshAsyncMatch[0].length - 1;
    const closeIndex = findMatchingBrace(block, openIndex);
    if (closeIndex === -1) {
      continue;
    }
    const refreshBlock = block.slice(refreshAsyncMatch.index, closeIndex + 1);
    if (refreshBlock.includes(refetchAnchor)) {
      const refreshEventMatch = block.match(
        new RegExp(
          `(${JS_IDENT})=\\(0,${escapeRegExp(reactMatch[1])}\\.useEffectEvent\\)` +
            `\\(${escapeRegExp(refreshAsyncMatch[1])}\\)`,
        ),
      );
      if (refreshEventMatch != null) {
        refreshEventVars.push(refreshEventMatch[1]);
      }
    }
  }
  const uniqueRefreshEventVars = [...new Set(refreshEventVars)];
  if (uniqueRefreshEventVars.length !== 1) {
    return null;
  }

  return {
    actionAnchor: actionMatch[0],
    actionInfix: actionMatch[3],
    block,
    bridgeVar: bridgeMatch?.[1],
    busyVars: [actionMatch[1], actionMatch[2]],
    end,
    hostIdVar,
    jsxVar: jsxMatch[1],
    marketplacePathVar: marketplacePathMatch[1],
    pluginVar: pluginMatch[1],
    reactVar: reactMatch[1],
    requestClientExpression: hasCurrentRequestClient
      ? `${requestFactoryMatch[1]}(${requestScopeMatch[1]},${hostIdVar})`
      : null,
    shareActionsExpression: actionMatch[4],
    refreshVar: uniqueRefreshEventVars[0],
    stateAnchor: header,
    stateReplacement:
      `${header}let [${PARENT_BUSY_STATE},${PARENT_BUSY_SETTER}]=` +
      `(0,${reactMatch[1]}.useState)(!1);`,
    start,
  };
}

function findPluginDetailBinding(source) {
  return findLegacyPluginDetailBinding(source) ?? findReactCompiledPluginDetailBinding(source);
}

function applyPluginUpdateButtonPatch(source) {
  if (source.includes(PATCH_MARKER)) {
    if (hasInstalledPluginUpdateButton(source)) {
      return source;
    }
    throw new Error("Found an incomplete existing update-button marker");
  }

  const binding = findPluginDetailBinding(source);
  if (binding == null) {
    throw new Error("Could not resolve the current plugin detail component");
  }

  const {
    actionAnchor,
    actionInfix,
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
    requestClientExpression,
    shareActionsExpression = "null",
    stateAnchor,
    stateReplacement,
    start,
  } = binding;
  const anchor = actionAnchor ??
    `isUninstalling:${busyVars[0]},isUpdatingEnabled:${busyVars[1]},shareActions:null`;
  if (countOccurrences(block, anchor) !== 1) {
    throw new Error("Plugin detail share-action anchor was not unique");
  }

  const updateAction =
    `(0,${jsxVar}.jsx)(${COMPONENT_NAME},{hostId:${hostIdVar},` +
    `installed:${pluginVar}.summary.installed,` +
    `isBusy:${busyVars.join("||")}||${PARENT_BUSY_STATE},` +
    `marketplaceName:${pluginVar}.marketplaceName,` +
    `marketplacePath:${pluginVar}.marketplacePath??${marketplacePathVar},` +
    `pluginName:${pluginVar}.summary.name,pluginSource:${pluginVar}.summary.source,` +
    `onBusyChange:${PARENT_BUSY_SETTER},onUpdated:${refreshVar}` +
    `${requestClientExpression == null ? "" : `,requestClient:${requestClientExpression}`}` +
    `})`;
  const shareActions = shareActionsExpression === "null"
    ? updateAction
    : `(0,${jsxVar}.jsxs)(${jsxVar}.Fragment,{children:[${updateAction},${shareActionsExpression}]})`;
  const action =
    `isUninstalling:${busyVars[0]}||${PARENT_BUSY_STATE},` +
    `isUpdatingEnabled:${busyVars[1]},` +
    `${actionInfix ?? ""}` +
    `shareActions:${shareActions}`;
  const patchedBlock = block
    .replace(stateAnchor, stateReplacement)
    .replace(anchor, action);
  const runtime = pluginUpdateRuntimeSource({
    bridgeVar,
    jsxVar,
    reactVar,
    requestClientProp: requestClientExpression != null,
  });
  return `${source.slice(0, start)}${runtime}${patchedBlock}${source.slice(end)}`;
}

const descriptors = [
  {
    id: "plugin-update-button-ui",
    phase: "webview-asset",
    order: 20_690,
    ciPolicy: "opt-in",
    pattern: /^plugin-detail-page-.*\.js$/,
    assetMatch: (source) =>
      source.includes("summary.installed") && source.includes("shareActions:"),
    missingDescription: "plugin detail webview bundle",
    skipDescription: "Git plugin update button patch",
    requiredMarkers: [PATCH_MARKER],
    apply: applyPluginUpdateButtonPatch,
  },
];

module.exports = {
  COMPONENT_NAME,
  PATCH_MARKER,
  applyPluginUpdateButtonPatch,
  descriptors,
  findPluginDetailBinding,
  hasInstalledPluginUpdateButton,
  pluginUpdateRuntimeSource,
};
