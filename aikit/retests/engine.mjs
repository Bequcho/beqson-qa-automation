import {resolve} from 'node:path';import {mkdir,writeFile} from 'node:fs/promises';import {randomUUID} from 'node:crypto';
import {atomicJson,readJson,lock} from '../lib/storage.mjs';import {checkBudget} from '../lib/budget.mjs';
import {ReportSource} from './source.mjs';import {Drivers} from './drivers.mjs';import {buildSpec} from './plans.mjs';import {validateRetest} from './protocol.mjs';import {safeRetestReason,publicRetests} from './privacy.mjs';import {dashboard} from './dashboard.mjs';
import {classifyBrowserError} from '../browser/diagnostics.mjs';
import {hasBugEvidence} from './evidence.mjs';

export class RetestEngine {
 constructor({local,controller,source,plan=buildSpec,driverFactory=(...args)=>new Drivers(...args),budget=checkBudget}={}){this.local=local;this.controller=controller;this.source=source||new ReportSource(controller,local);this.plan=plan;this.driverFactory=driverFactory;this.budget=budget;this.root=resolve(local,'retests');}
 async save(batch){batch.updatedAt=new Date().toISOString();await atomicJson(resolve(this.root,'batches',batch.id,'batch.json'),batch);if(!batch.keepLatest)await atomicJson(resolve(this.root,'latest-batch.json'),{id:batch.id});await dashboard(this.root,batch,{latest:!batch.keepLatest});}
 async recover(batch){for(const row of batch.rows.filter(r=>r.stage==='running')){const dir=resolve(this.root,'batches',batch.id,'attempts',row.attemptId),receipt=await readJson(resolve(dir,'result.json'),null);const valid=receipt?.version===1&&receipt.attemptId===row.attemptId&&receipt.reportId===row.id&&receipt.reportNumber===row.number&&receipt.result?.status&&(receipt.result.status!=='PASS'||hasBugEvidence(receipt.result));row.result=valid?receipt.result:{status:'BLOCKED',reason:'INTERRUPTED_REVIEW_REQUIRED',executed:false,assertions:[],bugFixVerified:false,at:new Date().toISOString()};if(valid&&!row.report)row.report=await readJson(resolve(dir,'original-report.json'),undefined);row.stage='done';await this.history(row)}await this.save(batch);}
 async history(row){const file=resolve(this.root,'history',row.id+'.json'),history=await readJson(file,{attempts:[]});if(!history.attempts.some(a=>a.attemptId===row.attemptId)){history.attempts.push({attemptId:row.attemptId,result:row.result,reportRevision:row.report?.revision});await atomicJson(file,history)}}
 async run(command,params={},options={}){
  validateRetest(command,params);await mkdir(this.root,{recursive:true,mode:0o700});
  const requestId=options.runId||randomUUID();if(!/^[a-f0-9-]{36}$/.test(requestId))throw Error('INVALID_RETEST_REQUEST');
  const release=await lock(resolve(this.root,'engine.lock'));
  const deadline=AbortSignal.timeout(240000),signal=options.signal?AbortSignal.any([options.signal,deadline]):deadline;
  let batch,active=false;const abort=()=>this.controller.close().catch(()=>{});
  try{
   const prior=await readJson(resolve(this.root,'requests',requestId+'.json'),null);
   if(prior){if(prior.command!==command||JSON.stringify(prior.params)!==JSON.stringify(params))throw Error('RETEST_REQUEST_SCOPE_MISMATCH');batch=await readJson(resolve(this.root,'batches',prior.batchId,'batch.json'));await this.recover(batch);return {outcome:batch.stage==='complete'?'COMPLETED':'INCOMPLETE',batch};}
   if(['RETEST_RESUME','RETEST_STATUS'].includes(command)){
    const id=params.batchId||(await readJson(resolve(this.root,'latest-batch.json'),{})).id;if(!id)throw Error('RETEST_BATCH_NOT_FOUND');batch=await readJson(resolve(this.root,'batches',id,'batch.json'));await this.recover(batch);
    if(command==='RETEST_STATUS')return {outcome:'COMPLETED',batch};
    if(batch.stage==='paused'){if(options.review?.issue!==batch.pauseIssue||options.review?.runId!==batch.pauseRunId)return {outcome:'BLOCKED',batch};batch.stage='incomplete';}
    if(params.retryBlocked)for(const row of batch.rows)if(row.result?.status==='BLOCKED'){row.stage='pending';row.result=null;row.attemptId=null}
   }else{
    const latestId=(await readJson(resolve(this.root,'latest-batch.json'),{})).id;const current=latestId?await readJson(resolve(this.root,'batches',latestId,'batch.json'),null):null;
    const unfinished=current&&current.stage!=='complete'&&current.rows.some(r=>r.stage!=='pending');
    if(command==='RETEST_ALL_LIVE'&&unfinished){await this.recover(current);return {outcome:'INCOMPLETE',batch:current};}
    if(this.controller.busy)throw Error('BROWSER_BUSY');this.controller.busy=true;active=true;signal.addEventListener('abort',abort,{once:true});
    await this.budget(this.local);await this.source.ready();const discoveryId=randomUUID();let inventory;
    await this.controller.context.tracing.start({screenshots:true,snapshots:true});
    try{inventory=await this.source.discover({signal});await this.controller.page.screenshot({path:resolve(this.root,'discovery-'+discoveryId+'.png')});}
    finally{await this.controller.context.tracing.stop({path:resolve(this.root,'discovery-'+discoveryId+'.zip')}).catch(()=>{});}
    const cards=command==='RETEST_REPORT'?inventory.reports.filter(r=>r.number===params.reportNumber):inventory.reports.filter(r=>r.status==='LIVE');
    if(command==='RETEST_REPORT'&&!cards.length)throw Error('REPORT_UNAVAILABLE');
    batch={version:1,id:randomUUID(),createdAt:new Date().toISOString(),stage:'ready',keepLatest:!!unfinished&&command!=='RETEST_ALL_LIVE',eligibleCount:inventory.reports.filter(r=>r.status==='LIVE').length,discoveryComplete:inventory.complete,statusCoverageComplete:inventory.reports.every(r=>r.status!=='UNKNOWN'),explicitReport:command==='RETEST_REPORT',rows:cards.map(card=>({...card,stage:'pending',result:null,attemptId:null,queueIssue:options.queueIssue}))};
    await this.save(batch);
    if(command==='DISCOVER_RETESTS')return {outcome:'COMPLETED',batch};
   }
   await atomicJson(resolve(this.root,'requests',requestId+'.json'),{batchId:batch.id,command,params});
   if(!active){if(this.controller.busy)throw Error('BROWSER_BUSY');this.controller.busy=true;active=true;signal.addEventListener('abort',abort,{once:true});await this.source.ready();}
   batch.stage='running';await this.save(batch);let attempted=0;
   for(const row of batch.rows.filter(r=>r.stage==='pending')){
    if(signal.aborted||attempted>=(params.maxReports||30))break;attempted++;
    row.attemptId=randomUUID();row.stage='running';row.queueIssue=options.queueIssue||row.queueIssue;await this.save(batch);
    const dir=resolve(this.root,'batches',batch.id,'attempts',row.attemptId);await mkdir(dir,{recursive:true,mode:0o700});let tracing=false,driver;
    try{
     await this.budget(this.local);await this.controller.ensure();await this.controller.context.tracing.start({screenshots:true,snapshots:true});tracing=true;
     row.report=await this.source.read(row);await atomicJson(resolve(dir,'original-report.json'),row.report);await this.controller.page.screenshot({path:resolve(dir,'report-ui.png')});
     if(row.report.status!=='LIVE'&&!batch.explicitReport)row.result={status:'BLOCKED',reason:'STATUS_NO_LONGER_ELIGIBLE',executed:false,assertions:[]};
     else{const spec=this.plan(row.report);await atomicJson(resolve(dir,'spec.json'),spec);driver=this.driverFactory(this.controller,dir,{signal});row.result=await driver.execute(spec,row.report)}
    }catch(error){row.result={status:'BLOCKED',reason:signal.aborted?'INTERRUPTED_REVIEW_REQUIRED':safeRetestReason(/^[A-Z_]+$/.test(error.message)?error.message:classifyBrowserError(error)),executed:(driver?.actions.length||0)>0,technicalSuccess:false,actions:driver?.actions||[],assertions:driver?.assertions||[],spec:driver?.spec,bugFixVerified:false};await writeFile(resolve(dir,'private-error.txt'),String(error.stack||error),{mode:0o600})}
    finally{await driver?.close?.().catch(()=>{});if(tracing)await this.controller.context?.tracing.stop({path:resolve(dir,'private-report-trace.zip')}).catch(()=>{});await this.controller.persist().catch(()=>{});}
    row.result.bugFixVerified=row.result.status==='PASS'&&hasBugEvidence(row.result);if(row.result.status==='PASS'&&!row.result.bugFixVerified){row.result.status='REVIEW_REQUIRED';row.result.reason=row.result.assertions?.length?'BUG_ASSERTION_COVERAGE_MISSING':'NO_BUG_ASSERTIONS'}
    row.result.at=new Date().toISOString();row.result.environment||={browser:'Chromium',version:this.controller.browser?.version(),viewport:this.controller.page?.viewportSize(),platform:process.platform};
    await writeFile(resolve(dir,'retest-note.txt'),`Report #${row.number}\nRetest: ${row.result.status}\nReason: ${row.result.reason}\n\nOriginal steps:\n${row.report?.steps||'Source unavailable'}\n\nExpected:\n${row.report?.expected||'Source unavailable'}\n\nAssertions actually executed:\n${(row.result.assertions||[]).map(a=>a.id+': '+a.passed+' | '+JSON.stringify(a.actual)).join('\n')}\n\nNo aiKit report status was changed. Evidence remains local.\n`,{mode:0o600});
    await atomicJson(resolve(dir,'result.json'),{version:1,attemptId:row.attemptId,reportId:row.id,reportNumber:row.number,result:row.result});row.stage='done';await this.history(row);
    if(row.result.status==='FAIL'&&['critical','high'].includes(row.report?.severity)){batch.stage='paused';batch.pauseIssue=options.queueIssue;batch.pauseRunId=requestId;await this.save(batch);break}
    await this.save(batch);
   }
   if(batch.stage!=='paused')batch.stage=batch.rows.some(r=>r.stage==='pending')?'incomplete':'complete';await this.save(batch);
   return {outcome:batch.stage==='paused'?'REVIEW_REQUIRED':batch.stage==='complete'?'COMPLETED':'INCOMPLETE',batch};
  }catch(error){const dir=resolve(this.root,'errors',requestId);await mkdir(dir,{recursive:true,mode:0o700});await writeFile(resolve(dir,'private-error.txt'),String(error.stack||error),{mode:0o600});await this.controller.page?.screenshot({path:resolve(dir,'source-ui.png'),timeout:3000}).catch(()=>{});throw error;}
  finally{this.source.close?.();signal.removeEventListener('abort',abort);if(active)this.controller.busy=false;await release()}
 }
}
export async function runRetestCommand(command,params,{local,controller,...options}){
 try{const result=await new RetestEngine({local,controller}).run(command,params,options);return {...result,retests:publicRetests(result.batch)}}
 catch(error){return {outcome:'BLOCKED',retests:{kind:'BUG_RETESTS',stage:'incomplete',reason:safeRetestReason(/^[A-Z_]+$/.test(error.message)?error.message:classifyBrowserError(error)),rows:[],counts:{PASS:0,FAIL:0,BLOCKED:0,REVIEW_REQUIRED:0,'NOT TESTED':0},officialItemsAutoCompleted:0}}}
}
