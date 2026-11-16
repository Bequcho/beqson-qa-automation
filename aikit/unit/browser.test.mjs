import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {validate,parseIssue} from '../lib/protocol.mjs';
import {allowedUrl,requestAllowed,authorizeAction,descriptorFingerprint} from '../browser/policy.mjs';
import {safeBrowserResult,safeLabel} from '../browser/privacy.mjs';
import {safeSummary} from '../lib/report.mjs';
import {atomicJson,readJson} from '../lib/storage.mjs';
import {Worker} from '../lib/worker.mjs';
import {BrowserController} from '../browser/controller.mjs';
import {classifyBrowserError} from '../browser/diagnostics.mjs';

const target={snapshotId:'s_'+'a'.repeat(24),elementId:'e_'+'b'.repeat(24)};
test('browser protocol allows only structured actions and rejects all executable/selector inputs',()=>{
  assert.equal(validate('BROWSER_OPEN',{url:'https://aikit.ai/'}).command,'BROWSER_OPEN');
  for(const action of [{op:'evaluate',code:'evil'},{op:'click',selector:'button'},{op:'fill',target,value:'safe',javascript:'evil'},{op:'press',target,key:'Control+L'}])assert.throws(()=>validate('BROWSER_ACT',{action}));
  assert.throws(()=>validate('BROWSER_BATCH',{steps:[{op:'scroll',direction:'down',amount:100},{op:'eval'}]}));
  assert.throws(()=>validate('BROWSER_BATCH',{steps:Array.from({length:7},()=>({op:'back'}))}));
  assert.throws(()=>validate('BROWSER_OPEN',{url:'https://aikit.ai/',permissions:['write']}));
  assert.throws(()=>validate('BROWSER_ACT',{action:{op:'fill',target,value:'<script>alert(1)</script>'}}),/INPUT_BLOCKED/);
});
test('browser lane is isolated from legacy queue and still requires the approved actor',()=>{
  const issue={number:10,user:{login:'Bequcho'},title:'AIKIT-BROWSER: BROWSER_INSPECT',body:'AIKIT_QA_BRIDGE_V2\n'+JSON.stringify({version:2,command:'BROWSER_INSPECT',params:{}})};
  assert.equal(parseIssue(issue).command,'BROWSER_INSPECT');assert.equal(parseIssue({...issue,user:{login:'outsider'}}),null);
  assert.throws(()=>parseIssue({...issue,title:'AIKIT-QA: BROWSER_INSPECT'}),/PREFIX/);
  assert.throws(()=>parseIssue({...issue,title:'AIKIT-BROWSER: SAFE_CHECKS'}));
  assert.equal(new Worker({}, {lane:'browser'}).inLane({title:'AIKIT-QA: PROGRESS'}),false);
});
test('URL validation blocks external origins, API/action routes, encodings and credential queries',()=>{
  assert.equal(allowedUrl('https://aikit.ai/tools/voice-kit'),'https://aikit.ai/tools/voice-kit');
  assert.ok(allowedUrl('https://aikit.ai/tools/hub/program/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa?tab=space&item=bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb').includes('item='));
  for(const url of ['https://evil.invalid/','file:///secret','http://aikit.ai/','https://user:pass@aikit.ai/','https://aikit.ai/api/generate','https://aikit.ai/tools/delete','https://aikit.ai/tools/%2e%2e/api','https://aikit.ai/?token=secret'])assert.throws(()=>allowedUrl(url));
});
test('network policy denies generation, all writes, external API reads and non-ui navigations',()=>{
  const request=(url,method='GET',nav=false,type='fetch')=>({url:()=>url,method:()=>method,isNavigationRequest:()=>nav,resourceType:()=>type});
  const origin='https://aikit.ai';
  assert.equal(requestAllowed(request(origin+'/tools'),origin),true);
  assert.equal(requestAllowed(request(origin+'/api/me'),origin),true);
  for(const r of [request(origin+'/api/me','POST'),request(origin+'/api/voices/generateVoice'),request('https://evil.invalid/data'),request(origin+'/api/me','GET',true),request(origin+'/api/me?action=delete'),request(origin+'/api/unknown')])assert.equal(requestAllowed(r,origin),false);
  assert.equal(requestAllowed(request(origin+'/api/catalog'),origin,['/api/catalog']),true);
});
test('safe browser results redact unknown labels, account text, values and private routes with a hard size bound',()=>{
  const control={elementId:target.elementId,role:'textbox',label:'synthetic-customer@example.invalid',value:'private-token',kind:'editable',enabled:true,options:Array.from({length:30},(_,i)=>({optionId:'o_'+String(i).padStart(24,'0'),label:'private account number',selected:false}))};
  const snapshot={snapshotId:target.snapshotId,sessionId:'a'.repeat(36),url:'https://aikit.ai/home/projects/customer-private?token=hidden',viewport:'desktop',headings:['private customer name','Tools'],validationMessages:['private-token'],controls:Array.from({length:60},()=>control)};
  const result=safeBrowserResult({status:'COMPLETED',reason:'OBSERVATION_CAPTURED',observation:snapshot,steps:Array.from({length:6},()=>({index:'private-token',op:'inspect',status:'PASS',reason:'ACTION_OBSERVED',observation:snapshot}))});
  const json=JSON.stringify(result);assert.ok(json.length<=24_000);for(const secret of ['synthetic-customer','private-token','customer-private','account number'])assert.equal(json.includes(secret),false);
  assert.equal(safeLabel('Tools'),'Tools');assert.equal(safeLabel('arbitrary data'),'[private text]');
  const summary=safeSummary({runId:'test',command:'BROWSER_INSPECT',outcome:'COMPLETED',checks:[],browser:{observation:snapshot}});assert.equal(JSON.stringify(summary).includes('private-token'),false);assert.equal(summary.officialItemsAutoCompleted,0);
});
test('local form grants are scoped, expiring and consumed; no grant can enable paid or dangerous capabilities',async t=>{
  const local=await mkdtemp(join(tmpdir(),'aikit-browser-policy-'));t.after(()=>rm(local,{recursive:true,force:true}));
  const descriptor={tag:'textarea',role:'textbox',label:'Description',href:null,type:'',form:true,controls:null,inputMode:null,expanded:null,enabled:true};
  const options={local,url:'https://aikit.ai/tools/fixture',origin:'https://aikit.ai',authorizationId:'qa-edit'};
  await assert.rejects(authorizeAction(descriptor,'fill',options),/SCOPE/);
  const grant={id:'qa-edit',expiresAt:new Date(Date.now()+60000).toISOString(),origin:options.origin,path:'/tools/fixture',fingerprint:descriptorFingerprint(descriptor),operations:['fill'],remainingActions:1,syntheticObject:{id:'qa-only',name:'QA Example'},cleanupPlan:'Reset the isolated local form',capability:'local-form-edit'};
  await atomicJson(join(local,'interactive/authorizations.json'),{grants:[grant]});await authorizeAction(descriptor,'fill',options);assert.equal((await readJson(join(local,'interactive/authorizations.json'))).grants[0].remainingActions,0);
  await assert.rejects(authorizeAction(descriptor,'fill',options),/SCOPE/);
  for(const capability of ['generation','publish','delete','purchase','message','account']){await atomicJson(join(local,'interactive/authorizations.json'),{grants:[{...grant,capability,remainingActions:1,spendingLimit:100}]});await assert.rejects(authorizeAction(descriptor,'fill',options),/CAPABILITY_DISABLED/);}
});
test('corrupt interactive journal fails closed without losing evidence or leaving a permanent busy flag',async t=>{
  const local=await mkdtemp(join(tmpdir(),'aikit-browser-journal-'));t.after(()=>rm(local,{recursive:true,force:true}));
  const {mkdir,writeFile,readFile}=await import('node:fs/promises'),runId='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const path=join(local,'interactive/operations',runId);await mkdir(path,{recursive:true});await writeFile(join(path,'journal.json'),'{broken');
  const controller=new BrowserController({local});const result=await controller.execute('BROWSER_INSPECT',{}, {runId});
  assert.equal(result.status,'BLOCKED');assert.equal(controller.busy,false);assert.equal(await readFile(join(path,'journal.json'),'utf8'),'{broken');
});

test('Playwright failures are categorized without emitting raw selectors or private URLs',()=>{
  const privateDetails='https://aikit.ai/home/projects/private-business-id';
  const cases=[
    ['locator.click: Timeout 5000ms exceeded. <div> intercepts pointer events '+privateDetails,'CLICK_INTERCEPTED'],
    ['Element is not attached to the DOM '+privateDetails,'STALE_TARGET'],
    ['Element is outside of the viewport '+privateDetails,'TARGET_OUTSIDE_VIEWPORT'],
    ['Execution context was destroyed, most likely because of a navigation','NAVIGATION_RACE'],
    ['locator.click: Timeout 5000ms exceeded.','ACTION_TIMEOUT'],
    ['Secret runtime error '+privateDetails,'BROWSER_OPERATION_FAILED']
  ];
  for(const [message,expected] of cases){
    const reason=classifyBrowserError(new Error(message));
    assert.equal(reason,expected);
    assert.equal(reason.includes(privateDetails),false);
    const projected=safeBrowserResult({status:'BLOCKED',reason,steps:[]});
    assert.equal(projected.reason,expected);
  }
});

test('numeric layout and pointer hit-test are safe, strictly bounded public observations',()=>{
  const snapshot={
    snapshotId:target.snapshotId,sessionId:'a'.repeat(36),url:'https://aikit.ai/tools/audio-kit',
    viewport:'mobile',headings:['Audio Kit'],
    layout:{viewportWidth:375,documentWidth:902,horizontalOverflowPx:527,scrollHeight:10000,scrollY:500,secret:'private_token'},
    controls:[{...target,role:'button',label:'Open menu',hitTest:'obstructed',kind:'disclosure',enabled:true,allowedOps:['click','inspect']},
      {elementId:'e_'+'c'.repeat(24),role:'textbox',label:'private customer',hitTest:'secrets',kind:'editable',enabled:true,allowedOps:['inspect']}]
  };
  const result=safeBrowserResult({status:'COMPLETED',reason:'OBSERVATION_CAPTURED',observation:snapshot,steps:[]});
  assert.deepEqual(result.observation.layout,{viewportWidth:375,documentWidth:902,horizontalOverflowPx:527,scrollHeight:10000,scrollY:500});
  assert.equal(result.observation.controls[0].hitTest,'obstructed');
  assert.equal(result.observation.controls[1].hitTest,'unknown');
  assert.equal(result.observation.controls[1].label,'[private text]');
  assert.equal(JSON.stringify(result).includes('private_token'),false);
  snapshot.layout.viewportWidth=Infinity;
  assert.equal(safeBrowserResult({status:'COMPLETED',reason:'OBSERVATION_CAPTURED',observation:snapshot,steps:[]}).observation.layout.viewportWidth,0);
  assert.equal(safeLabel('Download'),'Download');
  assert.equal(safeLabel('Personal customer secret'),'[private text]');
});
