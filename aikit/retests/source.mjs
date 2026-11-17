import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {atomicJson} from '../lib/storage.mjs';
import {PROGRAM,reportIdentity} from './safety.mjs';
const clean=s=>String(s||'').normalize('NFC').replace(/\r/g,'').trim();
const aliases={LIVE:['Live, please check','Fixed, waiting for re-check','Live — please check','En ligne, à vérifier','Live, bitte prüfen','Publicado, por favor comprueba','Исправлено, проверьте','Готово, проверьте'],FIXED:['Fixed','Behoben','Corrigé','Исправлено'],OPEN:['Received','Being fixed','Looking into it','Получено'],CLOSED:["Won’t fix","Won't fix",'Closed']};
export function statusOf(text){const n=clean(text).replace(/\s+/g,' ').toLowerCase();return Object.keys(aliases).find(k=>aliases[k].some(x=>x.toLowerCase()===n))||'UNKNOWN'}
export function cardRecord(card,origin){
 const id=reportIdentity(card.href,origin),lines=clean(card.text).split('\n').map(s=>s.trim()).filter(Boolean),number=Number(lines[0]?.match(/^#(\d+)$/)?.[1]);
 if(!id||!number||!lines.some(s=>['Yours','Votre rapport','Dein Bericht','Tu informe','Ваш'].includes(s)))return null;
 const status=statusOf(lines.at(-1));return {id,number,url:origin+'/home/problems/'+id,listTitle:lines.slice(1,-2).join(' '),status,rawStatus:lines.at(-1),owned:true};
}
function section(text,start,end){const s=text.indexOf(start);if(s<0)return '';let tail=text.slice(s+start.length).trim();const positions=end.map(k=>tail.indexOf(k)).filter(n=>n>=0);return positions.length?tail.slice(0,Math.min(...positions)).trim():tail}
export function parseReport(card,text){
 text=clean(text);const number=Number(text.match(/(?:Report|Rapport|Bericht)\s*#(\d+)/)?.[1]);
 if(number!==card.number||/We couldn't find that report|report not found/i.test(text))throw Error('REPORT_UNAVAILABLE');
 const statusLine=text.slice(text.indexOf('#'+number)+String(number).length+1).trim().split('\n').find(s=>s.trim());
 const status=statusOf(statusLine);if(status==='UNKNOWN')throw Error('REPORT_STATUS_UNRECOGNIZED');
 const original=section(text,'What you said',['Did this fix it?','Still not right?','Your follow-ups','What we changed','Our reply']);
 const fix=section(text,'What we changed',[])||section(text,'Our reply',[]);
 if(original.length<50)throw Error('REPORT_SCHEMA_UNRECOGNIZED');
 const expected=original.match(/Expected(?: result| behavior)?:\s*([\s\S]*?)(?=\nActual(?: result| behavior)?:|$)/i)?.[1]?.trim()||'';
 const actual=original.match(/Actual(?: result| behavior)?:\s*([\s\S]*?)(?=\n(?:Impact|Severity|Suggestion|Suggested|Note|Reproducibility|Technical observation):|$)/i)?.[1]?.trim()||'';
 const steps=original.match(/Steps to reproduce:\s*([\s\S]*?)(?=\nExpected(?: result| behavior)?:|$)/i)?.[1]?.trim()||'';
 const history=section(text,'Your follow-ups',['What we changed','Our reply']);
 const report={...card,status,rawStatus:statusLine,title:original.split('\n')[0].replace(/^Title:\s*/,'').trim(),description:original,steps,expected,previousActual:actual,developerFix:fix,severity:original.match(/Severity:\s*(Critical|High|Medium|Low)/i)?.[1]?.toLowerCase()||'unassigned',area:original.match(/(?:Category|Area):\s*([^\n]+)/i)?.[1]||'unassigned',history,rawUi:text};
 report.revision=createHash('sha256').update(JSON.stringify([report.description,report.developerFix,report.status])).digest('hex');return report;
}

export class ReportSource {
 constructor(controller,local){this.controller=controller;this.local=local;this.origin=controller.origin;}
 async ready(){await this.controller.ensure();this.controller.reportUiEnabled=true;this.controller.reportUiIds||=new Set();}
 async discover({signal}={}){
  await this.ready();const page=this.controller.page;await page.setViewportSize({width:1440,height:900});this.controller.viewport='desktop';
  await page.goto(this.origin+PROGRAM+'?tab=reported',{waitUntil:'networkidle',timeout:20000});
  if(/\/login|\/auth/.test(new URL(page.url()).pathname))throw Error('LOCAL_LOGIN_REQUIRED');
  await page.getByRole('heading',{name:/Already reported|Déjà signalé|Bereits gemeldet/}).waitFor({timeout:10000});
  const all=page.locator('main').getByRole('button',{name:/^(?:All|Tous|Alle|Все)\s*\d+\b/i});await all.first().waitFor({state:'visible',timeout:10000});if(await all.count()!==1)throw Error('AMBIGUOUS_REPORT_FILTER');
  // SSR buttons can appear before hydration. Confirm the actual filter state;
  // a completed click is not evidence that All was selected.
  for(let attempt=0;attempt<3&&await all.getAttribute('aria-pressed')!=='true';attempt++){await all.click();for(let poll=0;poll<15&&await all.getAttribute('aria-pressed')!=='true';poll++)await page.waitForTimeout(100)}
  if(await all.getAttribute('aria-pressed')!=='true')throw Error('REPORT_FILTER_NOT_SELECTED');
  await page.waitForLoadState('networkidle',{timeout:5000});
  const found=new Map(),seenPages=new Set();let complete=false;
  for(let p=0;p<20;p++){
   signal?.throwIfAborted();await page.waitForTimeout(150);
   const links=await page.locator('main a[href]').evaluateAll(nodes=>nodes.map(a=>({href:a.href,text:a.innerText})));const signature=JSON.stringify(links);
   if(seenPages.has(signature)){if(p)throw Error('PAGINATION_DID_NOT_ADVANCE')}seenPages.add(signature);
   for(const link of links){const row=cardRecord(link,this.origin);if(row){const prior=found.get(row.id);if(prior&&prior.number!==row.number)throw Error('REPORT_IDENTITY_CONFLICT');if([...found.values()].some(r=>r.number===row.number&&r.id!==row.id))throw Error('REPORT_IDENTITY_CONFLICT');found.set(row.id,row);this.controller.reportUiIds.add(row.id)}}
   if(found.size>500)throw Error('DISCOVERY_LIMIT');
   const next=page.locator('main').getByRole('button',{name:/^(?:Next(?: page)?|Load more|Show more reports|Suivant|Weiter|Далее)\s*[→›]?$/i});
   if(!await next.count()||await next.first().isDisabled()){complete=true;break}if(await next.count()!==1)throw Error('AMBIGUOUS_PAGINATION');await next.click();
  }
  if(!complete)throw Error('DISCOVERY_LIMIT');
  if(!found.size)throw Error('NO_OWN_REPORTS_DISCOVERED');
  const result={version:1,at:new Date().toISOString(),origin:this.origin,source:this.origin+PROGRAM+'?tab=reported',complete,reports:[...found.values()].sort((a,b)=>a.number-b.number)};
  await atomicJson(resolve(this.local,'retests/inventory.json'),result);return result;
 }
 async read(card){
  await this.ready();if(!card.owned||reportIdentity(card.url,this.origin)!==card.id)throw Error('REPORT_OWNERSHIP_UNVERIFIED');
  this.controller.reportUiIds.add(card.id);await this.controller.page.goto(card.url,{waitUntil:'networkidle',timeout:20000});
  const text=await this.controller.page.locator('main').innerText({timeout:5000});if(text.length>100000)throw Error('TEXT_SCOPE_LIMIT');
  const report=parseReport(card,text);await atomicJson(resolve(this.local,'retests/reports',card.id+'.json'),report);return report;
 }
 close(){this.controller.reportUiEnabled=false;this.controller.reportUiIds=new Set();}
}
