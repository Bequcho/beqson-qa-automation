import {mkdir,copyFile,readFile} from 'node:fs/promises';
import {existsSync,constants} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {LOCAL,ROOT} from '../lib/config.mjs';
import {readJson,atomicJson} from '../lib/storage.mjs';
import {windowsPowerShell} from '../lib/executables.mjs';
import {processCall} from '../lib/process.mjs';

const previous=await readJson(resolve(LOCAL,'interactive-source.json'),null);
const source=resolve(process.env.AIKIT_QA_DATA_DIR||previous?.source||resolve(ROOT,'.aikit-local'));
if(source===LOCAL)throw Error('INTERACTIVE_STORAGE_MUST_BE_SEPARATE: use START-INTERACTIVE.cmd or set AIKIT_LOCAL_DIR to a dedicated .aikit-local directory.');
await mkdir(LOCAL,{recursive:true,mode:0o700});
if(process.platform==='win32') {
  const shell=windowsPowerShell();
  const result=await processCall(shell.path,['-NoProfile','-ExecutionPolicy','Bypass','-File',resolve(ROOT,'aikit/bridge/protect-storage.ps1'),'-EvidencePath',LOCAL],{env:shell.env,timeout:180_000});
  if(result.code)throw Error('INTERACTIVE_STORAGE_PERMISSION_CHECK_FAILED');
}
const state=await readJson(resolve(source,'checklist.json'));
if(state.scenarios?.length!==99)throw Error('SOURCE_CHECKLIST_INVALID');
if(!existsSync(resolve(source,'auth-state.json')))throw Error('LOCAL_LOGIN_REQUIRED: run the existing local LOGIN-AIKIT.cmd before starting the controller.');
const hashes={};
for(const name of ['auth-state.json','checklist.json']) {
  const bytes=await readFile(resolve(source,name));hashes[name]=createHash('sha256').update(bytes).digest('hex');
  if(!existsSync(resolve(LOCAL,name)))await copyFile(resolve(source,name),resolve(LOCAL,name),constants.COPYFILE_EXCL);
}
await atomicJson(resolve(LOCAL,'interactive-source.json'),{source,seededAt:new Date().toISOString(),sourceHashes:hashes,sourceFilesModified:false});
console.log('Interactive auth/checklist seed ready in separate protected local storage. Original QA files were not modified.');
