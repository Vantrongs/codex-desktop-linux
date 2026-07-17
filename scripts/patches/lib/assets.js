"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { findExportedAlias } = require("./minified-js.js");

function readDirectoryNames(dir) {
  if (!fs.existsSync(dir)) {
    return [];
  }
  return fs.readdirSync(dir);
}

function findMainBundle(extractedDir) {
  const buildDir = path.join(extractedDir, ".vite", "build");
  const mainBundle = readDirectoryNames(buildDir).find((name) =>
    /^main(?:-[^.]+)?\.js$/.test(name),
  );

  return mainBundle == null ? null : { buildDir, mainBundle };
}

function findIconAsset(extractedDir) {
  const assetsDir = path.join(extractedDir, "webview", "assets");
  return readDirectoryNames(assetsDir).find((name) => /^app-.*\.png$/.test(name)) ?? null;
}

function regexpTest(filenamePattern, name) {
  filenamePattern.lastIndex = 0;
  return filenamePattern.test(name);
}

function countOccurrences(source, marker) {
  let count = 0;
  let offset = 0;
  while ((offset = source.indexOf(marker, offset)) !== -1) {
    count += 1;
    offset += marker.length;
  }
  return count;
}

function patchAssetFiles(
  extractedDir,
  filenamePattern,
  patchFn,
  missingWarnMessage,
  options = {},
) {
  const webviewAssetsDir = path.join(extractedDir, "webview", "assets");
  if (!fs.existsSync(webviewAssetsDir)) {
    console.warn(
      `WARN: Could not find webview assets directory in ${webviewAssetsDir} — skipping asset patch`,
    );
    return { matched: 0, changed: 0 };
  }

  const candidates = fs
    .readdirSync(webviewAssetsDir)
    .filter((name) => regexpTest(filenamePattern, name))
    .sort();

  if (candidates.length === 0) {
    console.warn(missingWarnMessage);
    return { matched: 0, changed: 0 };
  }

  const pendingWrites = [];
  const patchedAssets = [];
  for (const candidate of candidates) {
    const filePath = path.join(webviewAssetsDir, candidate);
    const currentSource = fs.readFileSync(filePath, "utf8");
    const patchedSource = patchFn(currentSource);
    patchedAssets.push(patchedSource);
    if (patchedSource !== currentSource) {
      pendingWrites.push({ filePath, patchedSource });
    }
  }

  const requiredMarkers = options.requiredMarkers ?? [];
  if (requiredMarkers.length > 0) {
    if (
      !Array.isArray(requiredMarkers) ||
      requiredMarkers.some((marker) => typeof marker !== "string" || marker.length === 0)
    ) {
      throw new Error("requiredMarkers must be an array of non-empty strings");
    }
    const markerCounts = Object.fromEntries(
      requiredMarkers.map((marker) => [
        marker,
        patchedAssets.reduce(
          (count, patchedSource) => count + countOccurrences(patchedSource, marker),
          0,
        ),
      ]),
    );
    const invalidMarkers = requiredMarkers.filter((marker) => markerCounts[marker] !== 1);
    if (invalidMarkers.length > 0) {
      const details = invalidMarkers
        .map((marker) => `${marker}=${markerCounts[marker]}`)
        .join(", ");
      console.warn(
        `${options.verificationWarnMessage ?? "WARN: Webview asset patch marker verification failed"} (${details})`,
      );
      return {
        matched: candidates.length,
        changed: 0,
        attemptedChanged: pendingWrites.length,
        verified: false,
        markerCounts,
      };
    }

    for (const { filePath, patchedSource } of pendingWrites) {
      fs.writeFileSync(filePath, patchedSource, "utf8");
    }
    return {
      matched: candidates.length,
      changed: pendingWrites.length,
      verified: true,
      markerCounts,
    };
  }

  for (const { filePath, patchedSource } of pendingWrites) {
    fs.writeFileSync(filePath, patchedSource, "utf8");
  }

  return { matched: candidates.length, changed: pendingWrites.length };
}

function readWebviewAsset(webviewAssetsDir, assetName) {
  return fs.readFileSync(path.join(webviewAssetsDir, assetName), "utf8");
}

function findRequiredWebviewAsset(webviewAssetsDir, filenamePattern, marker, description) {
  if (!fs.existsSync(webviewAssetsDir)) {
    throw new Error(`Missing webview assets directory ${webviewAssetsDir}`);
  }

  const candidates = fs
    .readdirSync(webviewAssetsDir)
    .filter((name) => regexpTest(filenamePattern, name))
    .sort();
  const matches = marker == null
    ? candidates
    : candidates.filter((name) => readWebviewAsset(webviewAssetsDir, name).includes(marker));

  if (matches.length === 0) {
    throw new Error(`Could not find ${description} in ${webviewAssetsDir}`);
  }

  return matches[0];
}

function findCodexRequestExportName(source) {
  let match = source.match(
    /async function\s+([A-Za-z_$][\w$]*)\(\.\.\.[^)]+\)\{let\[[^\]]+\]=[^;]+,\{params:[^}]+source:[^}]+\}=[^;]+;return\s+[A-Za-z_$][\w$]*\([^)]*\)\}/,
  );
  if (match != null) {
    return findExportedAlias(source, match[1]);
  }

  match = source.match(
    /function\s+([A-Za-z_$][\w$]*)\(\.\.\.[^)]+\)\{let\[[^\]]+\]=[^;]+,\{params:[^}]+select:[^}]+signal:[^}]+source:[^}]+\}=[^;]+;return\s+([A-Za-z_$][\w$]*)\([^)]*\)\}/,
  );
  if (match != null) {
    const [, wrapperName, rawRequestName] = match;
    const rawRequestPattern = new RegExp(
      `async function\\s+${rawRequestName}\\([^)]*\\)\\{[\\s\\S]{0,600}?vscode://codex/`,
    );
    if (rawRequestPattern.test(source)) {
      return findExportedAlias(source, wrapperName);
    }
  }

  return null;
}

function findCodexRequestWebviewAsset(webviewAssetsDir) {
  if (!fs.existsSync(webviewAssetsDir)) {
    throw new Error(`Missing webview assets directory ${webviewAssetsDir}`);
  }

  const settingStorageCandidates = fs
    .readdirSync(webviewAssetsDir)
    .filter((name) => regexpTest(/^setting-storage-.*\.js$/, name))
    .sort();
  const allRequestCandidates = fs
    .readdirSync(webviewAssetsDir)
    .filter((name) => regexpTest(/\.js$/, name))
    .sort()
    .filter((name) => !settingStorageCandidates.includes(name));
  const modernCandidates = [...settingStorageCandidates, ...allRequestCandidates];
  const matches = [];
  for (const candidate of modernCandidates) {
    const source = readWebviewAsset(webviewAssetsDir, candidate);
    if (!source.includes("vscode://codex/")) {
      continue;
    }
    const exportName = findCodexRequestExportName(source);
    if (exportName != null) {
      matches.push({ assetName: candidate, exportName });
    }
  }

  if (matches.length > 1) {
    throw new Error(
      `Found multiple Codex request API assets (${matches.map(({ assetName }) => assetName).join(", ")})`,
    );
  }

  if (matches.length === 1) {
    return matches[0];
  }

  throw new Error(`Could not find Codex request API asset in ${webviewAssetsDir}`);
}

function findImportedAsset(webviewAssetsDir, importerAsset, description) {
  const importedAsset = readWebviewAsset(webviewAssetsDir, importerAsset).match(/from"\.\/([^"]+)"/)?.[1];
  if (!importedAsset || !fs.existsSync(path.join(webviewAssetsDir, importedAsset))) {
    throw new Error(`Could not find ${description} imported by ${importerAsset}`);
  }
  return importedAsset;
}

module.exports = {
  findCodexRequestWebviewAsset,
  findIconAsset,
  findImportedAsset,
  findMainBundle,
  findRequiredWebviewAsset,
  patchAssetFiles,
  readDirectoryNames,
  readWebviewAsset,
};
