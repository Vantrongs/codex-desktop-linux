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
  "[codex-linux-renderer-breadcrumb]",
  "codexLinuxRendererCrashTrustedWebContents",
  "r.ftruncateSync(g,0)",
  "this.app.on(`web-contents-created`,this.onWebContentsCreated)",
  "this.app.on(`render-process-gone`,this.onRenderProcessGone)",
  "onRenderProcessGone=",
];

const CRASH_LOG_HELPERS =
  "const codexLinuxRendererCrashStates=new Map,codexLinuxRendererBreadcrumbPrefix=`[codex-linux-renderer-breadcrumb]`;" +
  "function codexLinuxRendererCrashSafeUrl(e){try{let t=new URL(e.getURL());return`${t.protocol}//${t.host}`.slice(0,256)}catch{return null}}" +
  "function codexLinuxRendererCrashTrustedWebContents(e){try{let t=new URL(e.getURL()),n=process.env.CODEX_LINUX_WEBVIEW_PORT;if(typeof n!==`string`||!/^\\d{1,5}$/u.test(n))return!1;let r=Number(n),i=t.port||(t.protocol===`http:`?`80`:``);return r>=1&&r<=65535&&t.protocol===`http:`&&[`127.0.0.1`,`localhost`,`[::1]`].includes(t.hostname)&&i===String(r)}catch{return!1}}" +
  "function codexLinuxRendererCrashState(e){let t=codexLinuxRendererCrashStates.get(e.id);return t||(t={tracked:!1,rendererPid:null,rendererStartedAt:null,lastSeenAt:null,url:null,breadcrumbs:[]},codexLinuxRendererCrashStates.set(e.id,t)),t}" +
  "function codexLinuxRendererCrashRemember(e){let t=codexLinuxRendererCrashState(e),n=null;try{n=e.getOSProcessId()}catch{}if(Number.isInteger(n)&&n>0&&n!==t.rendererPid)t.rendererPid=n,t.rendererStartedAt=new Date().toISOString(),t.breadcrumbs=[];return t.lastSeenAt=new Date().toISOString(),t.url=codexLinuxRendererCrashSafeUrl(e),t}" +
  "function codexLinuxRendererCrashSafeStack(e,t=2048){return typeof e===`string`?e.replace(/\\b[a-z][a-z0-9+.-]*:\\/\\/\\S+/giu,`<url>`).replace(/[?#][^\\s)]*/gu,``).slice(0,t):null}" +
  "function codexLinuxRendererCrashSafeTarget(e){return typeof e===`string`&&/^[a-z][a-z0-9-]{0,31}(?:\\[id\\])?(?:\\[classes=[0-3]\\])?$/u.test(e)?e:null}" +
  "function codexLinuxRendererCrashSafeRouteId(e){return typeof e===`string`&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(e)?e.toLowerCase():null}" +
  "function codexLinuxRendererCrashBreadcrumb(e){if(e==null||typeof e!==`object`||e.v!==1||e.kind!==`resize-observer-loop`)return null;let t=Array.isArray(e.observers)?e.observers.slice(0,4).map(e=>({id:Number.isInteger(e?.id)?e.id:null,createdAt:codexLinuxRendererCrashSafeStack(e?.createdAt,64),stack:codexLinuxRendererCrashSafeStack(e?.stack),targets:Array.isArray(e?.targets)?e.targets.slice(0,4).map(codexLinuxRendererCrashSafeTarget).filter(e=>e!=null):[]})):[];return{v:1,kind:e.kind,timestamp:typeof e.timestamp===`string`&&/^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d{1,3})?Z$/u.test(e.timestamp)?e.timestamp:null,route:null,routeIds:Array.isArray(e.routeIds)?e.routeIds.slice(0,8).map(codexLinuxRendererCrashSafeRouteId).filter(e=>e!=null):[],windowType:typeof e.windowType===`string`&&/^[a-z0-9-]{1,32}$/u.test(e.windowType)?e.windowType:null,observers:t}}" +
  "function codexLinuxTrackRendererCrashWebContents(e){let t=codexLinuxRendererCrashRemember(e);if(t.tracked)return;t.tracked=!0;let n=()=>{codexLinuxRendererCrashRemember(e)};for(let t of [`did-start-loading`,`did-finish-load`,`did-navigate`,`did-frame-finish-load`])e.on(t,n);e.on(`console-message`,(...n)=>{let r=n.find(e=>e&&typeof e===`object`&&typeof e.message===`string`)?.message??n.find(e=>typeof e===`string`&&e.startsWith(codexLinuxRendererBreadcrumbPrefix));if(!codexLinuxRendererCrashTrustedWebContents(e)||typeof r!==`string`||!r.startsWith(codexLinuxRendererBreadcrumbPrefix)||r.length>32768)return;let i;try{i=codexLinuxRendererCrashBreadcrumb(JSON.parse(r.slice(codexLinuxRendererBreadcrumbPrefix.length)))}catch{return}if(i==null)return;let a=codexLinuxRendererCrashRemember(e);a.breadcrumbs.push(i),a.breadcrumbs.length>32&&a.breadcrumbs.splice(0,a.breadcrumbs.length-32)}),e.on(`destroyed`,()=>{codexLinuxRendererCrashStates.delete(e.id)})}" +
  "function codexLinuxRendererCrashCgroupStats(){let e=require(`node:fs`);try{let t=e.readFileSync(`/proc/self/cgroup`,`utf8`).split(`\\n`).find(e=>e.startsWith(`0::`));if(t==null)return null;let n=t.slice(3),r=`/sys/fs/cgroup${n}`,i=t=>{try{return e.readFileSync(`${r}/${t}`,`utf8`).trim()}catch{return null}};return{path:n,memoryCurrent:i(`memory.current`),memoryPeak:i(`memory.peak`),pidsCurrent:i(`pids.current`),pidsPeak:i(`pids.peak`)}}catch{return null}}" +
  "function codexLinuxRendererCrashMetric(e){return{pid:e.pid,type:e.type??null,name:e.name??null,serviceName:e.serviceName??null,memory:e.memory??null,cpu:e.cpu??null}}" +
  "function codexLinuxWriteRendererCrashLog(e,t,n){let r=require(`node:fs`),i=require(`node:path`),a=require(`node:os`),o=(process.env.CODEX_LINUX_APP_ID||process.env.CODEX_APP_ID||`codex-desktop`).trim();/^[A-Za-z0-9._-]+$/.test(o)||(o=`codex-desktop`);let s=process.env.XDG_STATE_HOME||process.env.HOME&&i.join(process.env.HOME,`.local`,`state`);if(!s)throw Error(`No state directory for renderer crash log`);let c=i.join(s,o),l=i.join(c,`renderer-crashes.jsonl`),u=codexLinuxRendererCrashRemember(t),d=u.rendererPid,f=[];try{f=e.getAppMetrics().slice(0,64).map(codexLinuxRendererCrashMetric)}catch{}let h={timestamp:new Date().toISOString(),appId:o,appVersion:e.getVersion(),appPid:process.pid,webContentsId:t.id,rendererPid:d,renderer:{startedAt:u.rendererStartedAt,lastSeenAt:u.lastSeenAt,url:u.url,breadcrumbs:u.breadcrumbs.slice(-8)},reason:n.reason,exitCode:n.exitCode,systemMemoryBytes:{free:a.freemem(),total:a.totalmem()},cgroup:codexLinuxRendererCrashCgroupStats(),appMetrics:f};r.mkdirSync(c,{recursive:!0,mode:448});let p=e=>{try{let t=r.lstatSync(e);if(t.isFile()&&t.nlink===1)return;if(t.isDirectory())throw Error(`Unsafe renderer crash log directory: ${e}`);r.unlinkSync(e)}catch(e){if(e?.code!==`ENOENT`)throw e}};p(l);let m=r.constants.O_CREAT|r.constants.O_APPEND|r.constants.O_WRONLY|r.constants.O_NOFOLLOW|(r.constants.O_CLOEXEC||0),g=r.openSync(l,m,384),v=JSON.stringify(h)+`\\n`;try{let e=r.fstatSync(g);if(!e.isFile()||e.nlink!==1)throw Error(`Unsafe renderer crash log file`);r.fchmodSync(g,384),e.size+Buffer.byteLength(v)>1048576&&r.ftruncateSync(g,0),r.writeSync(g,v,null,`utf8`)}finally{r.closeSync(g)}return h}";

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
    "register(){this.app.on(`child-process-gone`,this.onChildProcessGone),process.platform===`linux`&&(this.app.on(`web-contents-created`,this.onWebContentsCreated),this.app.on(`render-process-gone`,this.onRenderProcessGone))}",
  );

  const childHandlerIndex = patched.indexOf(CHILD_HANDLER, patched.indexOf(CRASH_LOG_MARKER));
  if (childHandlerIndex === -1) {
    throw new Error("Could not find Electron child process diagnostics handler");
  }
  const rendererHandler =
    "onWebContentsCreated=(e,t)=>{codexLinuxTrackRendererCrashWebContents(t)};onRenderProcessGone=(e,t,n)=>{if(n.reason===`clean-exit`)return;let r=null;try{r=codexLinuxWriteRendererCrashLog(this.app,t,n)}catch(e){this.logger.warning(`Failed to persist Linux renderer crash diagnostics`,{safe:{reason:n.reason,exitCode:n.exitCode,webContentsId:t.id},sensitive:{error:e}})}this.logger.warning(`Linux renderer process gone`,{safe:{reason:n.reason,exitCode:n.exitCode,webContentsId:t.id,rendererPid:r?.rendererPid??null,cgroupMemoryCurrent:r?.cgroup?.memoryCurrent??null,cgroupPidsCurrent:r?.cgroup?.pidsCurrent??null,rendererBreadcrumbCount:r?.renderer?.breadcrumbs?.length??0},sensitive:{}})};";
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
