import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT, LOCAL } from '../lib/config.mjs';
import { processCall } from '../lib/process.mjs';
import { GitHub } from '../lib/github.mjs';
import { atomicJson, readJson } from '../lib/storage.mjs';
import { importChecklist } from '../lib/checklist.mjs';
import { windowsPowerShell } from '../lib/executables.mjs';

export async function bootstrap({login=false}={}) {
if(Number(process.versions.node.split('.')[0])<24) throw Error('NODE_VERSION_UNSUPPORTED: Node.js 24 or newer is required.');
const run=async(command,args)=>{
  const result=await processCall(command,args,{cwd:ROOT,inherit:true,timeout:600_000});
  if(result.code) throw Error('Environment setup failed. Resolve the displayed error and restart.');
};
if(!existsSync(resolve(ROOT,'node_modules/@playwright/test/cli.js'))) {
  const npm=resolve(dirname(process.execPath),'node_modules/npm/bin/npm-cli.js');
  if(!existsSync(npm)) throw Error('Install Node.js with npm, then restart START-BRIDGE.cmd.');
  await run(process.execPath,[npm,'ci']);
}
const {chromium}=await import('@playwright/test');
if(!existsSync(chromium.executablePath())) await run(process.execPath,[resolve(ROOT,'node_modules/@playwright/test/cli.js'),'install','chromium']);
await mkdir(LOCAL,{recursive:true,mode:0o700});
if(process.platform==='win32') {
  // Built into Windows; does not depend on Codex's injected pwsh/PATH.
  const shell=windowsPowerShell();
  if(!existsSync(shell.path))throw Error('POWERSHELL_MISSING: the Windows PowerShell executable was not found.');
  const acl=await processCall(shell.path,['-NoProfile','-ExecutionPolicy','Bypass','-File',resolve(ROOT,'aikit/bridge/protect-storage.ps1'),'-EvidencePath',LOCAL],{env:shell.env,timeout:180_000});
  if(acl.code) {
    const log=resolve(LOCAL,'startup-permissions.log');
    await writeFile(log,acl.stdout+'\n'+acl.stderr,{mode:0o600}).catch(()=>{});
    throw Error(`LOCAL_STORAGE_PERMISSION_CHECK_FAILED: Windows permission validation exited ${acl.code}. Details are local in ${log}. Run as the account that owns the QA evidence; startup will not reset it.`);
  }
}
let authentication;
if(!login) {
  const github=await GitHub.connect();authentication=github.authentication;
  console.log(`GitHub authentication verified: ${authentication.source}${authentication.executable?' ('+authentication.executable+')':''}`);
  const existing=await readJson(resolve(LOCAL,'checklist.json'),null);
  if(existing) {
    if(!Array.isArray(existing.scenarios)||existing.scenarios.length!==99)throw Error('CHECKLIST_INVALID: preserve and inspect the existing checkpoint; startup will not reset it.');
    console.log('Preserved the existing 99-item checkpoint; no source refresh or reset.');
  } else {
    const issue=await github.request('/repos/Bequcho/beqson-qa-platform/issues/2');
    const source={source:issue.html_url,body:issue.body,updatedAt:issue.updated_at,fetchedAt:new Date().toISOString()};
    await atomicJson(resolve(LOCAL,'checklist-source.json'),source);await importChecklist(source);
  }
}
await atomicJson(resolve(LOCAL,'startup.json'),{at:new Date().toISOString(),pid:process.pid,node:process.version,nodeExecutable:process.execPath,chromium:chromium.executablePath(),authentication,ready:true});
console.log('Validated Node, locked dependencies, Chromium and private local storage.');
}

export function startupFailure(error) {
  // Credentials are never included in errors from the authentication adapter.
  console.error('Startup blocked: '+(error.code==='LOCK_ACTIVE' || error.message==='LOCK_ACTIVE'?'a bridge instance is already running. Use that worker or stop it before restarting.':error.message||'unknown local startup error'));
  process.exitCode=1;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try {
    if(process.argv.slice(2).some(arg=>arg!=='--login'))throw Error('Usage: bootstrap.mjs [--login]');
    await bootstrap({login:process.argv.includes('--login')});
  }catch(error){startupFailure(error);}
}
