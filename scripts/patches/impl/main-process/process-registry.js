"use strict";

const fs = require("node:fs");
const path = require("node:path");

const READ_MARKER = "codexLinuxReadProcessRegistry";
const WRITE_MARKER = "codexLinuxAtomicWriteProcessRegistry";
const READER_PATTERN =
  /async function ([A-Za-z_$][\w$]*)\(([A-Za-z_$][\w$]*)\)\{try\{let ([A-Za-z_$][\w$]*)=await\(0,([A-Za-z_$][\w$]*)\.readFile\)\(([A-Za-z_$][\w$]*)\(\2\),`utf8`\),([A-Za-z_$][\w$]*)=([A-Za-z_$][\w$]*)\.safeParse\(JSON\.parse\(\3\)\)/u;
const WRITER_PATTERN =
  /async function ([A-Za-z_$][\w$]*)\(([A-Za-z_$][\w$]*),([A-Za-z_$][\w$]*)\)\{let ([A-Za-z_$][\w$]*)=([A-Za-z_$][\w$]*)\(\2\);await\(0,([A-Za-z_$][\w$]*)\.mkdir\)\(([A-Za-z_$][\w$]*)\.default\.dirname\(\4\),\{recursive:!0\}\),await\(0,\6\.writeFile\)\(\4,JSON\.stringify\(\3,null,2\),`utf8`\)\}/u;

function insertAfterStrictDirective(source, helper) {
  const insertAt = source.startsWith('"use strict";')
    ? '"use strict";'.length
    : source.startsWith("'use strict';")
      ? "'use strict';".length
      : 0;
  return `${source.slice(0, insertAt)}${helper}${source.slice(insertAt)}`;
}

function applyLinuxProcessRegistryDurabilityPatch(source) {
  if (source.includes(READ_MARKER) && source.includes(WRITE_MARKER)) return source;
  if (!source.includes("chat_processes.json")) return source;

  const readerMatch = source.match(READER_PATTERN);
  const writerMatch = source.match(WRITER_PATTERN);
  if (readerMatch == null || writerMatch == null) {
    console.warn(
      "WARN: Could not find current process registry read/write contract - skipping Linux process registry durability patch",
    );
    return source;
  }

  const [, , readerHomeVar, contentsVar, readerFsVar, readerPathFn, , schemaVar] = readerMatch;
  const [, , , recordsVar, statePathVar, writerPathFn, writerFsVar] = writerMatch;
  if (readerPathFn !== writerPathFn || readerFsVar !== writerFsVar) {
    console.warn(
      "WARN: Process registry read/write aliases differ - skipping Linux process registry durability patch",
    );
    return source;
  }

  const helper =
    "let codexLinuxProcessRegistryWriteSerial=0;" +
    "async function codexLinuxReadProcessRegistry(e,t,n,r){let i=null,o=null;if(e.trim().length===0)o=`empty`;else try{i=JSON.parse(e)}catch(e){o=`invalid-json`,i=e instanceof Error?e.name:`Error`}if(o===null){let e=r.safeParse(i);if(e.success)return e;o=`invalid-schema`}let a=`${t}.corrupt-${Date.now()}-${process.pid}`;try{await n.rename(t,a),console.warn(`[linux-process-manager-state] recovered unreadable registry`,{reason:o,backupPath:a,errorName:typeof i===`string`?i:null})}catch(e){console.warn(`[linux-process-manager-state] failed to preserve unreadable registry`,{reason:o,errorName:e instanceof Error?e.name:`Error`})}return{success:!0,data:[]}}" +
    "async function codexLinuxAtomicWriteProcessRegistry(e,t,n){let r=`${e}.tmp-${process.pid}-${++codexLinuxProcessRegistryWriteSerial}`;try{await n.writeFile(r,t,{encoding:`utf8`,mode:384}),await n.rename(r,e)}catch(e){try{await n.rm(r,{force:!0})}catch{}throw e}}";

  let patched = source.replace(
    READER_PATTERN,
    (match) => match.replace(
      `${schemaVar}.safeParse(JSON.parse(${contentsVar}))`,
      `await ${READ_MARKER}(${contentsVar},${readerPathFn}(${readerHomeVar}),${readerFsVar},${schemaVar})`,
    ),
  );
  patched = patched.replace(
    WRITER_PATTERN,
    (match) => match.replace(
      `await(0,${writerFsVar}.writeFile)(${statePathVar},JSON.stringify(${recordsVar},null,2),\`utf8\`)`,
      `await ${WRITE_MARKER}(${statePathVar},JSON.stringify(${recordsVar},null,2),${writerFsVar})`,
    ),
  );
  patched = insertAfterStrictDirective(patched, helper);

  if (!patched.includes(READ_MARKER) || !patched.includes(WRITE_MARKER)) {
    console.warn(
      "WARN: Process registry durability markers were not installed - leaving bundle unchanged",
    );
    return source;
  }
  return patched;
}

function markerCount(source, marker) {
  return source.split(marker).length - 1;
}

function applyLinuxProcessRegistryDurabilityExtractedAppPatch(extractedDir) {
  const buildDir = path.join(extractedDir, ".vite", "build");
  if (!fs.existsSync(buildDir)) {
    const reason = `missing build directory ${buildDir}`;
    console.warn(`WARN: Could not find process registry build chunk - ${reason}`);
    return { matched: 0, changed: 0, verified: false, reason };
  }

  const candidates = fs
    .readdirSync(buildDir)
    .filter((name) => /\.m?js$/u.test(name))
    .sort()
    .filter((name) => {
      const source = fs.readFileSync(path.join(buildDir, name), "utf8");
      const currentContract = source.includes("chat_processes.json") &&
        READER_PATTERN.test(source) &&
        WRITER_PATTERN.test(source);
      const patchedOrPartialContract = source.includes(READ_MARKER) ||
        source.includes(WRITE_MARKER);
      return currentContract || patchedOrPartialContract;
    });
  if (candidates.length !== 1) {
    const reason = candidates.length === 0
      ? "no process registry chunk found"
      : `multiple process registry chunks found: ${candidates.join(", ")}`;
    console.warn(`WARN: Could not uniquely find process registry build chunk - ${reason}`);
    return { matched: candidates.length, changed: 0, verified: false, reason };
  }

  const assetName = candidates[0];
  const filePath = path.join(buildDir, assetName);
  const source = fs.readFileSync(filePath, "utf8");
  const patched = applyLinuxProcessRegistryDurabilityPatch(source);
  const verified = markerCount(patched, READ_MARKER) === 2 &&
    markerCount(patched, WRITE_MARKER) === 2;
  if (!verified) {
    const reason = "process registry durability marker pair was not uniquely verified";
    console.warn(`WARN: ${reason} in ${assetName}`);
    return { matched: 1, changed: 0, verified: false, reason, assetName };
  }
  if (patched !== source) fs.writeFileSync(filePath, patched, "utf8");
  return { matched: 1, changed: patched === source ? 0 : 1, verified: true, assetName };
}

module.exports = {
  applyLinuxProcessRegistryDurabilityPatch,
  applyLinuxProcessRegistryDurabilityExtractedAppPatch,
};
