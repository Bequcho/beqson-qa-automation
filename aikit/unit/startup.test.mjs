import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { executableCandidates, findExecutable, gitEnvironment, withToolPath, windowsPowerShell } from '../lib/executables.mjs';
import { credential } from '../lib/github.mjs';

async function temporary(t) {
  const dir=await mkdtemp(join(tmpdir(),'aikit-startup-'));
  t.after(()=>rm(dir,{recursive:true,force:true}));return dir;
}
async function fixture(path){await mkdir(join(path,'..'),{recursive:true});await writeFile(path,'synthetic executable fixture');return path;}
const version=async()=>({code:0,stdout:'git version 2.56.0.windows.4\n',stderr:''});

test('missing PATH Git is recovered from the newest GitHub Desktop installation without Codex',async t=>{
  const root=await temporary(t),local=join(root,'local');
  await fixture(join(local,'GitHubDesktop/app-3.6.9/resources/app/git/cmd/git.exe'));
  const expected=await fixture(join(local,'GitHubDesktop/app-3.6.10/resources/app/git/cmd/git.exe'));
  const git=await findExecutable('git',{env:{Path:join(root,'windows'),LOCALAPPDATA:local},platform:'win32',home:root,run:version});
  assert.equal(git.path,expected);assert.equal(git.source,'GitHub Desktop');
});
test('installed GitHub Desktop is preferred over a transient Codex PATH entry',async t=>{
  const root=await temporary(t),local=join(root,'local'),cached=join(root,'codex-runtimes/git/cmd');
  await fixture(join(cached,'git.exe'));
  const desktop=await fixture(join(local,'GitHubDesktop/app-3.6.10/resources/app/git/cmd/git.exe'));
  const git=await findExecutable('git',{env:{PATH:cached,LOCALAPPDATA:local},platform:'win32',home:root,run:version});
  assert.equal(git.path,desktop);
});
test('broken newer Git installation falls back to the older working installation',async t=>{
  const root=await temporary(t),local=join(root,'local');
  const older=await fixture(join(local,'GitHubDesktop/app-3.6.9/resources/app/git/cmd/git.exe'));
  await fixture(join(local,'GitHubDesktop/app-3.6.10/resources/app/git/cmd/git.exe'));
  const git=await findExecutable('git',{env:{LOCALAPPDATA:local},platform:'win32',home:root,run:async path=>path===older?version():{code:1,stdout:'',stderr:''}});
  assert.equal(git.path,older);
});
test('executable overrides are absolute and validated; relative/current-directory tools are ignored',async t=>{
  const root=await temporary(t),exe=await fixture(join(root,'custom/git.exe'));
  const git=await findExecutable('git',{env:{AIKIT_GIT_EXE:exe},platform:'win32',home:root,run:version});
  assert.equal(git.path,exe);
  assert.throws(()=>executableCandidates('git',{env:{AIKIT_GIT_EXE:'relative/git.exe'}}),/INVALID_GIT_PATH/);
  assert.equal(executableCandidates('git',{env:{PATH:'.;relative'},platform:'win32',home:root}).some(c=>c.source==='PATH'),false);
  await assert.rejects(findExecutable('git',{env:{AIKIT_GIT_EXE:exe},run:async()=>({code:0,stdout:'not git'})}),/INVALID_GIT_EXECUTABLE/);
});
test('Windows credential-helper PATH contains the selected Git and has no duplicate Path/PATH keys',()=>{
  const original={Path:'normal-system-path',PATH:'stale-duplicate',KEEP:'unchanged'};
  const env=gitEnvironment({path:join(tmpdir(),'Git/cmd/git.exe')},original,'win32');
  assert.equal(Object.keys(env).filter(key=>key.toLowerCase()==='path').length,1);
  assert.equal(env.Path.startsWith(join(tmpdir(),'Git/cmd')+';'),true);
  assert.equal(env.Path.includes(join(tmpdir(),'Git/ucrt64/bin')),true);
  assert.equal(env.KEEP,'unchanged');assert.equal(original.PATH,'stale-duplicate');
  assert.equal(withToolPath({PATH:'/usr/bin'},['/opt/git'],'linux').PATH,'/opt/git:/usr/bin');
});
test('environment authentication works without Git or GitHub CLI',async()=>{
  const result=await credential({env:{GH_TOKEN:'synthetic-secret'},find:()=>assert.fail('No tool lookup needed')});
  assert.equal(result.token,'synthetic-secret');assert.equal(result.source,'GH_TOKEN environment');
});
test('built-in Windows PowerShell uses its own modules instead of an inherited PowerShell 7 module path',()=>{
  const original={SystemRoot:join(tmpdir(),'Windows'),PSModulePath:'incompatible-pwsh-modules',PSMODULEPATH:'duplicate',KEEP:'value'};
  const shell=windowsPowerShell(original);
  assert.equal(shell.path,join(original.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe'));
  assert.equal(shell.env.PSModulePath,join(original.SystemRoot,'System32/WindowsPowerShell/v1.0/Modules'));
  assert.equal(Object.keys(shell.env).filter(key=>key.toLowerCase()==='psmodulepath').length,1);
  assert.equal(shell.env.KEEP,'value');assert.equal(original.PSModulePath,'incompatible-pwsh-modules');
});
test('existing GitHub CLI authentication works without Git',async()=>{
  const result=await credential({env:{},find:async tool=>tool==='gh'?{path:'/installed/gh'}:null,run:async()=>({code:0,stdout:'synthetic-secret\n'})});
  assert.equal(result.source,'GitHub CLI');assert.equal(result.token,'synthetic-secret');
});
test('installed but unauthenticated CLI requests local sign-in rather than a Git installation',async()=>{
  await assert.rejects(credential({env:{},find:async tool=>tool==='gh'?{path:'/installed/gh'}:null,run:async()=>({code:1,stdout:'',stderr:''})}),error=>error.message.includes('gh auth login')&&error.message.includes('Git installation is not required'));
});
test('unauthenticated CLI falls back to the selected absolute Git and a noninteractive helper',async()=>{
  const calls=[];
  const result=await credential({env:{},find:async tool=>({path:'/installed/'+tool}),run:async(command,args,options)=>{
    calls.push({command,args,options});
    return command.endsWith('/gh')?{code:1,stdout:'',stderr:'synthetic-secret'}:{code:0,stdout:'username=owner\npassword=synthetic-secret\n',stderr:''};
  }});
  assert.equal(result.source,'Git credential helper');assert.equal(calls[1].command,'/installed/git');
  assert.deepEqual(calls[1].args,['credential','fill']);assert.equal(calls[1].options.env.GCM_INTERACTIVE,'Never');
  assert.equal(calls[1].options.env.GIT_TERMINAL_PROMPT,'0');
});
test('missing tools and missing stored credentials produce actionable errors without tokens or raw spawn failures',async()=>{
  await assert.rejects(credential({env:{},find:async()=>null}),/GITHUB_TOOLS_MISSING/);
  await assert.rejects(credential({env:{},find:async tool=>tool==='git'?{path:'/installed/git'}:null,run:async()=>({code:1,stdout:'',stderr:'synthetic-secret'})}),error=>error.message.includes('GITHUB_AUTH_REQUIRED')&&!error.message.includes('synthetic-secret'));
  await assert.rejects(credential({env:{},find:async tool=>tool==='git'?{path:'/installed/git'}:null,run:async()=>{throw Error('ENOENT synthetic-secret');}}),error=>error.message.includes('GITHUB_TOOL_START_FAILED')&&!error.message.includes('synthetic-secret')&&!error.message.includes('ENOENT'));
});
