import { resolve } from 'node:path';
import { CATEGORIES, LOCAL, STATUSES } from './config.mjs';
import { atomicJson, readJson } from './storage.mjs';

export const slug=value=>value.toLowerCase().replace(/[^a-z]+/g,'-').replace(/^-|-$/g,'');
export function parseChecklist(source) {
  let category; const scenarios=[];
  for (const line of source.body.split(/\r?\n/)) {
    const heading=line.match(/^### (.+) \((\d+)\)$/);
    if (heading) { category=heading[1]; if(CATEGORIES[category]!==Number(heading[2])) throw Error('CHECKLIST_CATEGORY_MISMATCH'); continue; }
    const row=line.match(/^- \[[ x]\] \*\*(\d+)\.\*\* (.+) — (PASS|FAIL|BLOCKED|NOT TESTED)$/);
    if (!row) continue;
    if (!category) throw Error('CHECKLIST_WITHOUT_CATEGORY');
    const item=Number(row[1]), objective=row[2];
    scenarios.push({
      id:`official.${slug(category)}.${String(item).padStart(2,'0')}`,category,item,objective,
      preconditions:['Reconcile this item with the current Team Program and newer retests.','Sign in locally with the dedicated QA account.','Obtain item-specific authorization for persistent changes or token consumption; use designated test objects only.'],
      testData:{business:'QA Cedar Example Studio',customer:'Fictional Tester',email:'qa@example.invalid',boundaryCases:['empty','1 character','10000 characters','English / 日本語 / العربية','unsupported file','documented limit minus 1 / at limit / plus 1']},
      steps:[`Open ${category} using a designated isolated QA object.`,`Execute each operation in the official criterion: ${objective}`,'Record exact actions, observed output, and all artifacts locally.','Compare each clause against its expected behavior; repeat once when safe for a suspected defect.','Check existing reports before drafting a bug; stop on a confirmed defect.'],
      expectedBehavior:objective,
      actualBehavior:null,executionStatus:'NOT TESTED',evidence:[],relatedKnownBugReports:[],
      retestRequirements:'Repeat the original steps and verify every affected criterion using a new local run; preserve prior evidence.',
      historicalStatus:row[3],historicalSource:source.source,sourceUpdatedAt:source.updatedAt,
      sourceTruncated:objective.includes('…'),reconciled:false,
      automation:'Manual assisted: no approved deterministic driver for the full official criterion.',
      history:[{kind:'historical-import',status:row[3],source:source.source,at:source.fetchedAt,evidenceVerified:false}],attempts:[]
    });
  }
  if (scenarios.length!==99 || new Set(scenarios.map(s=>s.id)).size!==99) throw Error('CHECKLIST_EXPECTED_99_UNIQUE_ITEMS');
  for(const [name,count] of Object.entries(CATEGORIES)) {
    const items=scenarios.filter(s=>s.category===name).map(s=>s.item).sort((a,b)=>a-b);
    if(items.length!==count || items.some((n,i)=>n!==i+1)) throw Error('CHECKLIST_SEQUENCE_INVALID');
  }
  return scenarios;
}
export async function importChecklist(source,local=LOCAL) {
  const incoming=parseChecklist(source),file=resolve(local,'checklist.json');
  const existing=await readJson(file,{version:2,scenarios:[]});
  // Source refreshes never overwrite verified progress, history, or retests.
  const byId=new Map(existing.scenarios.map(s=>[s.id,s]));
  const scenarios=incoming.map(s=>byId.has(s.id)?{...byId.get(s.id),latestSource:{objective:s.objective,status:s.historicalStatus,updatedAt:source.updatedAt}}:s);
  const result={...existing,version:2,source:source.source,sourceUpdatedAt:source.updatedAt,scenarios};
  await atomicJson(file,result);return result;
}
export function metrics(checklist) {
  const current=Object.fromEntries(STATUSES.map(s=>[s,0])),historical={...current};
  for(const item of checklist.scenarios) { current[item.executionStatus]++; historical[item.historicalStatus]++; }
  return {total:checklist.scenarios.length,current,historical,liveChecked:checklist.liveChecked??null,reconciled:checklist.scenarios.filter(s=>s.reconciled).length,truncated:checklist.scenarios.filter(s=>s.sourceTruncated).length};
}
export async function getChecklist(local=LOCAL) {
  const file=resolve(local,'checklist.json');
  let value=await readJson(file,null);
  if (!value) { const source=await readJson(resolve(local,'checklist-source.json'),null); if(source) value=await importChecklist(source,local); }
  return value;
}
export async function officialAttempt(id,runId,local=LOCAL) {
  const checklist=await getChecklist(local),scenario=checklist?.scenarios.find(s=>s.id===id);
  if(!scenario) throw Error('UNKNOWN_OFFICIAL_SCENARIO');
  const reason=!scenario.reconciled?'RECONCILIATION_REQUIRED':scenario.sourceTruncated?'FULL_CRITERION_REQUIRED':'MANUAL_WORKFLOW_AND_SCOPED_AUTHORIZATION_REQUIRED';
  scenario.attempts.push({runId,at:new Date().toISOString(),status:'BLOCKED',reason});
  await atomicJson(resolve(local,'checklist.json'),checklist);
  return {scenarioId:id,status:'BLOCKED',reason};
}
