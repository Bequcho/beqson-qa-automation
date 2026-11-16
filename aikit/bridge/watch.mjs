import {spawn} from 'node:child_process';
import {mkdir,readFile,writeFile,rename,rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const repo='Bequcho/beqson-qa-platform'; // PRIVATE queue
const actor='Bequcho';
const marker='AIKIT_QA_BRIDGE_V1';
const root=resolve(fileURLToPath(new URL('../../',import.meta.url)));
const local=resolve(root,'.aikit-local');
const stateFile=resolve(local,'bridge-state.json');
const tasks=Object.freeze({
 PUBLIC_REMAINING:['aikit/qa.mjs'],
 PUBLIC_ALL:['aikit/qa.mjs','--all'],
 AUTH_SMOKE:['aikit/bridge/auth-smoke.mjs']
});
const gh=process.platform==='win32'?'gh.exe':'gh';
async function processCall(cmd,args,timeout=1200000){
 return await new Promise((ok,fail)=>{
  const child=spawn(cmd,args,{cwd:root,shell:false,windowsHide:true,stdio:['ignore','pipe','pipe']});
  let stdout='',stderr='',expired=false,done=false;
  const timer=setTimeout(()=>{expired=true;child.kill();},timeout);
  child.stdout.on('data',b=>{stdout+=b.toString()});
  child.stderr.on('data',b=>{stderr+=b.toString()});
  child.on('error',e=>{if(!done){done=true;clearTimeout(timer);fail(e)}});
  child.on('close',code=>{if(!done){done=true;clearTimeout(timer);ok({code:expired?124:(code??1),stdout,stderr})}});
 });
}
async function ghCall(args){
 const r=await processCall(gh,args,60000);
 if(r.code!==0)throw Error('GitHub CLI: '+r.stderr.slice(0,300));
 return r.stdout;
}
async function load(){
 try{return JSON.parse(await readFile(stateFile,'utf8'))}
 catch(e){if(e.code==='ENOENT')return {version:1,issues:{}};throw e}
}
async function save(state){
 await writeFile(stateFile+'.tmp',JSON.stringify(state,null,2),{mode:0o600});
 await rename(stateFile+'.tmp',stateFile);
}
function accepted(issue){
 if(issue.author?.login!==actor)return null;
 if(!Number.isSafeInteger(issue.number))return null;
 if(!issue.title?.startsWith('AIKIT-QA: '))return null;
 const task=issue.title.slice('AIKIT-QA: '.length);
 if(!Object.hasOwn(tasks,task))return null;
 if(issue.body?.trim()!==marker+'\nTASK='+task)return null;
 return task;
}
async function summary(task,exit){
 if(task==='AUTH_SMOKE'){
  try{
   const data=JSON.parse(await readFile(resolve(local,'auth-smoke.json'),'utf8'));
   return 'AUTH_SMOKE | exit='+exit+'\nAuthenticated session: '+(data.authenticated?'CONFIRMED':'NOT CONFIRMED')+
    '\nExisting QA project: '+(data.projectVisible?'VISIBLE':'NOT CONFIRMED')+
    '\nPrivate detailed evidence remains on the local PC.';
  }catch{return 'AUTH_SMOKE | exit='+exit+'\nLocal report unavailable'}
 }
 try{
  const data=JSON.parse(await readFile(resolve(root,'aikit-qa-results/report.json'),'utf8'));
  const counts={PASS:0,FAIL:0,NOT_TESTED:0};
  const findings=[];
  for(const lang of data.results||[]){
   for(const check of lang.checks||[]){
    if(Object.hasOwn(counts,check.status))counts[check.status]++;
    if(check.status==='FAIL')findings.push(lang.locale+' | '+check.name+' | '+String(check.evidence??'').slice(0,130));
   }
  }
  return task+' | exit='+exit+'\nLocales: '+(data.results||[]).length+
   '\nPASS checks: '+counts.PASS+'\nFAIL checks: '+counts.FAIL+
   '\nNOT TESTED: '+counts.NOT_TESTED+
   '\nAutomated failure observations (require manual confirmation):\n'+(findings.length?findings.slice(0,20).join('\n'):'none')+
   '\nFull results are local: aikit-qa-results/report.json\nNo official Round 2 item is automatically marked PASS.';
 }catch{return task+' | exit='+exit+'\nLocal report unavailable'}
}
async function publish(issue,state){
 const id=String(issue.number),value=state.issues[id];
 if(value.stage!=='report_ready')return;
 await ghCall(['issue','comment',id,'-R',repo,'--body','[aiKit QA Bridge result]\n'+value.summary]);
 value.stage='reported';await save(state);
 await ghCall(['issue','close',id,'-R',repo,'--reason','completed']);
 value.stage='done';await save(state);
 console.log('Result published to private GitHub issue #'+id);
}
async function work(state){
 const list=JSON.parse(await ghCall(['issue','list','-R',repo,'--state','open','--limit','100','--json','number,title,body,author']));
 for(const issue of list){
  const task=accepted(issue);if(!task)continue;
  const id=String(issue.number),previous=state.issues[id];
  if(previous?.stage==='report_ready'){await publish(issue,state);continue}
  if(previous)continue; // safety: never re-run a partially completed task
  state.issues[id]={task,stage:'running',started:new Date().toISOString()};
  await save(state);
  // Never summarize stale reports left by a previous run.
  await rm(task==='AUTH_SMOKE'?resolve(local,'auth-smoke.json'):resolve(root,'aikit-qa-results/report.json'),{force:true});
  console.log('Running '+task+' (#'+id+')');
  let result;
  try{result=await processCall(process.execPath,tasks[task],task==='PUBLIC_ALL'?1500000:900000)}
  catch(e){result={code:1,stderr:String(e)}}
  state.issues[id]={...state.issues[id],stage:'report_ready',finished:new Date().toISOString(),
   summary:await summary(task,result.code)};
  await save(state);
  console.log((result.stdout||'').slice(-1600));
  if(result.stderr)console.error('QA stderr:',result.stderr.slice(-600));
  await publish(issue,state);
 }
}
await mkdir(local,{recursive:true,mode:0o700});
const user=JSON.parse(await ghCall(['api','user']));
if(user.login!==actor)throw Error('GitHub CLI account must be Bequcho.');
let state=await load();
console.log('aiKit Bridge ready; private queue '+repo+'. Ctrl+C to stop.');
console.log('Accepted commands: '+Object.keys(tasks).join(', '));
while(true){
 try{await work(state)}catch(e){console.error('Bridge error:',e.message)}
 await new Promise(ok=>setTimeout(ok,30000));
 state=await load();
}