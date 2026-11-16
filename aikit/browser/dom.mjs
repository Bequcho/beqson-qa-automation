import {randomBytes,createHash} from 'node:crypto';
import {classify,allowedOperations,descriptorFingerprint} from './policy.mjs';

export const opaque=prefix=>prefix+'_'+randomBytes(12).toString('hex');
const SELECTOR='button,a[href],input,textarea,select,[role="button"],[role="tab"],[role="searchbox"],[role="combobox"],[role="checkbox"],[role="radio"]';
export async function describe(handle) {
  return handle.evaluate(element=>{
    const rect=element.getBoundingClientRect(),style=getComputedStyle(element);
    const visible=rect.width>0&&rect.height>0&&rect.right>0&&rect.bottom>0&&rect.left<innerWidth&&rect.top<innerHeight&&style.display!=='none'&&style.visibility!=='hidden';
    const tag=element.tagName.toLowerCase(),type=element.getAttribute('type')||'';
    const labels=element.labels?[...element.labels].map(n=>n.textContent).join(' '):'';
    const by=element.getAttribute('aria-labelledby')?.split(/\s+/).map(id=>document.getElementById(id)?.textContent||'').join(' ');
    const label=(element.getAttribute('aria-label')||by||labels||element.getAttribute('placeholder')||element.innerText||element.getAttribute('title')||'').replace(/\s+/g,' ').trim().slice(0,500);
    let role=element.getAttribute('role')||(tag==='a'?'link':tag==='button'?'button':tag==='select'?'combobox':tag==='textarea'?'textbox':tag==='input'?(type==='search'?'searchbox':['checkbox','radio'].includes(type)?type:'textbox'):'other');
    const expanded=element.getAttribute('aria-expanded');
    return {tag,type,label,role,visible,href:element.getAttribute('href'),form:!!element.closest('form'),inputMode:element.getAttribute('inputmode'),controls:element.getAttribute('aria-controls'),expanded:expanded===null?null:expanded==='true',enabled:!element.disabled&&element.getAttribute('aria-disabled')!=='true',sensitive:['password','file','hidden'].includes(type)||element.getAttribute('autocomplete')==='current-password',options:tag==='select'?[...element.options].slice(0,30).map((option,index)=>({index,value:option.value,label:option.textContent||'',selected:option.selected})):[]};
  });
}

export class Targets {
  constructor(){this.snapshots=new Map();this.latest=null;this.handles=new Set();}
  async clear(){const handles=[...this.handles];this.handles.clear();this.snapshots.clear();this.latest=null;for(const handle of handles)await handle.dispose().catch(()=>{});}
  async capture(page,{sessionId,viewport}) {
    const handles=await page.locator(SELECTOR).elementHandles(),records=[];
    const previous=this.latest?.records||[];
    for(const handle of handles.slice(0,300)) {
      const descriptor=await describe(handle).catch(()=>null);
      if(!descriptor?.visible){await handle.dispose().catch(()=>{});continue;}
      if(records.length>=60){await handle.dispose().catch(()=>{});continue;}
      const fingerprint=descriptorFingerprint(descriptor);
      let reused;
      const matching=previous.filter(r=>r.fingerprint===fingerprint);
      if(matching.length===1&&await matching[0].handle.evaluate((node,current)=>node===current,handle).catch(()=>false))reused=matching[0];
      const active=reused?.handle||handle;
      this.handles.add(active);
      if(reused)await handle.dispose().catch(()=>{});
      records.push({elementId:reused?.elementId||opaque('e'),handle:active,descriptor,fingerprint,options:descriptor.options.map(option=>({...option,optionId:opaque('o')}))});
    }
    for(const handle of handles.slice(300))await handle.dispose().catch(()=>{});
    for(const record of records){record.descriptor.ambiguous=records.filter(r=>r.fingerprint===record.fingerprint).length>1;}
    const snapshotId=opaque('s');
    const extra=await page.evaluate(()=>{
      const visible=node=>{const r=node.getBoundingClientRect();return r.width>0&&r.height>0&&r.bottom>0&&r.top<innerHeight&&getComputedStyle(node).visibility!=='hidden';};
      return {headings:[...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].filter(visible).slice(0,12).map(n=>n.textContent||''),validationMessages:[...document.querySelectorAll('[role="alert"],[aria-live="assertive"],[aria-invalid="true"]')].filter(visible).slice(0,10).map(n=>n.validationMessage||n.textContent||'')};
    });
    const snapshot={snapshotId,sessionId,url:page.url(),viewport,...extra,truncated:handles.length>300||records.length===60,controls:records.map(record=>({elementId:record.elementId,role:record.descriptor.role,label:record.descriptor.label,kind:classify(record.descriptor),enabled:record.descriptor.enabled,ambiguous:record.descriptor.ambiguous,...(record.descriptor.expanded!==null?{expanded:record.descriptor.expanded}:{}),allowedOps:allowedOperations(record.descriptor),options:record.options.map(({optionId,label,selected})=>({optionId,label,selected}))}))};
    const entry={snapshotId,at:Date.now(),url:page.url(),records,snapshot};
    this.snapshots.set(snapshotId,entry);this.latest=entry;
    while(this.snapshots.size>8)this.snapshots.delete(this.snapshots.keys().next().value);
    const retained=new Set([...this.snapshots.values()].flatMap(s=>s.records.map(r=>r.handle)));
    for(const handle of this.handles)if(!retained.has(handle)){await handle.dispose().catch(()=>{});this.handles.delete(handle);}
    return snapshot;
  }
  async resolve(target,page,{acted,assertion=false}={}) {
    let entry,record;
    if(target.ref==='acted'&&assertion){if(!acted)throw Error('NO_ACTED_TARGET');return acted;}
    if(target.ref==='last') {
      entry=this.latest;if(!entry)throw Error('INSPECTION_REQUIRED');
      const matches=entry.records.filter(r=>Object.entries(target.match).every(([key,value])=>key==='kind'?classify(r.descriptor)===value:key==='label'?r.descriptor.label===value:r.descriptor.role===value));
      if(matches.length!==1)throw Error(matches.length?'AMBIGUOUS_TARGET':'TARGET_NOT_FOUND');record=matches[0];
    }else {entry=this.snapshots.get(target.snapshotId);record=entry?.records.find(r=>r.elementId===target.elementId);}
    if(!entry||!record||Date.now()-entry.at>120_000)throw Error('STALE_TARGET');
    if(entry.url!==page.url())throw Error('STALE_TARGET');
    const current=await describe(record.handle).catch(()=>null);
    if(!current?.visible||descriptorFingerprint(current)!==record.fingerprint)throw Error('STALE_TARGET');
    if(record.descriptor.ambiguous)throw Error('AMBIGUOUS_TARGET');
    // Detect a duplicate inserted after inspection rather than silently picking one.
    const duplicates=await page.locator(SELECTOR).evaluateAll((nodes,wanted)=>{
      const fingerprint=node=>{
        const tag=node.tagName.toLowerCase(),type=node.getAttribute('type')||'',labels=node.labels?[...node.labels].map(n=>n.textContent).join(' '):'',by=node.getAttribute('aria-labelledby')?.split(/\s+/).map(id=>document.getElementById(id)?.textContent||'').join(' ');
        const label=(node.getAttribute('aria-label')||by||labels||node.getAttribute('placeholder')||node.innerText||node.getAttribute('title')||'').replace(/\s+/g,' ').trim().slice(0,500);
        const role=node.getAttribute('role')||(tag==='a'?'link':tag==='button'?'button':tag==='select'?'combobox':tag==='textarea'?'textbox':tag==='input'?(type==='search'?'searchbox':['checkbox','radio'].includes(type)?type:'textbox'):'other');
        return JSON.stringify([tag,role,label,node.getAttribute('href'),type,!!node.closest('form'),node.getAttribute('aria-controls'),node.getAttribute('inputmode')]);
      };
      return nodes.filter(node=>{const r=node.getBoundingClientRect();return r.width>0&&r.height>0&&r.right>0&&r.bottom>0&&r.left<innerWidth&&r.top<innerHeight&&fingerprint(node)===wanted;}).length;
    },JSON.stringify([current.tag,current.role,current.label,current.href,current.type,current.form,current.controls,current.inputMode]));
    if(duplicates!==1)throw Error('AMBIGUOUS_TARGET');
    return {...record,descriptor:current};
  }
}
