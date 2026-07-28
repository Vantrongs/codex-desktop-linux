"use strict";

const CRASH_LOG_MARKER = "codexLinuxWriteRendererCrashLog";
const DIAGNOSTICS_CLASS_ANCHOR =
  /var ([A-Za-z_$][\w$]*)=6e4,([A-Za-z_$][\w$]*)=class\{app;errorReporter;logger;lastRecoverableLogByKey/u;
const REGISTER_METHOD =
  /register\(\)\{this\.app\.on\(`child-process-gone`,this\.onChildProcessGone\)\}/u;
const CHILD_HANDLER = "onChildProcessGone=";
const INSTALLED_MARKERS = [
  CRASH_LOG_MARKER,
  "renderer-crashes.jsonl",
  "this.app.on(`render-process-gone`,this.onRenderProcessGone)",
  "onRenderProcessGone=",
];

const CRASH_LOG_HELPERS =
  "function codexLinuxRendererCrashCgroupStats(){let e=require(`node:fs`);try{let t=e.readFileSync(`/proc/self/cgroup`,`utf8`).split(`\\n`).find(e=>e.startsWith(`0::`));if(t==null)return null;let n=t.slice(3),r=`/sys/fs/cgroup${n}`,i=t=>{try{return e.readFileSync(`${r}/${t}`,`utf8`).trim()}catch{return null}};return{path:n,memoryCurrent:i(`memory.current`),memoryPeak:i(`memory.peak`),pidsCurrent:i(`pids.current`),pidsPeak:i(`pids.peak`)}}catch{return null}}" +
  "function codexLinuxRendererCrashMetric(e){return{pid:e.pid,type:e.type??null,name:e.name??null,serviceName:e.serviceName??null,memory:e.memory??null,cpu:e.cpu??null}}" +
  "function codexLinuxWriteRendererCrashLog(e,t,n){let r=require(`node:fs`),i=require(`node:path`),a=require(`node:os`),o=(process.env.CODEX_LINUX_APP_ID||process.env.CODEX_APP_ID||`codex-desktop`).trim();/^[A-Za-z0-9._-]+$/.test(o)||(o=`codex-desktop`);let s=process.env.XDG_STATE_HOME||process.env.HOME&&i.join(process.env.HOME,`.local`,`state`);if(!s)throw Error(`No state directory for renderer crash log`);let c=i.join(s,o),l=i.join(c,`renderer-crashes.jsonl`),u=null;try{u=t.getOSProcessId()}catch{}let d=[];try{d=e.getAppMetrics().map(codexLinuxRendererCrashMetric)}catch{}let f={timestamp:new Date().toISOString(),appId:o,appVersion:e.getVersion(),appPid:process.pid,webContentsId:t.id,rendererPid:u,reason:n.reason,exitCode:n.exitCode,systemMemoryBytes:{free:a.freemem(),total:a.totalmem()},cgroup:codexLinuxRendererCrashCgroupStats(),appMetrics:d};return r.mkdirSync(c,{recursive:!0,mode:448}),r.appendFileSync(l,JSON.stringify(f)+`\\n`,{encoding:`utf8`,mode:384}),r.chmodSync(l,384),f}";

function applyLinuxRendererCrashDiagnosticsPatch(source) {
  const installedMarkerCount = INSTALLED_MARKERS.filter((marker) => source.includes(marker)).length;
  if (installedMarkerCount === INSTALLED_MARKERS.length) return source;
  if (installedMarkerCount > 0) {
    throw new Error("Found partial Linux renderer crash diagnostics markers");
  }
  if (!source.includes("child-process-gone")) {
    throw new Error("Could not find Electron process diagnostics contract");
  }

  const classAnchor = source.match(DIAGNOSTICS_CLASS_ANCHOR);
  const registerMethod = source.match(REGISTER_METHOD);
  if (classAnchor == null || registerMethod == null) {
    throw new Error("Could not find Electron process diagnostics contract");
  }

  let patched = source.replace(
    DIAGNOSTICS_CLASS_ANCHOR,
    (match) => `${CRASH_LOG_HELPERS}${match}`,
  );
  patched = patched.replace(
    REGISTER_METHOD,
    "register(){this.app.on(`child-process-gone`,this.onChildProcessGone),process.platform===`linux`&&this.app.on(`render-process-gone`,this.onRenderProcessGone)}",
  );

  const childHandlerIndex = patched.indexOf(CHILD_HANDLER, patched.indexOf(CRASH_LOG_MARKER));
  if (childHandlerIndex === -1) {
    throw new Error("Could not find Electron child process diagnostics handler");
  }
  const rendererHandler =
    "onRenderProcessGone=(e,t,n)=>{if(n.reason===`clean-exit`)return;let r=null;try{r=codexLinuxWriteRendererCrashLog(this.app,t,n)}catch(e){this.logger.warning(`Failed to persist Linux renderer crash diagnostics`,{safe:{reason:n.reason,exitCode:n.exitCode,webContentsId:t.id},sensitive:{error:e}})}this.logger.warning(`Linux renderer process gone`,{safe:{reason:n.reason,exitCode:n.exitCode,webContentsId:t.id,rendererPid:r?.rendererPid??null,cgroupMemoryCurrent:r?.cgroup?.memoryCurrent??null,cgroupPidsCurrent:r?.cgroup?.pidsCurrent??null},sensitive:{}})};";
  patched =
    patched.slice(0, childHandlerIndex) +
    rendererHandler +
    patched.slice(childHandlerIndex);

  if (!INSTALLED_MARKERS.every((marker) => patched.includes(marker))) {
    throw new Error("Renderer crash diagnostics markers were not installed");
  }
  return patched;
}

module.exports = {
  applyLinuxRendererCrashDiagnosticsPatch,
};
