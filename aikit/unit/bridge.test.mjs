import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { Worker } from '../lib/worker.mjs';
import { parseIssue, validate } from '../lib/protocol.mjs';
import { lock, atomicJson, readJson } from '../lib/storage.mjs';
import { safeSummary, parsePlaywright } from '../lib/report.mjs';
import { parseChecklist, importChecklist, metrics } from '../lib/checklist.mjs';
import { CATEGORIES } from '../lib/config.mjs';
import { processCall } from '../lib/process.mjs';
import { consumeLanguageApproval } from '../lib/authorization.mjs';
import { recordReview } from '../lib/review.mjs';

const issue=(number=1,command='SAFE_CHECKS',params={})=>({number,title:`AIKIT-QA: ${command}`,user:{login:'Bequcho'},body:'AIKIT_QA_BRIDGE_V2\n'+JSON.stringify({version:2,command,params})});
class FakeGitHub {
  constructor(issues=[]) {this.queue=issues;this.posts=[];this.closed=[];}
  async issues(){return this.queue.filter(i=>!this.closed.includes(i.number));}
  async comments(n){return this.posts.filter(c=>c.number===n);}
  async comment(number,body){this.posts.push({number,body,user:{login:'Bequcho'}});}
  async close(n){this.closed.push(n);}
}
async function sandbox(t){const dir=await mkdtemp(resolve(tmpdir(),'aikit-test-'));t.after(()=>rm(dir,{recursive:true,force:true}));return dir;}
const execute=async(command,params,{runId})=>({runId,command,outcome:'COMPLETED',checks:[{status:'PASS',scenarioId:'public.home'}]});

test('strict envelope accepts v1, v2 and CRLF; untrusted authors are ignored',()=>{
  assert.equal(parseIssue(issue()).command,'SAFE_CHECKS');
  assert.equal(parseIssue({...issue(),title:'AIKIT-QA: PUBLIC_REMAINING',body:'AIKIT_QA_BRIDGE_V1\r\nTASK=PUBLIC_REMAINING'}).command,'PUBLIC_REMAINING');
  assert.equal(parseIssue({...issue(),user:{login:'outsider'}}),null);
  assert.equal(parseIssue({...issue(),pull_request:{}}),null);
});
test('code, shell arguments, arbitrary URLs, malformed JSON and extra fields are rejected',()=>{
  for(const command of ['node -e evil','../../evil','__proto__','RUN_SCENARIO;whoami']) assert.throws(()=>parseIssue(issue(1,command)));
  for(const params of [{scenarioId:'../../evil'},{scenarioId:'public.home',url:'https://evil.invalid'},{scenarioId:'public.home',locale:'en & whoami'},{scenarioId:'public.home',code:'process.exit()'}]) assert.throws(()=>validate('RUN_SCENARIO',params));
  assert.throws(()=>parseIssue({...issue(),body:'AIKIT_QA_BRIDGE_V2\n{broken'}));
  assert.throws(()=>validate('PUBLIC_ALL',{locale:'en'}));
});
test('exclusive lock rejects simultaneous processes and recovers a dead owner',async t=>{
  const dir=await sandbox(t),file=resolve(dir,'test.lock');
  const release=await lock(file);await assert.rejects(lock(file),/LOCK_ACTIVE/);await release();
  await atomicJson(file,{pid:2147483647,token:'dead'});const free=await lock(file);await free();
});
test('a task runs once across polling, restart, edits and reopening',async t=>{
  const local=await sandbox(t),github=new FakeGitHub([issue()]);let runs=0;
  const exec=async(...args)=>{runs++;return execute(...args);};
  let w=new Worker(github,{local,execute:exec});await w.load();await w.tick();await w.tick();
  github.closed=[];github.queue[0]=issue(1,'PUBLIC_ALL');w=new Worker(github,{local,execute:exec});await w.load();await w.tick();
  assert.equal(runs,1);assert.equal(github.posts.filter(c=>c.body.includes('aikit-result:')).length,1);
});
test('crash after remote result publication deduplicates comment and completes close',async t=>{
  const local=await sandbox(t),github=new FakeGitHub([issue()]);let crash=true,runs=0;
  const post=github.comment.bind(github);github.comment=async(n,b)=>{await post(n,b);if(crash&&b.includes('aikit-result:')){crash=false;throw Error('lost response');}};
  let w=new Worker(github,{local,execute:async(...args)=>{runs++;return execute(...args);}});await w.load();await assert.rejects(w.tick());
  w=new Worker(github,{local,execute});await w.load();await w.tick();
  assert.equal(runs,1);assert.equal(github.posts.filter(c=>c.body.includes('aikit-result:')).length,1);assert.deepEqual(github.closed,[1]);
});
test('close failure is recovered even if the issue is missing from the open list',async t=>{
  const local=await sandbox(t),github=new FakeGitHub([issue()]);let fail=true;
  github.close=async n=>{if(fail){fail=false;github.queue=[];throw Error('offline');}github.closed.push(n);};
  let w=new Worker(github,{local,execute});await w.load();await assert.rejects(w.tick());
  w=new Worker(github,{local,execute});await w.load();await w.tick();assert.deepEqual(github.closed,[1]);
});
test('restart converts running task to INTERRUPTED without executing; review is required',async t=>{
  const local=await sandbox(t),github=new FakeGitHub([issue()]);
  await atomicJson(resolve(local,'bridge-state.json'),{version:2,issues:{1:{stage:'running',runId:'abc',command:'SAFE_CHECKS'}}});
  const w=new Worker(github,{local,execute:()=>assert.fail('must not replay')});await w.load();await w.tick();
  assert.equal(w.state.issues[1].summary.outcome,'INTERRUPTED');assert.equal(w.state.paused,true);assert.equal(w.state.holdIssue,1);
});
test('remote claim prevents replay after local state loss',async t=>{
  const local=await sandbox(t),github=new FakeGitHub([issue()]);await github.comment(1,'<!-- aikit-claim:1:old -->');
  const w=new Worker(github,{local,execute:()=>assert.fail('must not replay')});await w.load();await w.tick();assert.equal(w.state.issues[1].recoveredRemoteReceipt,true);
});
test('unsupported command is reported REJECTED without launching a browser',async t=>{
  const local=await sandbox(t),github=new FakeGitHub([issue(1,'EXEC')]);
  const w=new Worker(github,{local,execute:()=>assert.fail('must not run')});await w.load();await w.tick();assert.equal(w.state.issues[1].summary.outcome,'REJECTED');
});
test('suspected failure pauses subsequent workflows; RESUME requires matching review',async t=>{
  const local=await sandbox(t),github=new FakeGitHub([issue(),issue(2)]);let runs=0;
  const w=new Worker(github,{local,execute:async(command,params,{runId})=>{runs++;return {runId,command,outcome:'REVIEW_REQUIRED',checks:[{status:'FAIL',suspected:true}]};}});
  await w.load();await w.tick();assert.equal(runs,1);assert.equal(w.state.holdIssue,1);
  github.queue.push(issue(3,'RESUME'));await w.tick();assert.equal(w.state.paused,true);
  github.queue.push(issue(4,'RESUME',{reviewIssue:1}));await w.tick();assert.equal(runs,2);
});
test('sanitization excludes browser text, errors, attachments, URLs and arbitrary progress',()=>{
  const result=safeSummary({runId:'id',command:'SAFE_CHECKS',outcome:'COMPLETED',checks:[{status:'PASS',actual:'secret@example.com',evidence:['cookie=secret'],url:'https://private.invalid',scenarioId:'public.home',locale:'en',reason:'ASSERTIONS_VERIFIED'}],progress:{total:99,secret:'password'}});
  assert.equal(JSON.stringify(result).includes('secret'),false);assert.equal(JSON.stringify(result).includes('private.invalid'),false);assert.equal(result.counts.PASS,1);
  assert.deepEqual(result.checkResults,[{scenarioId:'public.home',locale:'en',status:'PASS',reason:'ASSERTIONS_VERIFIED'}]);
});
test('skipped, interrupted and failed Playwright results cannot become PASS',()=>{
  for(const [status,expected] of [['passed','PASS'],['failed','FAIL'],['interrupted','BLOCKED'],['skipped','NOT TESTED'],[undefined,'NOT TESTED']]) {
    const report={suites:[{specs:[{title:'public.home [en]',tests:[{results:[{status}]}]}]}]};
    assert.equal(parsePlaywright(report)[0].status,expected);
  }
});
test('99 official scenarios are unique, complete and historical refresh preserves verified history',async t=>{
  const local=await sandbox(t),body=Object.entries(CATEGORIES).map(([category,count])=>`### ${category} (${count})\n`+Array.from({length:count},(_,i)=>`- [ ] **${i+1}.** Exact criterion ${i+1} — NOT TESTED`).join('\n')).join('\n');
  const source={body,source:'private-source',updatedAt:'2026-11-16',fetchedAt:'2026-11-16'};
  assert.equal(parseChecklist(source).length,99);let data=await importChecklist(source,local);
  data.scenarios[0].executionStatus='PASS';data.scenarios[0].history.push({kind:'verified',evidence:'local'});await atomicJson(resolve(local,'checklist.json'),data);
  data=await importChecklist(source,local);assert.equal(metrics(data).current.PASS,1);assert.equal(data.scenarios[0].history.length,2);
  assert.throws(()=>parseChecklist({...source,body:body.replace('### Site Plan (10)','### Site Plan (9)')}));
});
test('bounded process output and timeout prevent runaway execution',async()=>{
  const result=await processCall(process.execPath,['-e','process.stdout.write("x".repeat(300000))']);assert.equal(result.stdout.length,131072);
  const timeout=await processCall(process.execPath,['-e','setInterval(()=>{},1000)'],{timeout:100});assert.equal(timeout.code,124);
});
test('corrupt checkpoint fails closed rather than silently losing progress',async t=>{
  const local=await sandbox(t);await writeFile(resolve(local,'bridge-state.json'),'{broken');
  const w=new Worker(new FakeGitHub(),{local});await assert.rejects(w.load());assert.equal(await readFile(resolve(local,'bridge-state.json'),'utf8'),'{broken');
});
test('local preference authorization expires and is consumed before execution',async t=>{
  const local=await sandbox(t),file=resolve(local,'authorizations.json');
  const approval={scope:'signed-out-language-preference-only',host:'aikit.ai',remainingRuns:1,expiresAt:new Date(Date.now()+60000).toISOString(),locales:['en','ht']};
  await atomicJson(file,{languagePreference:approval});
  assert.equal(await consumeLanguageApproval(local,['zh-Hans']),false);
  assert.equal(await consumeLanguageApproval(local,['ht','en']),true);
  assert.equal(await consumeLanguageApproval(local,['ht']),false);
  await atomicJson(file,{languagePreference:{...approval,expiresAt:'2020-01-01'}});
  assert.equal(await consumeLanguageApproval(local,['en']),false);
});
test('official PASS requires reconciled criterion, explicit review and nonempty local evidence',async t=>{
  const local=await sandbox(t),id='official.languages.01';
  await atomicJson(resolve(local,'checklist.json'),{scenarios:[{id,objective:'Exact criterion',reconciled:true,sourceTruncated:false,executionStatus:'NOT TESTED',history:[]}]});
  const review={scenarioId:id,status:'PASS',actual:'Observed',steps:['Executed']};
  await assert.rejects(recordReview(review,local),/CRITERION_CHANGED/);
  const {createHash}=await import('node:crypto');review.criterionHash=createHash('sha256').update('Exact criterion').digest('hex');
  await assert.rejects(recordReview(review,local),/VERIFIED_EVIDENCE_REQUIRED/);
  review.expectedBehaviorVerified=true;review.reviewedByUser=true;review.evidence=['proof.txt'];
  await writeFile(resolve(local,'proof.txt'),'Actual observed evidence');
  assert.equal((await recordReview(review,local)).status,'PASS');
  const data=await readJson(resolve(local,'checklist.json'));assert.equal(data.scenarios[0].history[0].previousStatus,'NOT TESTED');assert.equal(data.scenarios[0].evidence[0].sha256.length,64);
});
test('remote PAUSE interrupts an active browser runner and blocks subsequent tasks',async t=>{
  const local=await sandbox(t),github=new FakeGitHub([issue()]);let aborted=false;
  const w=new Worker(github,{local,controlPollMs:5,execute:async(command,params,{runId,signal})=>{
    github.queue.push(issue(2,'PAUSE'));
    await new Promise(resolve=>signal.addEventListener('abort',()=>{aborted=true;resolve();},{once:true}));
    return {runId,command,outcome:'BLOCKED',checks:[{status:'BLOCKED'}]};
  }});
  await w.load();await w.tick();assert.equal(aborted,true);assert.equal(w.state.paused,true);
  await w.tick();assert.equal(w.state.issues[2].summary.outcome,'COMPLETED');
});
test('standalone confirmed-finding hold needs the exact reviewed run to resume',async t=>{
  const local=await sandbox(t),github=new FakeGitHub([issue(1,'RESUME')]),run='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  await atomicJson(resolve(local,'bridge-state.json'),{version:2,paused:true,holdRunId:run,issues:{}});
  const w=new Worker(github,{local,execute});await w.load();await w.tick();assert.equal(w.state.paused,true);
  github.queue.push(issue(2,'RESUME',{reviewRunId:run}));await w.tick();assert.equal(w.state.paused,false);
});
