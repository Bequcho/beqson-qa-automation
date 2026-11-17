import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { atomicJson, readJson } from './storage.mjs';
import { LOCAL, STATUSES, LOCALES } from './config.mjs';
import { safeBrowserResult } from '../browser/privacy.mjs';
import { sanitizeRetestSummary } from '../retests/privacy.mjs';

export function parsePlaywright(report) {
  const rows=[];
  function walk(suite) {
    for(const spec of suite.specs||[]) for(const test of spec.tests||[]) {
      const result=test.results?.at(-1),status=result?.status;
      const skip=test.annotations?.find(a=>a.type==='skip')?.description || '';
      const id=spec.title.match(/(?:public\.[a-z]+|auth\.projects)/)?.[0];
      const locale=spec.title.match(/\[([^\]]+)\]/)?.[1];
      if (!id) continue;
      rows.push({scenarioId:id,locale,
        status:status==='passed'?'PASS':!status?'NOT TESTED':status==='skipped'?(skip.startsWith('BLOCKED:')?'BLOCKED':'NOT TESTED'):status==='interrupted'?'BLOCKED':'FAIL',
        reason:!status?'NOT_EXECUTED':status==='skipped'?(skip.match(/^[A-Z _]+:([A-Z_]+)$/)?.[1]||'NOT_EXECUTED'):status==='passed'?'ASSERTIONS_VERIFIED':status==='interrupted'?'INTERRUPTED':'ASSERTION_REQUIRES_REVIEW',
        durationMs:result?.duration??0,expected:'All assertions and named steps in the registered TypeScript scenario succeed.',
        actual:status==='passed'?'All registered assertions succeeded.':status==='skipped'?skip:result?.error?.message||'Execution did not complete.',
        actions:(result?.steps||[]).map(s=>s.title),evidence:(result?.attachments||[]).map(a=>({name:a.name,path:a.path})),
        suspected:status==='failed'||status==='timedOut',confirmed:false
      });
    }
    for(const child of suite.suites||[]) walk(child);
  }
  for(const suite of report.suites||[]) walk(suite);
  return rows;
}
export const counts=rows=>Object.fromEntries(STATUSES.map(s=>[s,rows.filter(r=>r.status===s).length]));
// Explicit projection: browser text, errors, URLs, file paths, bug content and attachments NEVER leave the PC.
export function safeSummary(report) {
  const out={version:2,runId:report.runId,command:report.command,outcome:report.outcome,counts:counts(report.checks||[]),suspected:(report.checks||[]).filter(c=>c.suspected).length,confirmed:(report.checks||[]).filter(c=>c.confirmed).length,officialItemsAutoCompleted:0};
  if(report.browser)out.browser=safeBrowserResult(report.browser);
  if(report.retests)out.retests=sanitizeRetestSummary(report.retests);
  if(/^[a-f0-9-]{36}$/.test(report.resumedFrom||'')) out.resumedFrom=report.resumedFrom;
  out.checkResults=(report.checks||[]).map(check=>({
    scenarioId:/^(?:public\.[a-z]+|auth\.projects|official\.[a-z-]+\.\d{2}|runner|official)$/.test(check.scenarioId||'')?check.scenarioId:'runner',
    ...(LOCALES.includes(check.locale)?{locale:check.locale}:{}),
    status:STATUSES.includes(check.status)?check.status:'BLOCKED',
    reason:/^[A-Z_]+$/.test(check.reason||'')?check.reason:'REVIEW_LOCAL_EVIDENCE'
  }));
  if(report.progress) {
    const p=report.progress;
    out.progress={};
    for(const key of ['total','reconciled','truncated','liveChecked','confirmedFindings','suspectedFindings']) if(Number.isSafeInteger(p[key]) && p[key]>=0) out.progress[key]=p[key];
    for(const key of ['current','historical','latestCounts']) if(p[key]) out.progress[key]=Object.fromEntries(STATUSES.map(s=>[s,Number.isSafeInteger(p[key][s])?p[key][s]:0]));
    if(/^[a-f0-9-]{36}$/.test(p.latestRunId||'')) out.progress.latestRunId=p.latestRunId;
    if(['COMPLETED','BLOCKED','INCOMPLETE','REVIEW_REQUIRED','NO_RUN'].includes(p.latestOutcome)) out.progress.latestOutcome=p.latestOutcome;
  }
  if(report.blocked) out.blocked=report.blocked.map(s=>({id:s.id,reason:s.reason}));
  return out;
}
export async function trackFindings(report,local=LOCAL) {
  const file=resolve(local,'known-issues.json'),db=await readJson(file,{version:1,issues:[]});
  const checklist=await readJson(resolve(local,'checklist.json'),{scenarios:[]});
  for(const check of report.checks.filter(c=>c.suspected)) {
    const fingerprint=createHash('sha256').update(`${check.scenarioId}|${check.locale||''}|${String(check.actual).replace(/\d+/g,'#').slice(0,500)}`).digest('hex').slice(0,12);
    let issue=db.issues.find(i=>i.id===`BUG-${fingerprint}`);
    if(!issue) {issue={id:`BUG-${fingerprint}`,scenarioId:check.scenarioId,locale:check.locale,confirmed:false,externalReports:[],history:[]};db.issues.push(issue);}
    issue.history.push({runId:report.runId,status:check.status,at:report.finishedAt,evidence:check.evidence});
    const category=check.scenarioId.startsWith('public.')?'Languages':'Your websites';
    issue.existingReportEvidence=checklist.scenarios.filter(s=>s.category===category).map(s=>s.knownReportEvidence).filter(Boolean);
    issue.duplicateReviewRequired=true;
    // A failing assertion is only a suspected problem until evidence and existing reports are reviewed.
    issue.draft=`Title: Potential issue in ${check.scenarioId}\nSteps to reproduce:\n${check.actions.map((s,i)=>`${i+1}. ${s}`).join('\n')}\nExpected: ${check.expected}\nActual: ${check.actual}\nImpact: Requires verification.\nSeverity: Unassigned pending reproduction and review.\nCategory: ${check.scenarioId.startsWith('public.')?'Languages':'Your websites'}`;
  }
  if(report.params?.bugId) {
    const issue=db.issues.find(i=>i.id===report.params.bugId);
    if(issue) issue.history.push({kind:'retest',runId:report.runId,at:report.finishedAt,checks:report.checks.map(c=>({scenarioId:c.scenarioId,status:c.status}))});
  }
  await atomicJson(file,db);
}
