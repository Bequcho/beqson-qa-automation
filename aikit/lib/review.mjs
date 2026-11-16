import { resolve, relative, isAbsolute } from 'node:path';
import { realpath, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { getChecklist } from './checklist.mjs';
import { atomicJson, lock } from './storage.mjs';
import { LOCAL, STATUSES } from './config.mjs';

export async function recordReview(review,local=LOCAL) {
  const release=await lock(resolve(local,'execution.lock'));
  try {
    const checklist=await getChecklist(local),item=checklist?.scenarios.find(s=>s.id===review.scenarioId);
    if(!item || !STATUSES.includes(review.status) || typeof review.actual!=='string' || !review.actual.trim() || !Array.isArray(review.steps) || !review.steps.length) throw Error('INVALID_REVIEW');
    if(!item.reconciled || item.sourceTruncated) throw Error('FULL_RECONCILED_CRITERION_REQUIRED');
    const hash=createHash('sha256').update(item.objective).digest('hex');
    if(review.criterionHash!==hash) throw Error('CRITERION_CHANGED');
    if(['PASS','FAIL'].includes(review.status) && (review.expectedBehaviorVerified!==true || !Array.isArray(review.evidence) || !review.evidence.length || review.reviewedByUser!==true)) throw Error('VERIFIED_EVIDENCE_REQUIRED');
    if(review.status==='BLOCKED' && !review.blocker) throw Error('SPECIFIC_BLOCKER_REQUIRED');
    const root=await realpath(local),evidence=[];
    for(const entry of review.evidence||[]) {
      const file=await realpath(resolve(local,entry)),rel=relative(root,file);
      if(rel.startsWith('..') || isAbsolute(rel) || !rel) throw Error('EVIDENCE_OUTSIDE_LOCAL_STORAGE');
      const bytes=await readFile(file);if(!bytes.length) throw Error('EVIDENCE_EMPTY');
      evidence.push({path:rel,sha256:createHash('sha256').update(bytes).digest('hex')});
    }
    const event={kind:'reviewed-result',at:new Date().toISOString(),...review,evidence,previousStatus:item.executionStatus};
    item.history.push(event);item.executionStatus=review.status;item.actualBehavior=review.actual;item.evidence=evidence;
    item.relatedKnownBugReports=review.relatedKnownBugReports||item.relatedKnownBugReports;
    await atomicJson(resolve(local,'checklist.json'),checklist);return {scenarioId:item.id,status:item.executionStatus};
  } finally {await release();}
}
