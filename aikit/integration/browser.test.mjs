import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdtemp,rm,mkdir,readFile,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {BrowserController} from '../browser/controller.mjs';
import {safeBrowserResult} from '../browser/privacy.mjs';
import {readJson,atomicJson} from '../lib/storage.mjs';

const html=`<!doctype html><html data-pk="light"><body><main style="min-height:1800px"><h1>Tools</h1>
<button type="button" aria-label="Open menu" aria-controls="panel" aria-expanded="false" onclick="this.setAttribute('aria-expanded',this.getAttribute('aria-expanded')!=='true');document.querySelector('#panel').hidden=!document.querySelector('#panel').hidden">Menu</button>
<div id="panel" hidden><a href="/tools/next">Tools</a></div>
<input type="search" aria-label="Search" oninput="fetch('/api/save',{method:'POST',body:this.value})">
<select aria-label="Filter"><option value="all">Show all</option><option value="next">Next</option></select>
<input type="password" aria-label="Password" value="private-token"><h2>Private Customer Example</h2><div role="alert">synthetic-customer@example.invalid</div>
<button type="button" aria-controls="duplicate">Show all</button><button type="button" aria-controls="duplicate">Show all</button>
<button type="button" aria-label="Delete project" onclick="fetch('/api/delete',{method:'POST'})">Delete</button>
<button type="button" aria-controls="panel" aria-label="Expand" onclick="fetch('/api/generate')">Expand</button>
<form><textarea aria-label="Description"></textarea><button>Save</button></form>
<a href="/tools/next">Next</a></main></body></html>`;

async function fixture(t) {
  const local=await mkdtemp(join(tmpdir(),'aikit-browser-integration-'));let writes=0,generations=0;
  const server=createServer((req,res)=>{
    if(!['GET','HEAD','OPTIONS'].includes(req.method))writes++;
    if(req.url.includes('/api/generate'))generations++;
    if(req.url==='/home/projects'){res.end(req.headers.cookie?.includes('qa-session=synthetic-cookie')?'<html data-pk="light"><main><h1>Things you build</h1></main></html>':'<h1>Login</h1>');return;}
    res.setHeader('Content-Type','text/html');res.end(html);
  });await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin='http://127.0.0.1:'+server.address().port;
  await atomicJson(join(local,'auth-state.json'),{cookies:[{name:'qa-session',value:'synthetic-cookie',domain:'127.0.0.1',path:'/',expires:-1,httpOnly:true,secure:false,sameSite:'Lax'}],origins:[]});
  const controller=new BrowserController({local,origin});
  t.after(async()=>{await controller.close();await new Promise(resolve=>server.close(resolve));await rm(local,{recursive:true,force:true});});
  return {controller,local,origin,writes:()=>writes,generations:()=>generations};
}
const target=(result,label)=>{const observation=result.observation,c=observation.controls.find(c=>c.label===label);assert.ok(c,'Expected fixture control '+label);return {snapshotId:observation.snapshotId,elementId:c.elementId};};
test('real browser OPEN -> INSPECT -> ACT -> assertion -> sanitized state and local artifacts',async t=>{
  const f=await fixture(t),c=f.controller;
  const opened=await c.execute('BROWSER_OPEN',{url:f.origin+'/tools/fixture'});assert.equal(opened.status,'COMPLETED');
  const inspected=await c.execute('BROWSER_INSPECT',{}),menu=target(inspected,'Open menu');
  const acted=await c.execute('BROWSER_ACT',{action:{op:'click',target:menu,assertions:[{type:'expanded',target:{ref:'acted'},value:true}]}});
  assert.equal(acted.status,'COMPLETED');assert.equal(acted.steps[0].assertions[0].passed,true);assert.notEqual(acted.observation.snapshotId,inspected.observation.snapshotId);
  const output=JSON.stringify(safeBrowserResult(acted));assert.equal(output.includes('Private Customer'),false);assert.equal(output.includes('synthetic-customer'),false);assert.equal(output.includes('private-token'),false);
  const operations=await readdir(join(f.local,'interactive/operations'));assert.equal(operations.length,3);
  assert.equal(f.writes(),0);
});
test('stable IDs, ambiguous/stale targets, full batch validation and step-by-step assertions',async t=>{
  const f=await fixture(t),c=f.controller;let r=await c.execute('BROWSER_OPEN',{url:f.origin+'/tools/fixture'});
  const original=target(r,'Open menu');r=await c.execute('BROWSER_INSPECT',{});assert.equal(target(r,'Open menu').elementId,original.elementId);
  const duplicate=target(r,'Show all');const denied=await c.execute('BROWSER_ACT',{action:{op:'click',target:duplicate}});assert.equal(denied.reason,'AMBIGUOUS_TARGET');
  await assert.rejects(c.execute('BROWSER_BATCH',{steps:[{op:'click',target:target(r,'Open menu')},{op:'javascript',code:'evil'}]}));
  assert.equal(await c.page.getByRole('button',{name:'Open menu'}).getAttribute('aria-expanded'),'false');
  r=await c.execute('BROWSER_BATCH',{steps:[{op:'click',target:{ref:'last',match:{role:'button',label:'Open menu'}},assertions:[{type:'expanded',target:{ref:'acted'},value:true}]},{op:'fill',target:{ref:'last',match:{role:'searchbox',label:'Search'}},value:'QA synthetic query'},{op:'click',target:{ref:'last',match:{role:'button',label:'Open menu'}},assertions:[{type:'expanded',target:{ref:'acted'},value:false}]}]});
  assert.equal(r.status,'COMPLETED');assert.equal(r.steps.length,3);assert.equal(f.writes(),0);
  await c.page.getByRole('button',{name:'Open menu'}).evaluate(node=>node.replaceWith(node.cloneNode(true)));
  r=await c.execute('BROWSER_ACT',{action:{op:'click',target:original}});assert.equal(r.reason,'STALE_TARGET');
});
test('authorization and network guard block passwords, destructive actions, writes and generation',async t=>{
  const f=await fixture(t),c=f.controller;let r=await c.execute('BROWSER_OPEN',{url:f.origin+'/tools/fixture'});
  for(const label of ['Delete project','Password']) {
    r=await c.execute('BROWSER_ACT',{action:label==='Password'?{op:'fill',target:target(r,label),value:'QA synthetic'}:{op:'click',target:target(r,label)}});
    assert.equal(r.status,'BLOCKED');
  }
  r=await c.execute('BROWSER_ACT',{action:{op:'click',target:target(r,'Expand')}});assert.equal(r.status,'COMPLETED');
  assert.equal(f.writes(),0);assert.equal(f.generations(),0);assert.ok(c.blockedRequests>0);
  const denied=await c.execute('BROWSER_OPEN',{url:'https://evil.invalid/'});assert.equal(denied.status,'BLOCKED');
});
test('authentication persists through restart; old targets and interrupted operation IDs never replay',async t=>{
  const f=await fixture(t),c=f.controller;let r=await c.execute('BROWSER_OPEN',{url:f.origin+'/home/projects'});assert.ok(r.observation.headings.includes('Things you build'));
  r=await c.execute('BROWSER_OPEN',{url:f.origin+'/tools/fixture'});const old=target(r,'Open menu');
  const runId='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const first=await c.execute('BROWSER_ACT',{action:{op:'click',target:old}},{runId});
  const repeated=await c.execute('BROWSER_ACT',{action:{op:'click',target:old}},{runId});assert.deepEqual(repeated,first);assert.equal(await c.page.getByRole('button',{name:'Open menu'}).getAttribute('aria-expanded'),'true');
  await c.close();await c.ensure();const stale=await c.execute('BROWSER_ACT',{action:{op:'click',target:old}});assert.equal(stale.reason,'STALE_TARGET');
  r=await c.execute('BROWSER_OPEN',{url:f.origin+'/home/projects'});assert.ok(r.observation.headings.includes('Things you build'));
  const interrupted='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';await atomicJson(join(f.local,'interactive/operations',interrupted,'journal.json'),{stage:'started'});
  const blocked=await c.execute('BROWSER_OPEN',{url:f.origin+'/tools/fixture'},{runId:interrupted});assert.equal(blocked.reason,'INTERRUPTED_NO_REPLAY');
});
test('reset keeps auth/checkpoints, failed assertions stop the batch, checklist links do not mark PASS',async t=>{
  const f=await fixture(t),c=f.controller;await atomicJson(join(f.local,'checklist.json'),{scenarios:[{id:'official.voice-kit.02',executionStatus:'NOT TESTED'}]});
  const before=await readFile(join(f.local,'checklist.json'),'utf8');let r=await c.execute('BROWSER_OPEN',{url:f.origin+'/tools/fixture'});
  r=await c.execute('BROWSER_BATCH',{checklistId:'official.voice-kit.02',steps:[{op:'click',target:target(r,'Open menu'),assertions:[{type:'expanded',target:{ref:'acted'},value:false}]},{op:'fill',target:{ref:'last',match:{role:'searchbox',label:'Search'}},value:'must not execute'}]});
  assert.equal(r.status,'REVIEW_REQUIRED');assert.equal(r.steps.length,2);assert.equal(r.steps[1].status,'NOT TESTED');assert.equal(await c.page.getByRole('searchbox').inputValue(),'');
  assert.equal(await readFile(join(f.local,'checklist.json'),'utf8'),before);assert.equal((await readJson(join(f.local,'interactive/checklist-links.json'))).links[0].officialStatusChanged,false);
  const reset=await c.execute('BROWSER_RESET',{});assert.equal(reset.status,'COMPLETED');assert.equal(await readFile(join(f.local,'checklist.json'),'utf8'),before);
});
test('select, bounded keyboard input, scrolling, navigation Back and element inspection execute against real DOM',async t=>{
  const f=await fixture(t),c=f.controller;let r=await c.execute('BROWSER_OPEN',{url:f.origin+'/tools/fixture'});
  const filter=r.observation.controls.find(control=>control.label==='Filter');
  r=await c.execute('BROWSER_ACT',{action:{op:'select',target:target(r,'Filter'),optionId:filter.options[1].optionId}});
  assert.equal(r.status,'COMPLETED');assert.equal(await c.page.getByLabel('Filter').inputValue(),'next');
  r=await c.execute('BROWSER_ACT',{action:{op:'fill',target:target(r,'Search'),value:'QA synthetic'}});
  r=await c.execute('BROWSER_ACT',{action:{op:'press',target:target(r,'Search'),key:'Home'}});
  assert.equal(r.status,'COMPLETED');assert.equal(await c.page.getByRole('searchbox').evaluate(node=>node.selectionStart),0);
  r=await c.execute('BROWSER_ACT',{action:{op:'inspect',target:target(r,'Filter')}});assert.equal(r.status,'COMPLETED');
  r=await c.execute('BROWSER_ACT',{action:{op:'scroll',direction:'down',amount:400}});assert.equal(r.status,'COMPLETED');assert.ok(await c.page.evaluate(()=>scrollY)>0);
  await c.execute('BROWSER_ACT',{action:{op:'scroll',direction:'up',amount:400}});
  r=await c.execute('BROWSER_INSPECT',{});
  r=await c.execute('BROWSER_ACT',{action:{op:'click',target:target(r,'Next'),assertions:[{type:'urlPath',value:'/tools/next'}]}});assert.equal(r.status,'COMPLETED');
  r=await c.execute('BROWSER_ACT',{action:{op:'back',assertions:[{type:'urlPath',value:'/tools/fixture'}]}});assert.equal(r.status,'COMPLETED');assert.equal(f.writes(),0);
});
