import { statSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { processCall } from './process.mjs';

const fileExists=path=>{try{return statSync(path).isFile();}catch{return false;}};
const envValue=(env,name)=>Object.entries(env).find(([key])=>key.toLowerCase()===name.toLowerCase())?.[1];

export function withToolPath(env,directories,platform=process.platform) {
  const result={...env},delimiter=platform==='win32'?';':':';
  const oldPath=envValue(env,'PATH')||'';
  // Windows treats Path/PATH as one variable; Node may otherwise select the wrong duplicate.
  for(const key of Object.keys(result)) if(key.toLowerCase()==='path') delete result[key];
  result[platform==='win32'?'Path':'PATH']=[...new Set([...directories,...oldPath.split(delimiter)].filter(Boolean))].join(delimiter);
  return result;
}

export function executableCandidates(tool,{env=process.env,platform=process.platform,home=homedir()}={}) {
  if(!['git','gh'].includes(tool)) throw Error('UNSUPPORTED_LOCAL_TOOL');
  const windows=platform==='win32',name=tool+(windows?'.exe':'');
  const configured=envValue(env,tool==='git'?'AIKIT_GIT_EXE':'AIKIT_GH_EXE');
  if(configured) {
    if(!isAbsolute(configured)||!fileExists(configured)) throw Error(`INVALID_${tool.toUpperCase()}_PATH: the configured executable must be an existing absolute file path.`);
    return [{path:resolve(configured),source:'explicit override'}];
  }
  const result=[],add=(path,source)=>{if(path)result.push({path,source});};
  const pathEntries=(envValue(env,'PATH')||'').split(windows?';':':').map(path=>path.replace(/^"|"$/g,'')).filter(path=>path&&isAbsolute(path));
  const transient=path=>/[\\/]codex-runtimes[\\/]/i.test(path);
  for(const entry of pathEntries.filter(path=>!transient(path))) add(join(entry,name),'PATH');
  if(windows) {
    const local=envValue(env,'LOCALAPPDATA'),programs=[envValue(env,'ProgramW6432'),envValue(env,'ProgramFiles'),envValue(env,'ProgramFiles(x86)')].filter(Boolean);
    for(const root of new Set(programs)) add(join(root,tool==='git'?'Git/cmd/git.exe':'GitHub CLI/gh.exe'),'installed application');
    if(local) {
      add(join(local,'Programs',tool==='git'?'Git/cmd/git.exe':'GitHub CLI/gh.exe'),'per-user installation');
      add(join(local,'Microsoft/WinGet/Links',name),'WinGet application link');
      if(tool==='git') {
        const desktop=join(local,'GitHubDesktop');
        let versions=[];try{versions=readdirSync(desktop,{withFileTypes:true}).filter(entry=>entry.isDirectory()&&/^app-\d+(?:\.\d+)+(?:-[a-z0-9.-]+)?$/i.test(entry.name)).map(entry=>entry.name).sort((a,b)=>b.localeCompare(a,undefined,{numeric:true}));}catch{}
        for(const version of versions) add(join(desktop,version,'resources/app/git/cmd/git.exe'),'GitHub Desktop');
      }
    }
  }
  for(const entry of pathEntries.filter(transient)) add(join(entry,name),'existing Codex runtime fallback');
  // An existing cache can be used as a final fallback; GitHub Desktop is preferred and rediscovered after updates.
  if(windows&&tool==='git') add(join(home,'.cache/codex-runtimes/codex-primary-runtime/dependencies/native/git/cmd/git.exe'),'existing Codex runtime fallback');
  const seen=new Set();
  return result.filter(candidate=>{const key=windows?candidate.path.toLowerCase():candidate.path;if(seen.has(key))return false;seen.add(key);return true;});
}

export async function findExecutable(tool,options={}) {
  const run=options.run||processCall,env=options.env||process.env;
  for(const candidate of executableCandidates(tool,options)) {
    if(!fileExists(candidate.path))continue;
    try {
      const result=await run(candidate.path,['--version'],{env,timeout:5000});
      const version=result.stdout.match(tool==='git'?/^git version ([\w.+-]+)/m:/^gh version ([\w.+-]+)/m)?.[1];
      if(result.code===0&&version)return {...candidate,version};
    } catch {}
  }
  if(envValue(env,tool==='git'?'AIKIT_GIT_EXE':'AIKIT_GH_EXE')) throw Error(`INVALID_${tool.toUpperCase()}_EXECUTABLE: the configured file could not run its version check.`);
  return null;
}

export function gitEnvironment(git,env=process.env,platform=process.platform) {
  if(platform!=='win32')return env;
  const root=dirname(dirname(git.path));
  return withToolPath(env,[dirname(git.path),join(root,'ucrt64/bin'),join(root,'mingw64/bin')],platform);
}

export function windowsPowerShell(env=process.env) {
  const path=join(envValue(env,'SystemRoot')||'C:\\Windows','System32/WindowsPowerShell/v1.0/powershell.exe');
  const child={...env};
  // A Node child does not get pwsh's automatic PS7 -> Windows PowerShell module-path cleanup.
  for(const key of Object.keys(child)) if(key.toLowerCase()==='psmodulepath')delete child[key];
  child.PSModulePath=join(dirname(path),'Modules');
  return {path,env:child};
}
