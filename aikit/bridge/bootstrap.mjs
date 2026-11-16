import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { ROOT, LOCAL } from '../lib/config.mjs';
import { processCall } from '../lib/process.mjs';
import { GitHub } from '../lib/github.mjs';
import { atomicJson } from '../lib/storage.mjs';
import { importChecklist } from '../lib/checklist.mjs';

if(Number(process.versions.node.split('.')[0])<24) throw Error('Node.js 24 or newer is required.');
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
  const shell=await processCall('where.exe',['pwsh.exe']);
  const acl=await processCall(shell.code===0?'pwsh.exe':'powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',resolve(ROOT,'aikit/bridge/protect-storage.ps1'),'-EvidencePath',LOCAL]);
  if(acl.code) throw Error('Cannot restrict local evidence permissions.');
}
if(!process.argv.includes('--login')) {
  const github=await GitHub.connect(),issue=await github.request('/repos/Bequcho/beqson-qa-platform/issues/2');
  const source={source:issue.html_url,body:issue.body,updatedAt:issue.updated_at,fetchedAt:new Date().toISOString()};
  await atomicJson(resolve(LOCAL,'checklist-source.json'),source);await importChecklist(source);
}
console.log('Validated Node, locked dependencies, Chromium and private local storage.');
