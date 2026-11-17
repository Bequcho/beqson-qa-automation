import {randomUUID} from 'node:crypto';import {Drivers} from './drivers.mjs';import {offlineOrigin,ApprovalLedger} from '../sandbox/grants.mjs';
import {importFixtures,DOCUMENT_TEXT} from './fixtures.mjs';import {paragraphComparison,transformationComparison,overflowComparison,verdict,assertion} from './comparisons.mjs';
// Offline adapter contracts only. Not imported by the production command runner;
// no queue field can select this class, its scope or its fixtures.
export class MockWorkflowDrivers extends Drivers {
 constructor(controller,directory,options,{scope,grantId,source,golden,title='QA original title',required=[],entities=[]}){super(controller,directory,options);offlineOrigin(controller.origin);if(controller.origin!==scope.origin)throw Error('LOCAL_GRANT_SCOPE_MISMATCH');this.scope=scope;this.grantId=grantId;this.ledger=new ApprovalLedger(controller.local);Object.assign(this,{source,golden,title,required,entities});}
 async reserve(operation,estimatedTokens=0){return this.ledger.reserve(this.grantId,{...this.scope,operation,estimatedTokens,...(operation==='generate'?{tool:'qa-tone',artifactId:'wav'}:{})},randomUUID())}
 async ownership(){const actual=await this.page.locator('[data-qa-object]').evaluate(e=>({...e.dataset}));for(const [a,b]of [['qaObject','objectId'],['qaOwner','account'],['qaRun','runId'],['qaRoute','route']])if(actual[a]!==this.scope[b])throw Error('LOCAL_GRANT_SCOPE_MISMATCH');}
 async execute(spec,report){
  this.spec=spec;
  if(!['document-import','text-transform','editor-overflow'].includes(spec.driver))return super.execute(spec,report);
  let result;const fixtureChecksums=[];
  if(spec.driver==='document-import'){
   const fixtures=await importFixtures(this.page,this.directory),checks=[];
   for(const fixture of fixtures){
    const grant=await this.reserve('upload');if(fixture.buffer.length>grant.maxBytes)throw Error('SCOPED_UPLOAD_GRANT_REQUIRED');
    await this.open('/tools/voice-kit');await this.ownership();await this.page.locator('input[type="file"]').setInputFiles({name:fixture.name,mimeType:fixture.mimeType,buffer:fixture.buffer});this.actions.push({op:'select-synthetic-fixture',name:fixture.name,sha256:fixture.sha256});
    await this.page.locator('[data-qa-imported="true"]').waitFor();const actual=await this.page.locator('[data-qa-script]').inputValue();const compared=paragraphComparison(DOCUMENT_TEXT,actual);checks.push(...compared.assertions.map(a=>({...a,id:fixture.name+'-'+a.id})));fixtureChecksums.push(fixture.sha256);await this.capture(fixture.name);
   }result=verdict(checks);
  }
  if(spec.driver==='text-transform'){
   await this.open('/tools/voice-kit');await this.ownership();await this.reserve('generate',3);
   const source=await this.page.locator('[data-qa-script]').inputValue(),sourceTitle=await this.page.locator('[data-qa-title]').inputValue();
   if(source!==this.source||sourceTitle!==this.title)throw Error('LOCAL_GRANT_SCOPE_MISMATCH');
   await this.page.locator('[data-qa-request]').fill('Translate the entire script. Preserve every paragraph, named entity, delivery note and the title. Do not omit, summarize or add content.');
   await this.page.getByRole('button',{name:'Apply QA translation',exact:true}).click();this.actions.push({op:'apply-mock-translation',estimatedTokens:3});await this.page.locator('[data-qa-transformed="true"]').waitFor();
   result=transformationComparison({source,actual:await this.page.locator('[data-qa-script]').inputValue(),sourceTitle,actualTitle:await this.page.locator('[data-qa-title]').inputValue(),required:this.required,entities:this.entities,golden:this.golden});await this.capture('mock-transformation');
  }
  if(spec.driver==='editor-overflow'){
   await this.reserve('read');await this.open('/home/projects',{width:390,height:844});await this.ownership();await this.page.getByRole('button',{name:'Open QA editor',exact:true}).click();this.actions.push({op:'open-actual-editor'});
   const samples=[];for(const phase of['opened','reopened']){if(phase==='reopened'){await this.page.getByRole('button',{name:'Close QA assistant',exact:true}).click();await this.page.getByRole('button',{name:'Open QA assistant',exact:true}).click();this.actions.push({op:'close-and-reopen-actual-assistant'})}const target=this.page.locator('[data-qa-assistant]');await target.waitFor({state:'visible'});samples.push(await target.evaluate(e=>{const r=e.getBoundingClientRect();return{viewportWidth:innerWidth,documentWidth:document.documentElement.scrollWidth,targetLeft:r.left,targetRight:r.right,targetVisible:r.width>0&&r.height>0}}));await this.capture(phase)}result=overflowComparison(samples,390);
  }
  return {...result,executed:true,technicalSuccess:true,bugFixVerified:result.status==='PASS',actions:this.actions,spec,fixtureChecksums,environment:{browser:'Chromium',version:this.c.browser.version(),viewport:this.page.viewportSize(),mockOnly:true},tokenUsage:spec.driver==='text-transform'?{kind:'reserved-offline-mock',reservedTokens:3,liveGenerationExecuted:false}:null};
 }
}
