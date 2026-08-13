"use strict";

const fs = require("node:fs");
const path = require("node:path");

const RETENTION_MARKER = "codexLinuxRetainCrashMinidump";
const SENTRY_CONTRACT_MARKERS = [
  "maxMinidumpsPerSession",
  "Starting Electron crashReporter",
  "Found minidump",
  "Could not delete minidump",
  "uploadToServer:!1",
];
const SENTRY_DELETE_PATTERN =
  /finally\{try\{await ([A-Za-z_$][\w$]*)\.promises\.unlink\(([A-Za-z_$][\w$]*)\)\}catch\{([A-Za-z_$][\w$]*)\.warn\(`Could not delete minidump`,\2\)\}\}/gu;
const INSTALLED_SENTRY_DELETE_PATTERN =
  /finally\{try\{await codexLinuxRetainCrashMinidump\(([A-Za-z_$][\w$]*)\),await ([A-Za-z_$][\w$]*)\.promises\.unlink\(\1\)\}catch\{([A-Za-z_$][\w$]*)\.warn\(`Could not delete minidump`,\1\)\}\}/gu;

async function codexLinuxRetainCrashMinidump(sourceDumpPath) {
  if (process.platform !== "linux" || typeof sourceDumpPath !== "string") {
    return null;
  }

  const fs = require("node:fs");
  const path = require("node:path");
  const maximumDumpBytes = 16 * 1024 * 1024;
  const maximumRetainedBytes = 32 * 1024 * 1024;
  const maximumRetainedFiles = 3;
  let sourceHandle = null;
  let destinationHandle = null;
  let destinationPath = null;
  let destinationCreated = false;
  try {
    const sourceName = path.basename(sourceDumpPath);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.dmp$/iu.test(sourceName)) {
      return null;
    }

    const ensureExistingFileWithoutSymlinks = async (filePath) => {
      const absolutePath = path.resolve(filePath);
      const rootPath = path.parse(absolutePath).root;
      const components = absolutePath.slice(rootPath.length).split(path.sep).filter(Boolean);
      let currentPath = rootPath;
      for (let index = 0; index < components.length; index += 1) {
        currentPath = path.join(currentPath, components[index]);
        const componentStats = await fs.promises.lstat(currentPath);
        const isLastComponent = index === components.length - 1;
        if (
          componentStats.isSymbolicLink() ||
          (isLastComponent ? !componentStats.isFile() : !componentStats.isDirectory())
        ) {
          throw Object.assign(new Error("Unsafe renderer minidump source path"), {
            code: "EUNSAFE",
          });
        }
      }
      return absolutePath;
    };

    const stateRoot = process.env.XDG_STATE_HOME ||
      (process.env.HOME ? path.join(process.env.HOME, ".local", "state") : null);
    if (stateRoot == null) {
      throw Object.assign(new Error("No state directory for renderer minidumps"), {
        code: "ENOENT",
      });
    }
    if (!path.isAbsolute(stateRoot)) {
      throw Object.assign(new Error("Renderer minidump state directory must be absolute"), {
        code: "EINVAL",
      });
    }
    let appId = (process.env.CODEX_LINUX_APP_ID ||
      process.env.CODEX_APP_ID ||
      "codex-desktop").trim();
    if (!/^[A-Za-z0-9._-]+$/u.test(appId) || appId === "." || appId === "..") {
      appId = "codex-desktop";
    }

    const ensureDirectoryWithoutSymlinks = async (directoryPath) => {
      const absolutePath = path.resolve(directoryPath);
      const rootPath = path.parse(absolutePath).root;
      let currentPath = rootPath;
      for (const component of absolutePath.slice(rootPath.length).split(path.sep).filter(Boolean)) {
        currentPath = path.join(currentPath, component);
        try {
          await fs.promises.mkdir(currentPath, { mode: 0o700 });
        } catch (error) {
          if (error?.code !== "EEXIST") throw error;
        }
        const componentStats = await fs.promises.lstat(currentPath);
        if (!componentStats.isDirectory() || componentStats.isSymbolicLink()) {
          throw Object.assign(new Error("Unsafe renderer minidump directory component"), {
            code: "EUNSAFE",
          });
        }
      }
      return absolutePath;
    };
    const absoluteStateRoot = await ensureDirectoryWithoutSymlinks(stateRoot);
    const appStateDirectory = await ensureDirectoryWithoutSymlinks(
      path.join(absoluteStateRoot, appId),
    );
    const retainedDirectory = await ensureDirectoryWithoutSymlinks(
      path.join(appStateDirectory, "crash-minidumps"),
    );
    await fs.promises.chmod(appStateDirectory, 0o700);
    await fs.promises.chmod(retainedDirectory, 0o700);

    const absoluteSourceDumpPath = await ensureExistingFileWithoutSymlinks(sourceDumpPath);
    const sourceFlags = fs.constants.O_RDONLY |
      fs.constants.O_NOFOLLOW |
      (fs.constants.O_CLOEXEC || 0);
    sourceHandle = await fs.promises.open(absoluteSourceDumpPath, sourceFlags);
    const sourceStats = await sourceHandle.stat();
    if (
      !sourceStats.isFile() ||
      sourceStats.nlink !== 1 ||
      sourceStats.size < 10 * 1024 ||
      sourceStats.size > maximumDumpBytes
    ) {
      return null;
    }

    const timestamp = new Date()
      .toISOString()
      .replace(/[-:]/gu, "")
      .replace(".", "-");
    const destinationName = `${timestamp}-${process.pid}-${sourceName}`;
    destinationPath = path.join(retainedDirectory, destinationName);
    const destinationFlags = fs.constants.O_CREAT |
      fs.constants.O_EXCL |
      fs.constants.O_WRONLY |
      fs.constants.O_NOFOLLOW |
      (fs.constants.O_CLOEXEC || 0);
    destinationHandle = await fs.promises.open(destinationPath, destinationFlags, 0o600);
    destinationCreated = true;
    await destinationHandle.writeFile(await sourceHandle.readFile());
    await destinationHandle.chmod(0o600);
    await destinationHandle.sync();
    await destinationHandle.close();
    destinationHandle = null;

    const retained = [];
    for (const entry of await fs.promises.readdir(retainedDirectory, { withFileTypes: true })) {
      if (
        !entry.isFile() ||
        !/^\d{8}T\d{6}-\d{3}Z-\d+-[0-9a-f-]{36}\.dmp$/iu.test(entry.name)
      ) {
        continue;
      }
      const retainedPath = path.join(retainedDirectory, entry.name);
      const retainedStats = await fs.promises.lstat(retainedPath);
      if (!retainedStats.isFile() || retainedStats.isSymbolicLink() || retainedStats.nlink !== 1) {
        continue;
      }
      retained.push({
        name: entry.name,
        path: retainedPath,
        mtimeMs: retainedStats.mtimeMs,
        size: retainedStats.size,
      });
    }
    retained.sort((left, right) =>
      right.mtimeMs - left.mtimeMs || right.name.localeCompare(left.name),
    );
    let retainedBytes = retained.reduce((total, entry) => total + entry.size, 0);
    for (let index = retained.length - 1; index >= 0; index -= 1) {
      if (index < maximumRetainedFiles && retainedBytes <= maximumRetainedBytes) break;
      await fs.promises.unlink(retained[index].path);
      retainedBytes -= retained[index].size;
    }
    return destinationPath;
  } catch (error) {
    if (destinationHandle != null) {
      try {
        await destinationHandle.close();
      } catch {}
    }
    if (destinationCreated && destinationPath != null) {
      try {
        await fs.promises.unlink(destinationPath);
      } catch {}
    }
    console.warn("[codex-linux-minidump-retention] failed", {
      code: typeof error?.code === "string" ? error.code : null,
      name: error instanceof Error ? error.name : "Error",
    });
    return null;
  } finally {
    if (sourceHandle != null) {
      try {
        await sourceHandle.close();
      } catch {}
    }
  }
}

const RUNTIME_SOURCE = codexLinuxRetainCrashMinidump.toString();

function insertAfterStrictDirective(source, helper) {
  const insertAt = source.startsWith('"use strict";')
    ? '"use strict";'.length
    : source.startsWith("'use strict';")
      ? "'use strict';".length
      : 0;
  return `${source.slice(0, insertAt)}${helper}${source.slice(insertAt)}`;
}

function applyLinuxRendererMinidumpRetentionPatch(source) {
  const markerCount = source.split(RETENTION_MARKER).length - 1;
  const installedCleanupCount = [...source.matchAll(INSTALLED_SENTRY_DELETE_PATTERN)].length;
  const installedRuntimeCount = source.split(RUNTIME_SOURCE).length - 1;
  if (markerCount === 2 && installedCleanupCount === 1 && installedRuntimeCount === 1) {
    return source;
  }
  if (markerCount > 0) {
    throw new Error("Found partial Linux renderer minidump retention markers");
  }
  if (!SENTRY_CONTRACT_MARKERS.every((marker) => source.includes(marker))) {
    throw new Error("Could not find current Sentry minidump cleanup contract");
  }

  const matches = [...source.matchAll(SENTRY_DELETE_PATTERN)];
  if (matches.length !== 1) {
    throw new Error("Could not find unique Sentry minidump deletion contract");
  }
  const [match, fsAlias, dumpPathAlias] = matches[0];
  const patchedCleanup = match.replace(
    `await ${fsAlias}.promises.unlink(${dumpPathAlias})`,
    `await ${RETENTION_MARKER}(${dumpPathAlias}),await ${fsAlias}.promises.unlink(${dumpPathAlias})`,
  );
  let patched = source.slice(0, matches[0].index) +
    patchedCleanup +
    source.slice(matches[0].index + match.length);
  patched = insertAfterStrictDirective(patched, RUNTIME_SOURCE);
  if (patched.split(RETENTION_MARKER).length - 1 !== 2) {
    throw new Error("Linux renderer minidump retention markers were not uniquely installed");
  }
  return patched;
}

function currentSentryMinidumpContract(source) {
  return SENTRY_CONTRACT_MARKERS.every((marker) => source.includes(marker)) &&
    (
      [...source.matchAll(SENTRY_DELETE_PATTERN)].length === 1 ||
      source.includes(RETENTION_MARKER)
    );
}

function readRegularPatchAsset(filePath) {
  let fileDescriptor = null;
  try {
    fileDescriptor = fs.openSync(
      filePath,
      fs.constants.O_RDONLY |
        fs.constants.O_NOFOLLOW |
        (fs.constants.O_CLOEXEC || 0),
    );
    const fileStats = fs.fstatSync(fileDescriptor);
    if (!fileStats.isFile() || fileStats.nlink !== 1) return null;
    return fs.readFileSync(fileDescriptor, "utf8");
  } catch (error) {
    if (["ELOOP", "ENOENT", "ENOTDIR"].includes(error?.code)) return null;
    throw error;
  } finally {
    if (fileDescriptor != null) fs.closeSync(fileDescriptor);
  }
}

function writeRegularPatchAsset(filePath, source) {
  const fileDescriptor = fs.openSync(
    filePath,
    fs.constants.O_RDWR |
      fs.constants.O_NOFOLLOW |
      (fs.constants.O_CLOEXEC || 0),
  );
  try {
    const fileStats = fs.fstatSync(fileDescriptor);
    if (!fileStats.isFile() || fileStats.nlink !== 1) {
      throw Object.assign(new Error("Unsafe renderer minidump patch asset"), {
        code: "EUNSAFE",
      });
    }
    fs.ftruncateSync(fileDescriptor, 0);
    fs.writeFileSync(fileDescriptor, source, "utf8");
    fs.fsyncSync(fileDescriptor);
  } finally {
    fs.closeSync(fileDescriptor);
  }
}

function safeExtractedAppBuildDirectory(extractedDir) {
  let currentPath = path.resolve(extractedDir);
  for (const component of [null, ".vite", "build"]) {
    if (component != null) currentPath = path.join(currentPath, component);
    try {
      const componentStats = fs.lstatSync(currentPath);
      if (!componentStats.isDirectory() || componentStats.isSymbolicLink()) return null;
    } catch (error) {
      if (["ENOENT", "ENOTDIR"].includes(error?.code)) return null;
      throw error;
    }
  }
  return currentPath;
}

function applyLinuxRendererMinidumpRetentionExtractedAppPatch(extractedDir) {
  const expectedBuildDirectory = path.join(extractedDir, ".vite", "build");
  const buildDirectory = safeExtractedAppBuildDirectory(extractedDir);
  if (buildDirectory == null) {
    const reason = `missing or unsafe build directory ${expectedBuildDirectory}`;
    console.warn(`WARN: Could not find Sentry minidump chunk - ${reason}`);
    return { matched: 0, changed: 0, verified: false, reason };
  }

  const candidates = fs
    .readdirSync(buildDirectory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /^window-all-closed-.*\.m?js$/u.test(entry.name))
    .map((entry) => ({
      name: entry.name,
      source: readRegularPatchAsset(path.join(buildDirectory, entry.name)),
    }))
    .filter((candidate) =>
      candidate.source != null && currentSentryMinidumpContract(candidate.source),
    )
    .sort((left, right) => left.name.localeCompare(right.name));
  if (candidates.length !== 1) {
    const reason = candidates.length === 0
      ? "no Sentry minidump chunk found"
      : `multiple Sentry minidump chunks found: ${candidates.map(({ name }) => name).join(", ")}`;
    console.warn(`WARN: Could not uniquely find Sentry minidump chunk - ${reason}`);
    return { matched: candidates.length, changed: 0, verified: false, reason };
  }

  const { name: assetName, source } = candidates[0];
  const filePath = path.join(buildDirectory, assetName);
  const patched = applyLinuxRendererMinidumpRetentionPatch(source);
  const verified = patched.split(RETENTION_MARKER).length - 1 === 2;
  if (!verified) {
    const reason = "renderer minidump retention markers were not uniquely verified";
    console.warn(`WARN: ${reason} in ${assetName}`);
    return { matched: 1, changed: 0, verified: false, reason, assetName };
  }
  if (patched !== source) writeRegularPatchAsset(filePath, patched);
  return {
    matched: 1,
    changed: patched === source ? 0 : 1,
    verified: true,
    assetName,
  };
}

module.exports = {
  applyLinuxRendererMinidumpRetentionExtractedAppPatch,
  applyLinuxRendererMinidumpRetentionPatch,
  codexLinuxRetainCrashMinidump,
};
