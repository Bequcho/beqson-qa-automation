import {resolve} from 'node:path';
import {atomicJson} from '../lib/storage.mjs';
import {allowedUrl,requestAllowed} from '../browser/policy.mjs';
import {normalize,quoted,assertion,verdict,addressComparison} from './comparisons.mjs';

export class Drivers {
 constructor(controller,directory,{signal}={}){this.c=controller;this.page=controller.page;this.directory=directory;this.signal=signal;this.actions=[];this.assertions=[];this.captures=0;}
 async isolatePublic(){this.publicContext=await this.c.browser.newContext({serviceWorkers:'block',acceptDownloads:false});await this.publicContext.route('**/*',route=>requestAllowed(route.request(),this.c.origin)?route.continue():route.abort());await this.publicContext.routeWebSocket('**/*',s=>s.close());this.page=await this.publicContext.newPage();this.page.on('dialog',d=>d.dismiss());this.page.on('download',d=>d.cancel());await this.publicContext.tracing.start({screenshots:true,snapshots:true});}
 async close(){if(this.publicContext){await this.publicContext.tracing.stop({path:resolve(this.directory,'private-test-trace.zip')}).catch(()=>{});await this.publicContext.close();this.publicContext=null}}
 async open(path,viewport={width:1440,height:900}){
  this.signal?.throwIfAborted();const url=allowedUrl(this.c.origin+path,this.c.origin);this.actions.push({op:'navigate',url,viewport});
  if(this.publicContext)await this.publicContext.clearCookies();
  await this.page.setViewportSize(viewport);if(!this.publicContext)this.c.viewport=viewport.width<600?'mobile':'desktop';
  const response=await this.page.goto(url,{waitUntil:'networkidle',timeout:20000});
  if(response?.status()>=400)throw Error('TEST_TARGET_UNAVAILABLE');
  if(new URL(this.page.url()).pathname!==path||this.c.authBlocked){this.actions.push({op:'unexpected-target',actualUrl:this.page.url()});throw Error('TEST_TARGET_REDIRECTED')}
  const text=await this.text();if(text.length<100||/you seem to be offline|the .+ didn.t open/i.test(text))throw Error('TEST_UI_NOT_READY');return text;
 }
 async text(){const text=await this.page.locator('main').count()?await this.page.locator('main').first().innerText():await this.page.locator('body').innerText();if(text.length>100000)throw Error('TEXT_SCOPE_LIMIT');return text}
 async capture(label){const n=this.captures++;await this.page.screenshot({path:resolve(this.directory,`screenshot-${n}.png`)});const record={label,url:this.page.url(),title:await this.page.title(),text:await this.text(),viewport:this.page.viewportSize(),at:new Date().toISOString()};await atomicJson(resolve(this.directory,`dom-${n}.json`),record);return record;}
 async faq(){
  const details=this.page.locator('details');let texts=[],opened=0;if(await details.count()>30)throw Error('FAQ_CONTENT_INCOMPLETE');
  for(let i=0;i<Math.min(await details.count(),30);i++){const node=details.nth(i),summary=node.locator('summary').first();if(!await summary.isVisible())continue;if(await node.getAttribute('open')===null){await summary.click({timeout:3000});this.actions.push({op:'expand-faq',index:i});opened++}if(!await node.evaluate(e=>e.open))throw Error('FAQ_CONTENT_INCOMPLETE');const full=await node.innerText();if(full.length<(await summary.innerText()).length+10)throw Error('FAQ_CONTENT_INCOMPLETE');texts.push(full)}
  if(!texts.length){const scope=this.page.locator('#faq,[data-testid="faq"]');if(await scope.count()!==1)throw Error('FAQ_NOT_LOCATED');const buttons=scope.getByRole('button');for(let i=0;i<Math.min(await buttons.count(),30);i++){const button=buttons.nth(i);if(await button.getAttribute('aria-expanded')==='false'){await button.click({timeout:3000});opened++;this.actions.push({op:'expand-faq',index:i})}}texts=[await scope.innerText()]}
  const text=texts.join('\n\n');if(text.length<80)throw Error('FAQ_CONTENT_INCOMPLETE');await this.capture('expanded-faq');return {text,opened,count:texts.length};
 }
 async execute(spec,report){
  this.spec=spec;
  if(spec.blocker)return {status:'BLOCKED',reason:spec.blocker,executed:false,assertions:[],actions:[],spec};
  if(['greek','german','punjabi','rtl-overflow','upload-limits'].includes(spec.driver))await this.isolatePublic();
  let result;
  if(spec.driver==='rtl-overflow')result=await this.overflow(spec);
  else if(['german','greek','punjabi'].includes(spec.driver))result=await this.localization(spec,report);
  else if(spec.driver==='upload-limits')result=await this.uploadLimits(spec,report);
  else if(spec.driver==='hosting-copy')result=await this.hosting(spec);
  else if(spec.driver==='framework-copy')result=await this.framework(spec);
  else result={status:'BLOCKED',reason:'LIVE_DRIVER_NOT_IMPLEMENTED',assertions:[]};
  return {...result,executed:this.actions.length>0,actions:this.actions,spec,technicalSuccess:true,bugFixVerified:result.status==='PASS',environment:{browser:'Chromium',version:this.c.browser.version(),viewport:this.page.viewportSize(),platform:process.platform,publicIsolated:!!this.publicContext}};
 }
 async localization(spec,report){
  const initial=await this.open(spec.targets[0]);const title=await this.page.title();await this.capture('before-disclosures');
  if(spec.driver==='greek'){
   const bad=report.previousActual.match(/page title contains\s*["“]([^"”]+)["”]/i)?.[1];
   const good=report.description.match(/Suggested correction:\s*["“]([^"”]+)["”]/i)?.[1];
   const fixes=quoted(report.developerFix).filter(s=>/[\u0370-\u03ff]/.test(s));
   if(!bad||!good||!fixes.length)throw Error('LITERAL_ORACLE_NOT_EXTRACTABLE');
   const checks=[assertion('title-gender-old',!normalize(title).includes(normalize(bad)),'Original incorrect title wording absent',title),assertion('title-gender-correction',normalize(title).includes(normalize(good))?true:null,good,title),...fixes.filter(x=>x!==good).map((x,i)=>assertion('formal-cta-'+i,normalize(initial).includes(normalize(x))?true:null,x,initial))];
   return verdict(checks,{review:true,reason:'LINGUISTIC_REVIEW_REQUIRED'});
  }
  const faq=await this.faq();
  if(spec.driver==='german')return addressComparison({marketing:initial,faq:faq.text,oldPhrases:quoted(report.previousActual).filter(p=>p.length>20&&/\bSie|Ihnen\b/.test(p))});
  const originalFaq=report.previousActual.split(/FAQ:/i)[1]||'',old=quoted(originalFaq).filter(p=>p.length>5);
  if(!old.length)throw Error('LITERAL_ORACLE_NOT_EXTRACTABLE');
  const present=old.filter(p=>normalize(faq.text).includes(normalize(p)));
  const native=(faq.text.match(/تسی|نیں|کیتا|کیتے|اک|اے/g)||[]).length;
  return verdict([assertion('reported-urdu-phrases',!present.length,'Original reported Urdu wording absent',present),assertion('punjabi-evidence',native>1?true:null,'Positive Punjabi wording evidence in the actual FAQ',native)],{review:true,reason:'LINGUISTIC_REVIEW_REQUIRED'});
 }
 async overflow(spec){
  const checks=this.assertions;
  for(const path of spec.targets){
   await this.open(path,{width:375,height:812});const skip=this.page.locator('.v3-skip');if(await skip.count()!==1)throw Error('ORIGINAL_COMPONENT_NOT_LOCATED');
   const dir=await this.page.evaluate(()=>getComputedStyle(document.body).direction);checks.push(assertion('rtl-'+path,dir==='rtl','RTL document',dir));
   for(const phase of ['initial','horizontal-scroll','skip-focus']){
    if(phase==='horizontal-scroll'){await this.page.mouse.wheel(800,0);this.actions.push({op:'horizontal-scroll',deltaX:800});await this.page.waitForTimeout(100)}
    if(phase==='skip-focus'){await skip.focus();this.actions.push({op:'focus-original-skip-link'});await this.page.waitForTimeout(100)}
    const metrics=await this.page.evaluate(()=>({viewportWidth:innerWidth,viewportHeight:innerHeight,documentWidth:Math.max(document.documentElement.scrollWidth,document.body.scrollWidth),scrollX,mainWidth:(document.querySelector('main')||document.body).getBoundingClientRect().width}));
    checks.push(assertion(path+'-'+phase+'-viewport',metrics.viewportWidth===375&&metrics.viewportHeight===812,'375 x 812 CSS pixels',metrics),assertion(path+'-'+phase+'-width',metrics.documentWidth<=376,'No original excessive horizontal document overflow',metrics.documentWidth));
    await this.capture(path.slice(1)+'-'+phase);
   }
  }return verdict(checks);
 }
 async uploadLimits(spec,report){
  const m=report.developerFix.match(/(?:up to|до)\s*(\d+)\s*(?:MB|МБ)[\s\S]*?(?:music|audio|музык)[\s\S]*?(\d+)\s*(?:MB|МБ)/i);if(!m)throw Error('LITERAL_ORACLE_NOT_EXTRACTABLE');
  const general=Number(m[1]),audio=Number(m[2]),checks=this.assertions;
  for(const path of [spec.targets[0],spec.targets[2]]){
   await this.open(path);const heading=this.page.getByRole('heading',{name:/Included with a free aiKit account|Входит в бесплатн|Включено в бесплатн/i});if(await heading.count()!==1)throw Error('INCLUDED_SECTION_NOT_LOCATED');
   const included=await heading.evaluate(e=>{const all=[...document.querySelectorAll('h1,h2,h3,h4,h5,h6')],level=Number(e.tagName[1]),end=all.slice(all.indexOf(e)+1).find(n=>Number(n.tagName[1])<=level);if(!end)return '';const range=document.createRange();range.setStartAfter(e);range.setEndBefore(end);return range.cloneContents().textContent||''});if(included.length<50)throw Error('INCLUDED_SECTION_NOT_LOCATED');
   checks.push(assertion(path+'-general-limit',new RegExp(general+'\\s*(?:MB|МБ)','i').test(included),general+' MB',included),assertion(path+'-audio-exception',new RegExp('(?:music|audio|музык|аудио)[\\s\\S]{0,100}'+audio+'\\s*(?:MB|МБ)','i').test(included),audio+' MB alongside general limit',included));
   await heading.scrollIntoViewIfNeeded();await this.capture('included-limit-copy');const faq=await this.faq();checks.push(assertion(path+'-faq-audio',new RegExp(audio+'\\s*(?:MB|МБ)','i').test(faq.text),audio+' MB',faq.text));await this.capture('included-and-faq');
  }
  const help=await this.open(spec.targets[1]);checks.push(assertion('help-audio-limit',new RegExp(audio+'\\s*MB','i').test(help),audio+' MB',help));await this.capture('help-documentation');return verdict(checks);
 }
 async hosting(spec){
  const checks=this.assertions;for(const path of spec.targets){const text=await this.open(path);await this.capture('hosting-copy');checks.push(assertion(path+'-90-days',/90\s*(?:days|day)/i.test(text),'90-day free term disclosed',text),assertion(path+'-yearly-plan',/(?:paid|yearly|annual)[\s\S]{0,80}(?:plan|year)|plan[\s\S]{0,80}(?:yearly|annual)/i.test(text),'Paid yearly plan disclosed',text),assertion(path+'-stay-live',/stay[s]?\s+live|remain[s]?\s+live/i.test(text),'Stays live until the plan is available',text))}return verdict(checks,{review:true,reason:'HOSTING_COPY_REVIEW_REQUIRED'});
 }
 async framework(spec){
  const text=await this.open(spec.targets[0]);const readonly=await this.page.locator('pre,textarea[readonly]').allTextContents();const values=await this.page.locator('textarea[readonly]').evaluateAll(es=>es.map(e=>e.value));const prompt=[...readonly,...values].join('\n');
  if(prompt.length<300||!/framework|React|Next\.js/i.test(prompt))throw Error('COMPLETE_SETUP_PROMPT_UNAVAILABLE');
  await atomicJson(resolve(this.directory,'private-prompt.json'),{prompt,text});await this.capture('complete-framework-prompt');
  return verdict([assertion('framework-support',/React|Next\.js|Vite|Astro/.test(prompt),'Framework support described',prompt),assertion('universal-static-rule',!/Whatever the path, the result must match this shape|No React\/Next\/Vite\/Astro project/.test(prompt),'Original unconditional static-only restriction absent',prompt)],{review:true,reason:'INSTRUCTION_BRANCH_REVIEW_REQUIRED'});
 }
}
