import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {randomUUID} from 'node:crypto';
import {join} from 'node:path';
import {mkdir} from 'node:fs/promises';
import {chromium} from '@playwright/test';
import {approvalFixture} from '../test-support/approval.mjs';
import {BrowserController} from '../browser/controller.mjs';
import {SandboxClient} from '../sandbox/client.mjs';
import {createFixtures,fixturePayload,pdfFixture} from '../sandbox/fixtures.mjs';
import {ArtifactVault,publicArtifact,inspectBytes,sha256} from '../sandbox/artifacts.mjs';
import {safeBrowserResult} from '../browser/privacy.mjs';
import {atomicJson,readJson} from '../lib/storage.mjs';

const drawer=`<!doctype html><html data-pk="light"><style>.sh-side,.sh-drawer-scrim{display:none}.drawer-open .sh-side{display:block;position:fixed;left:0;top:0;width:300px;height:100vh;z-index:70;background:white}.drawer-open .sh-drawer-scrim{display:block;position:fixed;inset:0;z-index:65;background:#0005}</style><body><div class="sh"><button aria-label="Open menu" aria-controls="sh-side" aria-expanded="false" onclick="this.setAttribute('aria-expanded','true');this.parentNode.classList.add('drawer-open')">Menu</button><aside id="sh-side" class="sh-side"><h1>Tools</h1></aside><div class="sh-drawer-scrim" onclick="this.parentNode.classList.remove('drawer-open');document.querySelector('button').setAttribute('aria-expanded','false')"></div><form><input type="email" required aria-label="private@example.invalid"><input type="file" multiple aria-label="Upload"><progress value="1" max="2"></progress></form><div role="alert">private-customer-id</div></div></body></html>`;
async function mock(t){
 const objects=new Map();let f;const flags={writes:0,creates:0,generations:0,used:0,failCreate:false,ownerMismatch:false,usageMismatch:false,wrongMime:false,redirectExport:false};
 const server=createServer(async(req,res)=>{
  res.setHeader('x-beqson-sandbox',f?.scope.runId||'');const json=(o,code=200)=>{res.statusCode=code;res.setHeader('content-type','application/json');res.end(JSON.stringify(o))};
  try{
   if(req.url==='/tools/fixture'){res.setHeader('content-type','text/html');res.end(drawer);return}
   if(req.url==='/qa/identity'){json({sandbox:true,account:f.scope.account,runId:f.scope.runId});return}
   if(req.url==='/qa/usage'){json(flags.usageUnavailable?{}:{usedTokens:flags.used,remainingTokens:100-flags.used+(flags.usageMismatch&&flags.generations>=2?1:0)});return}
   if(req.method!=='GET')flags.writes++;
   const chunks=[];for await(const chunk of req){chunks.push(chunk);if(chunks.reduce((n,b)=>n+b.length,0)>9*1024*1024){req.destroy();return}}const bytes=Buffer.concat(chunks);
   if(req.url==='/qa/projects'&&req.method==='POST'){
    const body=JSON.parse(bytes);assert.equal(body.id,f.scope.objectId);assert.equal(body.owner,f.scope.account);assert.equal(body.runId,f.scope.runId);assert.equal(body.publish,false);assert.equal(body.notifications,false);
    if(objects.has(body.id)){json({},409);return}objects.set(body.id,{...body,text:'QA initial text'});flags.creates++;if(flags.failCreate){json({},503);return}json(objects.get(body.id));return;
   }
   const record=objects.get(f.scope.objectId),route=f.scope.route;
   if(req.url==='/qa/view/'+f.scope.objectId){res.setHeader('content-type','text/html');res.end(`<h1>QA isolated fixture</h1><output>${record?.text||'deleted'}</output><input id="qa-file" type="file"><a href="${route}/export/pdf">Download</a>`);return}
   if(!record||!req.url.startsWith(route)){json({},404);return}
   if(req.url===route&&req.method==='GET'){json({...record,...(flags.ownerMismatch?{owner:'qa-other'}:{})});return}
   if(req.headers['x-qa-owner']!==f.scope.account||req.headers['x-qa-run']!==f.scope.runId){json({},403);return}
   if(req.url===route&&req.method==='PATCH'){const body=JSON.parse(bytes);assert.equal(body.publish,false);assert.equal(body.notifications,false);record.text=body.text;json(record);return}
   if(req.url===route&&req.method==='DELETE'){objects.delete(record.id);json({deleted:true,id:record.id,owner:record.owner,runId:record.runId});return}
   if(req.url===route+'/upload'&&req.method==='POST'){assert.equal(req.headers['x-qa-sha256'],sha256(bytes));record.fixtureHash=sha256(bytes);json(record);return}
   if(req.url.startsWith(route+'/export/')){
    if(flags.redirectExport){res.writeHead(302,{location:'https://example.invalid/private'});res.end();return}
    res.setHeader('content-type',flags.wrongMime?'text/html':'application/pdf');res.setHeader('content-disposition','attachment; filename="QA-output.pdf"');res.end(pdfFixture());return;
   }
   if(req.url===route+'/generate'&&req.method==='POST'){const body=JSON.parse(bytes);flags.generations++;flags.used+=body.estimatedTokens;json({tokensUsed:body.estimatedTokens});return}
   json({},404);
  }catch{json({},400)}
 });await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
 f=await approvalFixture(t,'http://127.0.0.1:'+server.address().port);
 const client=()=>new SandboxClient({local:f.local,scope:f.scope,grantId:f.grant.id,enabled:true});
 t.after(()=>new Promise(ok=>{server.closeAllConnections();server.close(ok)}));
 return {...f,client,flags,objects};
}
async function browser(t,origin,{downloads=false,headers={},local}={}){
 const downloadsPath=downloads?join(local,'sandbox','download-staging'):undefined;if(downloadsPath)await mkdir(downloadsPath,{recursive:true,mode:0o700});
 const instance=await chromium.launch({downloadsPath});t.after(()=>instance.close());const context=await instance.newContext({acceptDownloads:downloads,serviceWorkers:'block',extraHTTPHeaders:headers});
 await context.route('**/*',route=>new URL(route.request().url()).origin===origin&&route.request().method()==='GET'?route.continue():route.abort());
 const page=await context.newPage();return {page,context};
}

test('reviewed mobile backdrop dismisses with actual state verification; unknown, duplicate and stale targets are rejected',async t=>{
 const f=await mock(t),c=new BrowserController({local:f.local,origin:f.scope.origin});t.after(()=>c.close());
 let r=await c.execute('BROWSER_OPEN',{url:f.scope.origin+'/tools/fixture',viewport:'mobile'});
 const target=label=>({snapshotId:r.observation.snapshotId,elementId:r.observation.controls.find(x=>x.label===label).elementId});
 const noBackdrop=await c.execute('BROWSER_ACT',{action:{op:'dismiss',target:target('Open menu')}});assert.equal(noBackdrop.reason,'LOCAL_SCOPED_AUTHORIZATION_REQUIRED');
 r=await c.execute('BROWSER_ACT',{action:{op:'click',target:target('Open menu'),assertions:[{type:'expanded',target:{ref:'acted'},value:true}]}});assert.equal(r.status,'COMPLETED');
 const backdrop=target('Dismiss backdrop');assert.equal(r.observation.controls.find(x=>x.label==='Dismiss backdrop').kind,'backdrop');
 r=await c.execute('BROWSER_ACT',{action:{op:'dismiss',target:backdrop,assertions:[{type:'hidden',target:{ref:'acted'},value:true}]}});assert.equal(r.status,'COMPLETED');assert.equal(r.observation.controls.find(x=>x.label==='Open menu').expanded,false);
 assert.equal((await c.execute('BROWSER_ACT',{action:{op:'dismiss',target:backdrop}})).reason,'STALE_TARGET');
 r=await c.execute('BROWSER_ACT',{action:{op:'click',target:target('Open menu')}});const old=target('Dismiss backdrop');
 await c.page.locator('.sh-drawer-scrim').evaluate(e=>e.after(e.cloneNode()));
 assert.equal((await c.execute('BROWSER_ACT',{action:{op:'dismiss',target:old}})).reason,'STALE_TARGET');
 const raw=JSON.stringify(safeBrowserResult(r));assert.equal(raw.includes('private@example'),false);assert.equal(raw.includes('private-customer'),false);assert.equal(raw.includes('dismissPoint'),false);
 assert.equal(r.observation.semantics.forms,1);assert.equal(r.observation.semantics.requiredFields,1);assert.equal(r.observation.semantics.fileInputs,1);assert.equal(r.observation.semantics.progressIndicators,1);assert.equal(f.flags.writes,0);
});
test('offline signed lifecycle create -> edit -> persist/restart -> browser verify -> fixture upload -> download -> cleanup',async t=>{
 const f=await mock(t),client=f.client(),{page}=await browser(t,f.scope.origin,{downloads:true,local:f.local,headers:{'x-qa-owner':f.scope.account,'x-qa-run':f.scope.runId}});
 await createFixtures(f.local,page);
 const createId=randomUUID(),created=await client.perform('create',{},createId);assert.equal(created.id,f.scope.objectId);
 assert.deepEqual(await f.client().perform('create',{},createId),created);assert.equal(f.flags.creates,1);
 await client.perform('edit',{text:'QA persisted edit'});
 assert.equal((await f.client().perform('read')).text,'QA persisted edit');
 await page.goto(f.scope.origin+'/qa/view/'+f.scope.objectId);assert.equal(await page.locator('output').textContent(),'QA persisted edit');
 const fixture=await fixturePayload(f.local,'png');await page.locator('#qa-file').setInputFiles(fixture);assert.equal(await page.locator('#qa-file').evaluate(e=>e.files[0].name),'QA-fixture.png');
 const uploaded=await client.perform('upload',{fixtureId:'png'});assert.equal(uploaded.fixtureHash,sha256(fixture.buffer));
 for(const type of ['png','jpeg','webp','wav','pdf','docx']){const payload=await fixturePayload(f.local,type);assert.equal((await inspectBytes(payload.buffer,type,payload.mimeType)).type,type)}
 const exported=await client.perform('export',{type:'pdf'});assert.equal(publicArtifact(exported).structurallyValid,true);assert.deepEqual(await client.vault.read(exported.id),pdfFixture());
 const downloadPromise=page.waitForEvent('download');await page.getByRole('link',{name:'Download',exact:true}).click();const download=await downloadPromise;
 assert.equal(await download.failure(),null,'Offline Chromium download must finish before validation');
 const downloaded=await client.vault.ingestDownload(download,{enabled:true,origin:f.scope.origin,path:f.scope.route+'/export/pdf',type:'pdf',mime:'application/pdf'});assert.deepEqual(await client.vault.read(downloaded.id),pdfFixture());
 assert.equal((await client.perform('cleanup')).deleted,true);assert.equal(f.objects.size,0);assert.equal(f.flags.generations,0);
});
test('a committed create with a lost response is not replayed; explicit ownership recovery permits cleanup only for that ID',async t=>{
 const f=await mock(t),id=randomUUID();f.flags.failCreate=true;
 await assert.rejects(f.client().perform('create',{},id),/MOCK_CONTRACT/);assert.equal(f.flags.creates,1);
 await assert.rejects(f.client().perform('create',{},id),/NO_REPLAY/);
 await assert.rejects(f.client().perform('cleanup'),/NOT_OWNED/);
 f.flags.failCreate=false;await f.client().perform('recover');await f.client().perform('cleanup');assert.equal(f.objects.size,0);assert.equal(f.flags.creates,1);
});
test('ownership mismatch blocks edit/delete; exports reject MIME mismatch and external redirects',async t=>{
 const f=await mock(t),c=f.client();await c.perform('create');const writes=f.flags.writes;f.flags.ownerMismatch=true;
 await assert.rejects(c.perform('cleanup'),/OWNERSHIP_MISMATCH/);await assert.rejects(c.perform('edit',{text:'QA blocked edit'}),/OWNERSHIP_MISMATCH/);assert.equal(f.flags.writes,writes);
 f.flags.ownerMismatch=false;f.flags.wrongMime=true;await assert.rejects(c.perform('export',{type:'pdf'}),/TYPE_OR_SIZE/);
 f.flags.wrongMime=false;f.flags.redirectExport=true;await assert.rejects(c.perform('export',{type:'pdf'}));f.flags.redirectExport=false;await c.perform('cleanup');
});
test('mock generation uses signed estimates and independent usage checks; uncertain billing holds future attempts',async t=>{
 const f=await mock(t),c=f.client();await c.perform('create');
 const params={tool:'qa-tone',artifactId:'wav',estimatedTokens:4};assert.equal((await c.perform('generate',params)).usageVerified,true);
 await assert.rejects(c.perform('generate',{...params,estimatedTokens:7}),/SPENDING_LIMIT/);assert.equal(f.flags.generations,1);
 // Make the before/after balance contract inconsistent only after dispatch.
 f.flags.usageMismatch=true;
 await assert.rejects(c.perform('generate',params),/USAGE_UNCONFIRMED/);assert.equal((await readJson(join(f.local,'sandbox/generation-hold.json'))).blocked,true);
 await assert.rejects(f.client().perform('generate',{...params,estimatedTokens:1}));assert.equal(f.flags.generations,2);await c.perform('cleanup');
});
test('missing independent pre-generation usage blocks dispatch and persists a fail-closed billing hold',async t=>{
 const f=await mock(t),c=f.client();await c.perform('create');f.flags.usageUnavailable=true;
 await assert.rejects(c.perform('generate',{tool:'qa-tone',artifactId:'wav',estimatedTokens:2}),/USAGE_UNCONFIRMED/);
 assert.equal(f.flags.generations,0);assert.equal((await readJson(join(f.local,'sandbox/generation-hold.json'))).blocked,true);f.flags.usageUnavailable=false;
 await assert.rejects(f.client().perform('generate',{tool:'qa-tone',artifactId:'wav',estimatedTokens:2}),/USAGE_UNCONFIRMED/);assert.equal(f.flags.generations,0);await c.perform('cleanup');
});
