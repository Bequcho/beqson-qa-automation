import {test} from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';import {readFile,mkdir} from 'node:fs/promises';import {join} from 'node:path';
import {retestFixture} from '../test-support/retests.mjs';import {publicRetests} from '../retests/privacy.mjs';import {atomicJson,readJson} from '../lib/storage.mjs';import {Worker} from '../lib/worker.mjs';import {RetestEngine} from '../retests/engine.mjs';
import {pathToFileURL} from 'node:url';

for(const broken of[false,true])test('actual localization fixture is '+(broken?'still broken':'fixed')+' rather than merely loadable',async t=>{
 const f=await retestFixture(t,{germanBroken:broken}),r=await f.engine().run('RETEST_ALL_LIVE');assert.equal(r.batch.rows[0].result.status,broken?'FAIL':'PASS');assert.ok(r.batch.rows[0].result.assertions.length>=4);assert.ok(r.batch.rows[0].result.actions.some(a=>a.op==='expand-faq'));assert.equal(f.counts.writes,0);
});
for(const broken of[false,true])test('mobile assistant fixture '+(broken?'regresses beyond the viewport':'fits after close and reopen')+' with component measurements',async t=>{
 const f=await retestFixture(t,{numbers:[389],mockWorkflows:true,editorBroken:broken}),r=await f.engine().run('RETEST_ALL_LIVE');assert.equal(r.batch.rows[0].result.status,broken?'FAIL':'PASS');assert.ok(r.batch.rows[0].result.actions.some(a=>a.op==='close-and-reopen-actual-assistant'));assert.equal(r.batch.rows[0].result.environment.viewport.width,390);assert.equal(f.counts.writes,0);
});
for(const broken of[false,true])test('real synthetic DOCX/PDF selection '+(broken?'detects lost paragraphs':'verifies preserved blocks and blank lines'),async t=>{
 const f=await retestFixture(t,{numbers:[465],mockWorkflows:true,docxBroken:broken}),r=await f.engine().run('RETEST_ALL_LIVE'),row=r.batch.rows[0];assert.equal(row.result.status,broken?'FAIL':'PASS');assert.equal(row.result.fixtureChecksums.length,2);assert.ok(row.result.assertions.length>=6);assert.equal(row.result.actions.filter(a=>a.op==='select-synthetic-fixture').length,2);assert.equal(f.counts.writes,0);
 const dir=join(f.local,'retests/batches',r.batch.id,'attempts',row.attemptId);assert.ok((await readFile(join(dir,'QA-import.docx'))).length>1000);assert.ok((await readFile(join(dir,'QA-import.pdf'))).subarray(0,5).toString()==='%PDF-');
});
for(const broken of[false,true])test('actual mock Writer UI '+(broken?'detects deleted content':'preserves source structure, entities and golden meaning'),async t=>{
 const f=await retestFixture(t,{numbers:[470],mockWorkflows:true,writerBroken:broken}),r=await f.engine().run('RETEST_ALL_LIVE'),row=r.batch.rows[0];assert.equal(row.result.status,broken?'FAIL':'PASS');assert.ok(row.result.actions.some(a=>a.op==='apply-mock-translation'));assert.equal(row.result.tokenUsage.liveGenerationExecuted,false);assert.equal(f.counts.writes,0);
});
test('missing report pages and expired grants are BLOCKED while unrelated safe tests continue',async t=>{
 const f=await retestFixture(t,{numbers:[435,465,470],mockWorkflows:true,missingNumbers:[435],expiredGrant:true}),r=await f.engine().run('RETEST_ALL_LIVE');assert.deepEqual(r.batch.rows.map(r=>r.result.status),['BLOCKED','BLOCKED','BLOCKED']);assert.equal(r.batch.rows[0].result.reason,'REPORT_UNAVAILABLE');assert.equal(r.batch.rows[1].result.reason,'EXPIRED_OR_REVOKED_GRANT');assert.equal(r.batch.rows[2].result.reason,'EXPIRED_OR_REVOKED_GRANT');assert.equal(f.counts.writes,0);
});
test('pagination, current eligibility, deduplication and safe resume retain completed passes after interruption',async t=>{
 const f=await retestFixture(t,{numbers:[433,435,453],pageSize:2}),first=await f.engine().run('RETEST_ALL_LIVE',{maxReports:1}),batch=first.batch;
 assert.equal(batch.rows[0].result.status,'REVIEW_REQUIRED');const doneAttempt=batch.rows[0].attemptId;
 batch.rows[1].stage='running';batch.rows[1].attemptId=randomUUID();await atomicJson(join(f.local,'retests/batches',batch.id,'batch.json'),batch);
 const resumed=await f.engine().run('RETEST_RESUME',{batchId:batch.id});assert.equal(resumed.batch.rows[0].attemptId,doneAttempt);assert.equal(resumed.batch.rows[1].result.reason,'INTERRUPTED_REVIEW_REQUIRED');assert.equal(resumed.batch.rows[2].result.status,'PASS');assert.equal(resumed.batch.stage,'complete');
 const requests={...f.counts.visits};await f.engine().run('RETEST_RESUME',{batchId:batch.id});assert.deepEqual(f.counts.visits,requests);
});
test('duplicate command ID cannot rerun a passed report and a smoke-only PASS becomes review required',async t=>{
 const f=await retestFixture(t),id=randomUUID(),first=await f.engine().run('RETEST_ALL_LIVE',{}, {runId:id});assert.equal(first.batch.rows[0].result.status,'PASS');const requests={...f.counts.visits};await f.engine().run('RETEST_ALL_LIVE',{}, {runId:id});assert.deepEqual(f.counts.visits,requests);
 const fake=new RetestEngine({local:f.local,controller:f.controller,budget:async()=>{},driverFactory:()=>({actions:[{op:'navigate'}],execute:async()=>({status:'PASS',executed:true,bugFixVerified:true,assertions:[],actions:[{op:'navigate'}]})})});
 const misleading=await fake.run('RETEST_REPORT',{reportNumber:435});assert.equal(misleading.batch.rows[0].result.status,'REVIEW_REQUIRED');assert.equal(misleading.batch.rows[0].result.reason,'NO_BUG_ASSERTIONS');
});
test('critical failure pauses the batch until a matching explicit review; ordinary linguistic review does not',async t=>{
 const f=await retestFixture(t,{numbers:[435,453],germanBroken:true,reportOverrides:{435:{severity:'High'}}}),runId=randomUUID(),r=await f.engine().run('RETEST_ALL_LIVE',{}, {runId,queueIssue:90});assert.equal(r.batch.stage,'paused');assert.equal(r.batch.rows[1].stage,'pending');
 assert.equal((await f.engine().run('RETEST_RESUME',{batchId:r.batch.id})).outcome,'BLOCKED');
 const resume=await f.engine().run('RETEST_RESUME',{batchId:r.batch.id},{review:{issue:90,runId}});assert.equal(resume.batch.stage,'complete');assert.equal(resume.batch.rows[1].result.status,'PASS');
});
test('existing Worker executes the new queue protocol end to end and never duplicates result comments',async t=>{
 const f=await retestFixture(t),issues=[{number:1,user:{login:'Bequcho'},title:'AIKIT-BROWSER: RETEST_ALL_LIVE',body:'AIKIT_QA_BRIDGE_V2\n{"version":2,"command":"RETEST_ALL_LIVE","params":{}}'}],comments=new Map();let calls=0;
 const github={verify:async()=>{},issues:async()=>issues.filter(i=>!i.closed),comments:async id=>comments.get(id)||[],comment:async(id,body)=>{comments.set(id,[...(comments.get(id)||[]),{body,user:{login:'Bequcho'}}])},close:async id=>{issues.find(i=>i.number===id).closed=true}};
 const execute=async(command,params,options)=>{calls++;const r=await f.engine().run(command,params,{...options,queueIssue:options.issueNumber});return {command,runId:options.runId,outcome:r.outcome,checks:[],retests:publicRetests(r.batch)}};
 const worker=new Worker(github,{local:f.local,lane:'browser',execute});await worker.load();await worker.tick();assert.equal(calls,1);assert.equal(issues[0].closed,true);
 const result=comments.get(1).find(c=>c.body.includes('aikit-result'));assert.ok(result.body.includes('"status":"PASS"'));assert.equal(result.body.includes('Dateien'),false);assert.equal(result.body.includes('private-trace'),false);
 issues[0].closed=false;const restarted=new Worker(github,{local:f.local,lane:'browser',execute});await restarted.load();await restarted.tick();assert.equal(calls,1);assert.equal(comments.get(1).filter(c=>c.body.includes('aikit-result')).length,1);
});
test('private dashboard escapes untrusted report markup and records real per-bug results separately from official checks',async t=>{
 const f=await retestFixture(t,{reportOverrides:{435:{title:'German <img src=x onerror="window.pwned=1">'}}}),r=await f.engine().run('RETEST_ALL_LIVE');const html=await readFile(join(f.local,'retests/dashboard.html'),'utf8');assert.ok(html.includes('&lt;img'));assert.ok(!html.includes('<img'));assert.ok(html.includes('Content-Security-Policy'));assert.ok(html.includes('official 99-item'));
 const s=publicRetests(r.batch);assert.equal(s.counts.PASS,1);assert.equal(s.officialItemsAutoCompleted,0);assert.equal(JSON.stringify(s).includes('window.pwned'),false);
 const context=await f.controller.browser.newContext();const page=await context.newPage();await page.goto(pathToFileURL(join(f.local,'retests/dashboard.html')).href);assert.equal(await page.locator('img').count(),0);assert.equal(await page.evaluate(()=>window.pwned),undefined);await page.locator('select[name="status"]').selectOption('FAIL');assert.equal(await page.locator('article[hidden]').count(),1);await context.close();
});
for(const missing of[false,true])test('upload-limit regression '+(missing?'fails when only the FAQ mentions the exception':'passes only when the included section and docs agree'),async t=>{
 const f=await retestFixture(t,{numbers:[384],limitMissingException:missing}),r=await f.engine().run('RETEST_REPORT',{reportNumber:384});assert.equal(r.batch.rows[0].result.status,missing?'FAIL':'PASS',r.batch.rows[0].result.reason);assert.equal(r.batch.rows[0].result.assertions.length,7);
});
test('discovery and individual probes cannot replace an incomplete batch or repeat its completed tests',async t=>{
 const f=await retestFixture(t,{numbers:[435,453]}),first=await f.engine().run('RETEST_ALL_LIVE',{maxReports:1}),attempt=first.batch.rows[0].attemptId;
 await f.engine().run('DISCOVER_RETESTS');assert.equal((await readJson(join(f.local,'retests/latest-batch.json'))).id,first.batch.id);
 await f.engine().run('RETEST_REPORT',{reportNumber:435});assert.equal((await readJson(join(f.local,'retests/latest-batch.json'))).id,first.batch.id);
 const resumed=await f.engine().run('RETEST_RESUME');assert.equal(resumed.batch.rows[0].attemptId,attempt);assert.equal(resumed.batch.rows[1].result.status,'PASS');
});
