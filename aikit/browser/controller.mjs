import {chromium} from '@playwright/test';
import {resolve} from 'node:path';
import {mkdir,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {atomicJson,readJson,lock} from '../lib/storage.mjs';
import {Targets,describe} from './dom.mjs';
import {allowedUrl,requestAllowed,authorizeAction} from './policy.mjs';
import {validateBrowserCommand} from './protocol.mjs';

export class BrowserController {
  constructor({local,origin='https://aikit.ai',authSource,headless=true}={}) {
    this.local=local;this.directory=resolve(local,'interactive');this.origin=origin;this.authSource=authSource||resolve(local,'auth-state.json');this.headless=headless;
    this.targets=new Targets();this.viewport='desktop';this.busy=false;this.sessionId=randomUUID();this.blockedRequests=0;
  }
  async ensure() {
    if(this.page&&!this.page.isClosed())return;
    if(this.release)await this.close();
    await mkdir(this.directory,{recursive:true,mode:0o700});
    this.release=await lock(resolve(this.directory,'session.lock'));
    try {
      const saved=await readJson(resolve(this.directory,'storage-state.json'),null),seed=saved||await readJson(this.authSource,null);
      const metadata=await readJson(resolve(this.directory,'session.json'),{});
      if(['desktop','mobile'].includes(metadata.viewport))this.viewport=metadata.viewport;
      this.browser=await chromium.launch({headless:this.headless});
      const readPolicy=await readJson(resolve(this.directory,'network-read-allowlist.json'),{paths:[]});
      const readPaths=Array.isArray(readPolicy.paths)?readPolicy.paths.filter(path=>typeof path==='string'&&/^\/api\/[a-z0-9/-]+$/i.test(path)):[];
      this.context=await this.browser.newContext({...(seed?{storageState:seed}:{}),viewport:this.viewport==='mobile'?{width:375,height:812}:{width:1440,height:900},acceptDownloads:false,serviceWorkers:'block'});
      await this.context.route('**/*',async route=>{
        const url=new URL(route.request().url());
        if(route.request().isNavigationRequest()&&url.origin===this.origin&&/^\/(?:login|auth)(?:\/|$)/.test(url.pathname))this.authBlocked=true;
        if(!requestAllowed(route.request(),this.origin,readPaths)){this.blockedRequests++;return route.abort('blockedbyclient');}
        return route.continue();
      });
      await this.context.routeWebSocket('**/*',socket=>socket.close());
      this.context.on('page',page=>{if(this.page&&page!==this.page)page.close().catch(()=>{});});
      this.page=await this.context.newPage();this.wirePage();
      if(metadata.url) {try{await this.page.goto(allowedUrl(metadata.url,this.origin),{waitUntil:'domcontentloaded'});}catch{}}
      this.sessionId=randomUUID();
    }catch(error){await this.close();throw error;}
  }
  wirePage() {
    const page=this.page;page.setDefaultTimeout(5000);page.setDefaultNavigationTimeout(20_000);
    page.on('dialog',dialog=>dialog.dismiss().catch(()=>{}));page.on('download',download=>download.cancel().catch(()=>{}));
    page.on('framenavigated',frame=>{if(frame===page.mainFrame())this.targets.clear().catch(()=>{});});
  }
  async persist() {
    if(!this.context||!this.page||this.page.isClosed())return;
    await this.context.storageState({path:resolve(this.directory,'storage-state.json'),indexedDB:true});
    await atomicJson(resolve(this.directory,'session.json'),{url:this.page.url()==='about:blank'?null:this.page.url(),sessionId:this.sessionId,at:new Date().toISOString(),viewport:this.viewport});
  }
  async close() {
    try {await this.persist().catch(()=>{});await this.targets.clear();await this.context?.close().catch(()=>{});await this.browser?.close().catch(()=>{});}
    finally{this.page=null;this.context=null;this.browser=null;if(this.release){await this.release();this.release=null;}}
  }
  async capture(directory,index) {
    await this.page.locator('body').waitFor({state:'visible'});
    const snapshot=await this.targets.capture(this.page,{sessionId:this.sessionId,viewport:this.viewport});
    await atomicJson(resolve(directory,`state-${index}.json`),snapshot);
    await atomicJson(resolve(directory,`private-targets-${index}.json`),this.targets.latest.records.map(({elementId,fingerprint,descriptor})=>({elementId,fingerprint,descriptor})));
    await this.page.screenshot({path:resolve(directory,`screenshot-${index}.png`),timeout:5000}).catch(()=>{});
    await this.persist();return snapshot;
  }
  async assertOne(assertion,acted) {
    const until=Date.now()+4000;
    do {
      let passed=false;
      if(assertion.type==='urlPath')passed=new URL(this.page.url()).pathname===assertion.value;
      else {
        const record=await this.targets.resolve(assertion.target,this.page,{acted,assertion:true});
        if(assertion.type==='visible'||assertion.type==='hidden') {const visible=await record.handle.isVisible().catch(()=>false);passed=assertion.type==='hidden'?!visible===assertion.value:visible===assertion.value;}
        else if(assertion.type==='enabled')passed=await record.handle.isEnabled().catch(()=>false)===assertion.value;
        else if(assertion.type==='expanded')passed=(await record.handle.getAttribute('aria-expanded'))===String(assertion.value);
        else if(assertion.type==='textEquals')passed=(await record.handle.textContent()||'').replace(/\s+/g,' ').trim()===assertion.value;
      }
      if(passed)return {type:assertion.type,passed:true};
      await this.page.waitForTimeout(80);
    }while(Date.now()<until);
    return {type:assertion.type,passed:false};
  }
  async action(step,authorizationId) {
    let acted;
    if(step.op==='back') {await this.page.goBack({waitUntil:'domcontentloaded'});return;}
    if(step.op==='scroll') {const signs={up:[0,-1],down:[0,1],left:[-1,0],right:[1,0]};await this.page.mouse.wheel(signs[step.direction][0]*step.amount,signs[step.direction][1]*step.amount);await this.page.waitForTimeout(100);return;}
    acted=await this.targets.resolve(step.target,this.page);
    if(!acted.descriptor.enabled&&step.op!=='inspect')throw Error('TARGET_DISABLED');
    await authorizeAction({...acted.descriptor,key:step.key},step.op,{local:this.local,authorizationId,url:this.page.url(),origin:this.origin});
    if(step.op==='click')await acted.handle.click({timeout:5000});
    if(step.op==='fill')await acted.handle.fill(step.value,{timeout:5000});
    if(step.op==='press')await acted.handle.press(step.key,{timeout:5000});
    if(step.op==='select') {
      const option=acted.options.find(option=>option.optionId===step.optionId),current=await describe(acted.handle);
      if(!option||current.options[option.index]?.value!==option.value||current.options[option.index]?.label!==option.label)throw Error('STALE_OPTION');
      await acted.handle.selectOption({index:option.index});
    }
    await this.page.waitForLoadState('domcontentloaded').catch(()=>{});await this.page.waitForTimeout(100);return acted;
  }
  async execute(command,params,{runId=randomUUID(),signal}={}) {
    validateBrowserCommand(command,params);
    const timeout=AbortSignal.timeout(90_000);signal=signal?AbortSignal.any([signal,timeout]):timeout;
    if(this.busy)throw Error('BROWSER_BUSY');this.busy=true;
    const directory=resolve(this.directory,'operations',runId),journalFile=resolve(directory,'journal.json');
    let old;
    try{await mkdir(directory,{recursive:true,mode:0o700});old=await readJson(journalFile,null);}
    catch{this.busy=false;return {status:'BLOCKED',reason:'LOCAL_STORAGE_UNAVAILABLE',steps:[],observation:null};}
    if(old){this.busy=false;return old.stage==='complete'?old.result:{status:'BLOCKED',reason:'INTERRUPTED_NO_REPLAY',steps:[],observation:null};}
    const result={status:'COMPLETED',reason:'OBSERVATION_CAPTURED',steps:[],observation:null};
    let tracing=false;
    const abort=()=>this.context?.close().catch(()=>{});
    try {
      if(signal?.aborted)throw Error('INTERRUPTED');
      if(params.checklistId) {
        const checklist=await readJson(resolve(this.local,'checklist.json'),{scenarios:[]});
        if(!checklist.scenarios.some(item=>item.id===params.checklistId))throw Error('UNKNOWN_CHECKLIST_ITEM');
      }
      await atomicJson(journalFile,{stage:'started',command,at:new Date().toISOString(),steps:[]});
      this.authBlocked=false;await this.ensure();signal?.addEventListener('abort',abort,{once:true});
      await this.context.tracing.start({screenshots:true,snapshots:true});tracing=true;
      let steps;
      if(command==='BROWSER_OPEN')steps=[{op:'open'}];
      else if(command==='BROWSER_RESET')steps=[{op:'reset'}];
      else if(command==='BROWSER_INSPECT')steps=[{op:'inspect'}];
      else steps=command==='BROWSER_ACT'?[params.action]:params.steps;
      for(const [index,step] of steps.entries()) {
        const row={index,op:step.op,status:'NOT TESTED',reason:'NOT_EXECUTED',assertions:[]};result.steps.push(row);
        await atomicJson(journalFile,{stage:'started',command,activeStep:index,steps:result.steps});
        try {
          if(signal?.aborted)throw Error('INTERRUPTED');
          let acted;
          if(step.op==='open') {
            const url=allowedUrl(params.url,this.origin);
            this.viewport=params.viewport||this.viewport;await this.page.setViewportSize(this.viewport==='mobile'?{width:375,height:812}:{width:1440,height:900});
            await this.page.goto(url,{waitUntil:'load'});
            // Readiness precondition; no product PASS is inferred from this marker.
            await this.page.locator('html[data-pk]').waitFor({timeout:5000}).catch(()=>{});
          }else if(step.op==='reset') {
            await this.persist();await this.targets.clear();await this.page.close();this.page=null;this.page=await this.context.newPage();this.wirePage();this.sessionId=randomUUID();
            await this.page.goto(allowedUrl(this.origin+'/',this.origin),{waitUntil:'domcontentloaded'});
          }else if(step.target)acted=await this.action(step,params.authorizationId);
          else if(step.op!=='inspect')await this.action(step,params.authorizationId);
          const observation=await this.capture(directory,index);row.observation=observation;result.observation=observation;
          for(const assertion of step.assertions||[])row.assertions.push(await this.assertOne(assertion,acted));
          if(row.assertions.some(a=>!a.passed)){row.status='FAIL';row.reason='ASSERTION_FAILED';result.status='REVIEW_REQUIRED';result.reason='ASSERTION_FAILED';break;}
          row.status='PASS';row.reason=row.assertions.length?'ASSERTIONS_VERIFIED':'ACTION_OBSERVED';
        }catch(error) {
          row.status='BLOCKED';row.reason=this.authBlocked?'LOCAL_LOGIN_REQUIRED':signal.aborted?(timeout.aborted?'EXECUTION_BUDGET_EXCEEDED':'INTERRUPTED'):/^[A-Z_]+$/.test(error.message)?error.message:'BROWSER_OPERATION_FAILED';
          await writeFile(resolve(directory,'private-error.txt'),String(error.stack||error),{mode:0o600});
          result.status='BLOCKED';result.reason=row.reason;
          row.observation=await this.capture(directory,index).catch(()=>null);result.observation=row.observation;break;
        }
      }
      for(let index=result.steps.length;index<steps.length;index++)result.steps.push({index,op:steps[index].op,status:'NOT TESTED',reason:'NOT_EXECUTED',assertions:[],observation:null});
      if(params.checklistId) {
        const file=resolve(this.directory,'checklist-links.json'),links=await readJson(file,{links:[]});
        links.links.push({checklistId:params.checklistId,runId,at:new Date().toISOString(),scope:'PARTIAL_INTERACTIVE_EVIDENCE',officialStatusChanged:false});await atomicJson(file,links);
      }
    }catch(error){result.status='BLOCKED';result.reason=/^[A-Z_]+$/.test(error.message)?error.message:'BROWSER_UNAVAILABLE';}
    finally {
      signal?.removeEventListener('abort',abort);
      if(tracing)await this.context?.tracing.stop({path:resolve(directory,'private-trace.zip')}).catch(()=>{});
      await atomicJson(journalFile,{stage:'complete',command,result,finishedAt:new Date().toISOString()});this.busy=false;
    }
    return result;
  }
}
