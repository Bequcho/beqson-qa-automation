import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { ROOT, LOCAL, LOCALES } from './config.mjs';
import { atomicJson, readJson, lock } from './storage.mjs';
import { processCall } from './process.mjs';
import { validate, CONTROLS } from './protocol.mjs';
import { getChecklist, metrics, officialAttempt } from './checklist.mjs';
import { parsePlaywright, counts, trackFindings } from './report.mjs';
import { consumeLanguageApproval } from './authorization.mjs';
import { checkBudget } from './budget.mjs';

export async function runCommand(command,params={},options={}) {
  validate(command,params);
  const local=options.local||LOCAL,runId=options.runId||randomUUID(),dir=resolve(local,'runs',runId);
  await mkdir(dir,{recursive:true,mode:0o700});
  const release=await lock(resolve(local,'execution.lock'));
  const report={version:2,runId,command,params,startedAt:new Date().toISOString(),finishedAt:null,outcome:'BLOCKED',checks:[]};
  try {
    const checklist=await getChecklist(local);
    if(command==='PROGRESS') {
      const known=await readJson(resolve(local,'known-issues.json'),{issues:[]});
      report.progress={...(checklist?metrics(checklist):{total:0}),confirmedFindings:known.issues.filter(i=>i.confirmed).length,suspectedFindings:known.issues.filter(i=>!i.confirmed&&!i.disposition).length};report.outcome='COMPLETED';
    }
    else if(command==='BLOCKED') {
      report.blocked=checklist?.scenarios.filter(s=>!['PASS','FAIL'].includes(s.executionStatus)).map(s=>({id:s.id,reason:!s.reconciled?'RECONCILIATION_REQUIRED':s.sourceTruncated?'FULL_CRITERION_REQUIRED':'MANUAL_WORKFLOW_AND_SCOPED_AUTHORIZATION_REQUIRED'}))||[];report.outcome='COMPLETED';
    } else if(command==='LATEST') {const latest=await readJson(resolve(local,'latest.json'),null);report.progress={latestRunId:latest?.runId||null,latestOutcome:latest?.outcome||'NO_RUN',latestCounts:latest?.counts};report.outcome='COMPLETED';}
    else {
      let scenario=params.scenarioId,retestLocale;
      if(command==='RETEST') {
        const db=await readJson(resolve(local,'known-issues.json'),{issues:[]});
        const finding=db.issues.find(i=>i.id===params.bugId && i.scenarioId===scenario);
        if(!finding) throw Error('UNKNOWN_OR_MISMATCHED_BUG');
        retestLocale=finding.locale;
      }
      if(['RUN_NEXT','RESUME_CHECKLIST','TEST_TOOL'].includes(command)) scenario=checklist?.scenarios.find(s=>(!params.category || s.category===params.category) && s.executionStatus==='NOT TESTED' && s.attempts.at(-1)?.status!=='BLOCKED')?.id;
      if(scenario?.startsWith('official.')) report.checks.push(await officialAttempt(scenario,runId,local));
      else if(['RUN_NEXT','RESUME_CHECKLIST','TEST_TOOL'].includes(command)) report.checks.push({scenarioId:'official',status:'BLOCKED',reason:'NO_PENDING_IMPORTED_SCENARIO'});
      else {
        await checkBudget(local);
        const auth=command==='AUTH_SMOKE' || scenario==='auth.projects';
        const locales=['PUBLIC_ALL','SAFE_CHECKS'].includes(command)?LOCALES:command==='PUBLIC_REMAINING'?['ht','zh-Hans','zh-Hant','ja','ko']:[retestLocale||params.locale||'en'];
        const languageAllowed=!auth && command!=='SAFE_CHECKS' && (!scenario || scenario==='public.locale') && await consumeLanguageApproval(local,locales);
        const child=await processCall(process.execPath,[resolve(ROOT,'node_modules/@playwright/test/cli.js'),'test','--config',resolve(ROOT,'aikit/playwright.config.ts'),auth?'auth.spec.ts':'public.spec.ts'],{
          cwd:ROOT,timeout:['PUBLIC_ALL','SAFE_CHECKS'].includes(command)?1_200_000:480_000,signal:options.signal,
          env:{...process.env,AIKIT_LOCAL_DIR:local,AIKIT_RUN_DIR:dir,AIKIT_SCENARIO:scenario||'',AIKIT_LOCALES:locales.join(','),AIKIT_PUBLIC_SAFE_ONLY:command==='SAFE_CHECKS'?'1':'0',AIKIT_ALLOW_LANGUAGE_PREFERENCE:languageAllowed?'1':'0'}
        });
        await writeFile(resolve(dir,'process.log'),child.stdout+'\n'+child.stderr,{mode:0o600});
        const raw=await readJson(resolve(dir,'playwright.json'),null);
        if(raw) report.checks=parsePlaywright(raw);
        if(!report.checks.length || child.code===124 || child.code===130 || (raw?.errors?.length && !report.checks.some(c=>c.status==='FAIL'))) report.checks.push({scenarioId:scenario||'runner',status:'BLOCKED',reason:child.code===124?'EXECUTION_TIMEOUT':child.code===130?'INTERRUPTED':'RUNNER_ERROR'});
        // Nonzero exit without a failed or blocked case is never a successful run.
        if(child.code!==0 && !report.checks.some(c=>['FAIL','BLOCKED'].includes(c.status))) report.checks.push({scenarioId:'runner',status:'BLOCKED',reason:'RUNNER_EXIT_NONZERO'});
      }
      report.outcome=report.checks.some(c=>c.status==='FAIL')?'REVIEW_REQUIRED':report.checks.some(c=>c.status==='BLOCKED')?'BLOCKED':report.checks.some(c=>c.status==='NOT TESTED')?'INCOMPLETE':'COMPLETED';
    }
  } catch(error) {
    report.checks.push({scenarioId:'runner',status:'BLOCKED',reason:'LOCAL_EXECUTION_ERROR',actual:String(error.message)});
  } finally {
    try {
    report.finishedAt=new Date().toISOString();
    await atomicJson(resolve(dir,'report.json'),report);
    await writeFile(resolve(dir,'report.md'),`# aiKit QA run ${runId}\n\nCommand: ${command}\nOutcome: ${report.outcome}\n\n${report.checks.map(c=>`- ${c.status} | ${c.scenarioId} | ${c.reason}`).join('\n')}\n\nOfficial checklist items automatically completed: 0\n`,{mode:0o600});
    await trackFindings(report,local);
    if(!CONTROLS.has(command)) await atomicJson(resolve(local,'latest.json'),{runId,outcome:report.outcome,counts:counts(report.checks),finishedAt:report.finishedAt});
    } finally {await release();}
  }
  return report;
}
