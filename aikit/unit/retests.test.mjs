import {test} from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
import {validate,parseIssue} from '../lib/protocol.mjs';import {cardRecord,parseReport,statusOf} from '../retests/source.mjs';import {PROGRAM,reportUiRequestAllowed} from '../retests/safety.mjs';import {safeSummary} from '../lib/report.mjs';import {publicRetests,sanitizeRetestSummary} from '../retests/privacy.mjs';import {buildSpec} from '../retests/plans.mjs';import {addressComparison,paragraphComparison,transformationComparison,pronunciationComparison,verdict} from '../retests/comparisons.mjs';
import {hasBugEvidence} from '../retests/evidence.mjs';
test('retest commands use strict v2 browser lane parsing and reject self-authorizing or executable parameters',()=>{
 for(const command of ['DISCOVER_RETESTS','RETEST_ALL_LIVE','RETEST_RESUME','RETEST_STATUS'])assert.equal(parseIssue({number:1,user:{login:'Bequcho'},title:'AIKIT-BROWSER: '+command,body:'AIKIT_QA_BRIDGE_V2\n'+JSON.stringify({version:2,command,params:{}})}).command,command);
 assert.deepEqual(validate('RETEST_REPORT',{reportNumber:435}),{command:'RETEST_REPORT',params:{reportNumber:435}});
 for(const params of[{script:'evil'},{grant:{maxTokens:99}},{uploadPath:'auth-state.json'},{maxReports:10000},{authorizationId:'new'}])assert.throws(()=>validate('RETEST_ALL_LIVE',params));
 assert.throws(()=>parseIssue({number:1,user:{login:'Bequcho'},title:'AIKIT-QA: RETEST_ALL_LIVE',body:'AIKIT_QA_BRIDGE_V2\n{"version":2,"command":"RETEST_ALL_LIVE","params":{}}'}),/PREFIX/);
 assert.equal(parseIssue({number:1,user:{login:'attacker'},title:'AIKIT-BROWSER: RETEST_ALL_LIVE',body:'AIKIT_QA_BRIDGE_V2\n{}'}),null);
});
test('discovery requires owned stable report links and reads current status rather than timeline labels',()=>{
 const id=randomUUID(),origin='https://aikit.ai',card=cardRecord({href:origin+'/home/problems/'+id,text:'#435\nQA title\nYours\nFixed'},origin);assert.equal(card.status,'FIXED');
 assert.equal(cardRecord({href:'https://evil.invalid/home/problems/'+id,text:'#435\nQA title\nYours\nLive, please check'},origin),null);
 assert.equal(cardRecord({href:origin+'/home/problems/'+id,text:'#435\nOther person\nLive, please check'},origin),null);
 const text='Report #435\nFixed\nSent today\nReceived\nLive, please check\nWhat you said\nQA German report long original text with a specific objective.\nSteps to reproduce:\n1. Check FAQ.\nExpected:\nUse du.\nActual:\nUses Sie.\nDid this fix it?\nWhat we changed\nFAQ uses du.';
 assert.equal(parseReport(card,text).status,'FIXED');assert.equal(statusOf('Live, bitte prüfen'),'LIVE');assert.equal(statusOf('未知'),'UNKNOWN');assert.throws(()=>parseReport(card,'Report not found'),/UNAVAILABLE/);
});
test('report UI read scope never enables writes, unknown IDs, token APIs, external origins or arbitrary query operations',()=>{
 const id=randomUUID(),ids=new Set([id]),request=(path,method='GET')=>({url:()=>new URL(path,'https://aikit.ai').href,method:()=>method});
 assert.equal(reportUiRequestAllowed(request('/api/problem-reports/'+id),'https://aikit.ai',ids,true),true);
 assert.equal(reportUiRequestAllowed(request('/api/problem-reports/'+id+'/after'),'https://aikit.ai',ids,true),true);
 for(const r of[request('/api/problem-reports/'+id,'POST'),request('/api/problem-reports/'+randomUUID()),request('/api/me/tokens'),request('/api/problem-reports/'+id+'?op=delete'),request('https://evil.invalid/api/problem-reports/'+id)])assert.equal(reportUiRequestAllowed(r,'https://aikit.ai',ids,true),false);
 assert.equal(reportUiRequestAllowed(request('/api/problem-reports/'+id),'https://aikit.ai',ids,false),false);
});
test('bug verdicts cannot inherit smoke success; linguistic, DOCX, transformation and pronunciation assertions remain specific',()=>{
 assert.equal(hasBugEvidence({status:'PASS',technicalSuccess:true,executed:true,spec:{driver:'german'},assertions:[{id:'page-loaded',passed:true}]}),false);
 assert.equal(verdict([]).status,'REVIEW_REQUIRED');
 assert.equal(addressComparison({marketing:'Die Werkzeuge, die du nutzt.',faq:'Deine Dateien gehören dir. Du kannst sie lesen.'}).status,'PASS');
 assert.equal(addressComparison({marketing:'Die Werkzeuge, die du nutzt.',faq:'Dateien gehören Ihnen.'}).status,'FAIL');
 assert.equal(addressComparison({marketing:'Neutral text',faq:'Neutral text'}).status,'REVIEW_REQUIRED');
 assert.equal(paragraphComparison('One\n\nTwo','One Two').status,'FAIL');assert.equal(paragraphComparison('One\n\n\n\nTwo','One\n\nTwo').status,'FAIL');assert.equal(paragraphComparison('One\n\nTwo','One\n\nTwo').status,'PASS');
 assert.equal(transformationComparison({source:'A\n\nB',actual:'Uno\n\nDos',sourceTitle:'QA',actualTitle:'QA'}).status,'REVIEW_REQUIRED');
 assert.equal(transformationComparison({source:'A\n\nB',actual:'Uno',sourceTitle:'QA',actualTitle:'Changed',golden:'Uno\n\nDos'}).status,'FAIL');
 assert.equal(pronunciationComparison('pe-da-LE-a',{audioRequested:true}).status,'REVIEW_REQUIRED');assert.equal(pronunciationComparison('pe-da-LEA').status,'FAIL');
});
test('all priority specifications have a report-specific objective and disabled mutation classifications',()=>{
 for(const [number,word]of [[433,'Greek'],[435,'German'],[436,'Punjabi'],[465,'DOCX'],[470,'translation'],[472,'pronunciation'],[371,'learned'],[384,'Graphics'],[389,'editor'],[424,'contact form'],[362,'hosting'],[367,'Connect'],[369,'publication']]){
  const spec=buildSpec({number,id:randomUUID(),revision:'revision',steps:'real original steps',expected:'original expected result',description:word+' bug',developerFix:'specific changed behavior'});assert.ok(spec.objective.length>30);assert.ok(spec.preconditions.length);assert.ok(spec.evidence.length);assert.notEqual(spec.driver,'unsupported');
  if([465,470,472,371,389,424,369].includes(number)){assert.ok(spec.blocker);assert.equal(spec.mutation,'disabled')}
 }
 assert.equal(buildSpec({number:435,description:'Unrelated load test',steps:'steps',expected:'expectation',developerFix:'loaded'}).blocker,'REPORT_SPEC_SOURCE_MISMATCH');
});
test('GitHub projection excludes original bug content, secrets, file paths, tokens and raw expected/actual values',()=>{
 const id=randomUUID(),batch={id:randomUUID(),stage:'complete',eligibleCount:1,discoveryComplete:true,statusCoverageComplete:true,rows:[{id,number:435,title:'private@example.invalid',attemptId:randomUUID(),result:{status:'PASS',reason:'BUG_ASSERTIONS_VERIFIED',executed:true,bugFixVerified:true,privateToken:'SECRET',assertions:[{passed:true,expected:'SECRET',actual:'SECRET'}],path:'C:/private'}}]};
 const projected=safeSummary({runId:randomUUID(),command:'RETEST_ALL_LIVE',outcome:'COMPLETED',checks:[],retests:{...publicRetests(batch),secret:'SECRET',originalReport:'private@example.invalid'}});
 const json=JSON.stringify(projected);assert.equal(json.includes('SECRET'),false);assert.equal(json.includes('private@example'),false);assert.equal(json.includes('C:/private'),false);assert.equal(projected.retests.rows[0].verifiedAssertions,1);
 assert.equal(sanitizeRetestSummary({rows:[{reason:'PRIVATE_CUSTOMER_NAME',status:'UNKNOWN'}]}).rows[0].reason,'ENGINE_EXECUTION_ERROR');
});
