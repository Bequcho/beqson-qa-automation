import {createServer} from 'node:http';import {mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {randomUUID,generateKeyPairSync,sign} from 'node:crypto';
import {atomicJson} from '../lib/storage.mjs';import {BrowserController} from '../browser/controller.mjs';import {RetestEngine} from '../retests/engine.mjs';import {PROGRAM} from '../retests/safety.mjs';import {buildSpec} from '../retests/plans.mjs';import {MockWorkflowDrivers} from '../retests/mock-workflows.mjs';import {canonical} from '../sandbox/grants.mjs';import {DOCUMENT_TEXT} from '../retests/fixtures.mjs';
export const SOURCE_SCRIPT='QA Cycle keeps your bicycle ready. [pause 1.5s]\n\nQA Cycle offers a careful inspection. (steady delivery)\n\nQA Cycle keeps your bicycle ready. [pause 1.5s]';
export const GOLDEN_SCRIPT='QA Cycle mantiene tu bicicleta lista. [pause 1.5s]\n\nQA Cycle ofrece una revisión cuidadosa. (steady delivery)\n\nQA Cycle mantiene tu bicicleta lista. [pause 1.5s]';
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function original(number){
 if(number===435)return {title:'QA German addressing',actual:'Marketing uses informal wording. FAQ uses "Dateien, die Sie speichern, gehören Ihnen."',expected:'Use consistent friendly address in marketing and FAQ.',fix:'The FAQ uses friendly du now.'};
 if(number===433)return {title:'QA Greek gender',actual:'The page title contains "το καλό τσάντα". Suggested correction:\n"η καλή τσάντα"',expected:'Correct title gender and consistent formal wording.',fix:'The title is "η καλή τσάντα" and the action is "Δείτε το δείγμα".'};
 if(number===384)return {title:'QA Graphics Library upload limits',actual:'The general size statement omits the lower audio exception.',expected:'Audio exceptions appear next to the general limit and agree with FAQ and Help.',fix:'Files up to 25 MB each, music up to 15 MB each.'};
 const names={453:'RTL mobile overflow',389:'editor assistant overflow',465:'DOCX paragraph import',470:'AI Writer translation',472:'pronunciation suggestions',371:'learned notes'};
 return {title:'QA '+(names[number]||'synthetic report '+number),actual:'The original named component exhibits the reported regression.',expected:'The exact named behavior and output are verified against the known synthetic source.',fix:'The specific behavior is fixed; please retest.'};
}
export async function retestFixture(t,config={}){
 const local=await mkdtemp(join(tmpdir(),'aikit-retests-')),records=(config.numbers||[435]).map(number=>({id:randomUUID(),number,status:'Live, please check',...original(number),...(config.reportOverrides?.[number]||{})}));
 const counts={writes:0,visits:{}};let active=records[0]?.number;
 const scope={origin:'',account:'qa-retests',objectId:'qa-'+randomUUID(),objectName:'QA retest object',runId:randomUUID()};scope.route='/qa/projects/'+scope.objectId;
 const server=createServer(async(req,res)=>{
  const u=new URL(req.url,'http://127.0.0.1');counts.visits[u.pathname]=(counts.visits[u.pathname]||0)+1;if(!['GET','HEAD'].includes(req.method))counts.writes++;
  res.setHeader('content-type','text/html; charset=utf-8');const wrap=(body,title='QA fixture',dir='ltr')=>`<!doctype html><html lang="en" dir="${dir}" data-pk="light"><head><title>${esc(title)}</title></head><body>${body}</body></html>`;
  if(u.pathname===PROGRAM){
   if(!req.headers.cookie?.includes('qa-session=fixture')){res.writeHead(302,{location:'/login'});res.end();return}
   const page=Number(u.searchParams.get('page')||1),size=config.pageSize||500,list=records.slice((page-1)*size,page*size);
   res.end(wrap(`<main><h1>Already reported</h1><button aria-pressed="true">All ${records.length}</button>${list.map(r=>`<a style="display:block;white-space:pre-line" href="/home/problems/${r.id}">#${r.number}\n${esc(r.title)}\nYours\n${esc(r.status)}</a>`).join('')}${page*size<records.length?`<button onclick="location.href='${PROGRAM}?tab=reported&page=${page+1}'">Next</button>`:''}</main>`));return;
  }
  if(u.pathname.startsWith('/home/problems/')){
   const r=records.find(r=>r.id===u.pathname.split('/').at(-1));active=r?.number;
   if(!r||config.missingNumbers?.includes(r.number)){res.statusCode=404;res.end(wrap('<main>We couldn\'t find that report.</main>'));return}
   const text=`Your reports\n\nReport #${r.number}\n${r.status==='Live, please check'?'Fixed, waiting for re-check':r.status}\n\nSent today\n\nReceived\nBeing fixed\nLive, please check\nFixed\n\nWhat you said\n\n${r.title}\n\nSteps to reproduce:\n1. Open the named synthetic fixture.\n2. Exercise the reported component and compare its output.\n\nExpected:\n${r.expected}\n\nActual:\n${r.actual}\n\nSeverity: ${r.severity||'Low'}\nCategory: QA synthetic tests\n\nDid this fix it?\n\nWhat we changed\n\n${r.fix}`;
   res.end(wrap('<main style="white-space:pre-wrap"><h1>QA report details</h1>'+esc(text)+'</main>'));return;
  }
  if(['/de','/el','/pa-Arab'].includes(u.pathname)&&active!==453){
   if(u.pathname==='/de')res.end(wrap('<main><h1>QA German fixture</h1><p>Hier findest du die Werkzeuge, die du gerne nutzt. Du kannst deine eigenen Beispiele in Ruhe lesen und prüfen.</p><details><summary>Wie speicherst du deine Dateien?</summary><p>'+esc(config.germanBroken?'Dateien, die Sie speichern, gehören Ihnen. Sie behalten alle Rechte an Ihren Dateien.':'Dateien, die du speicherst, gehören dir. Du behältst alle Rechte an deinen eigenen Dateien und kannst sie jederzeit prüfen.')+'</p></details></main>'));
   else if(u.pathname==='/el')res.end(wrap('<main><h1>Δείτε το δείγμα</h1><p>'+('Ένα συνθετικό παράδειγμα για έλεγχο. '.repeat(8))+'</p></main>','η καλή τσάντα'));
   else res.end(wrap('<main><h1>QA Punjabi fixture</h1><p>'+('تسی اک نمونہ ویکھدے نیں۔ '.repeat(8))+'</p><details><summary>ایہ کی اے؟</summary><p>'+('تسی اک سوال پچھدے نیں۔ '.repeat(8))+'</p></details></main>'));return;
  }
  if(['/he','/ar','/pa-Arab'].includes(u.pathname)){
   res.end(wrap(`<style>html,body{margin:0}main{width:${config.overflowBroken?'1400px':'100%'}}.v3-skip{position:fixed;left:0;top:-100px}.v3-skip:focus{top:0}</style><a class="v3-skip" href="#main">Skip</a><main id="main">${'Synthetic RTL content '.repeat(20)}</main>`,'QA RTL','rtl'));return;
  }
  if(u.pathname==='/home/projects'){
   res.end(wrap(`<main data-qa-object="${scope.objectId}" data-qa-owner="${scope.account}" data-qa-run="${scope.runId}" data-qa-route="${scope.route}"><h1>QA editor fixture</h1><p>${'Scoped synthetic editor content. '.repeat(8)}</p><button onclick="document.querySelector('[data-qa-assistant]').hidden=false">Open QA editor</button><button onclick="document.querySelector('[data-qa-assistant]').hidden=false">Open QA assistant</button><aside hidden data-qa-assistant style="position:fixed;top:100px;left:${config.editorBroken?'-19':'0'}px;width:370px;height:300px;background:white"><button onclick="this.parentNode.hidden=true">Close QA assistant</button><button>Chat</button><button>Suggestion</button></aside></main>`));return;
  }
  if(u.pathname==='/tools/voice-kit'){
   const changed=config.writerBroken?GOLDEN_SCRIPT.split('\n\n').slice(0,1).join('\n\n'):GOLDEN_SCRIPT;
   const script=`const input=document.querySelector('input[type=file]');input.onchange=()=>{const f=input.files[0];if(!f)return;const text=${JSON.stringify(DOCUMENT_TEXT)};document.querySelector('[data-qa-script]').value=${config.docxBroken?'f.name.endsWith(".docx")?text.replace(/\\n+/g," "):text':'text'};input.dataset.qaImported='true'};document.querySelector('button').onclick=()=>{document.querySelector('[data-qa-script]').value=${JSON.stringify(changed)};document.querySelector('button').dataset.qaTransformed='true'};`;
   res.end(wrap(`<main data-qa-object="${scope.objectId}" data-qa-owner="${scope.account}" data-qa-run="${scope.runId}" data-qa-route="${scope.route}"><h1>QA Voice Kit fixture</h1><p>${'Synthetic isolated workflow data. '.repeat(5)}</p><input type="file"><textarea data-qa-script>${esc(SOURCE_SCRIPT)}</textarea><input data-qa-title value="QA original title" readonly><textarea data-qa-request></textarea><button>Apply QA translation</button></main><script>${script}</script>`));return;
  }
  if(['/tools/graphics-library','/ru/tools/graphics-library'].includes(u.pathname)){
   if(u.pathname.startsWith('/ru/'))res.setHeader('set-cookie','qa-locale=ru; Path=/');
   const ru=u.pathname.startsWith('/ru/');res.end(wrap(`<main><h1>QA Graphics Library</h1><p>${'Synthetic product copy with original limits. '.repeat(4)}</p><h3>${ru?'Входит в бесплатный аккаунт aiKit':'Included with a free aiKit account'}</h3><p>${ru?'Файлы до 25 МБ':'Files up to 25 MB'} ${config.limitMissingException?'':ru?'(музыка до 15 МБ)':'(music up to 15 MB)'}. Teams may keep their synthetic photographs, design files and documents in this clearly bounded included section.</p><h3>Next section</h3><p>Separate text is not part of included copy.</p><details><summary>What are the upload limits?</summary><p>Images and videos up to 25 MB; music and audio up to 15 MB. These are the independently documented category limits.</p></details></main>`));return;
  }
  if(u.pathname==='/help/graphics-library'){if(req.headers.cookie?.includes('qa-locale=ru')){res.writeHead(302,{location:'/ru/help/graphics-library'});res.end();return}res.end(wrap('<main><h1>QA Graphics Library help</h1><p>'+('Images and videos up to 25 MB; audio up to 15 MB. '.repeat(4))+'</p></main>'));return}
  res.statusCode=404;res.end(wrap('<main>Not found</main>'));
 });await new Promise(ok=>server.listen(0,'127.0.0.1',ok));scope.origin='http://127.0.0.1:'+server.address().port;
 await atomicJson(join(local,'auth-state.json'),{cookies:[{name:'qa-session',value:'fixture',domain:'127.0.0.1',path:'/',expires:-1,httpOnly:true,secure:false,sameSite:'Lax'}],origins:[]});
 const {publicKey,privateKey}=generateKeyPairSync('ed25519');const grant={...scope,version:1,id:'reviewed-retest',operations:['upload','generate','read'],expiresAt:new Date(Date.now()+(config.expiredGrant?-1:300000)).toISOString(),maxActions:30,maxBytes:8*1024*1024,cleanupPlan:'Discard only synthetic test objects and fixture files',spending:{maxTokens:6,maxOperations:2},tool:'qa-tone',artifactId:'wav'};
 await atomicJson(join(local,'sandbox/approval-public-key.json'),{pem:publicKey.export({format:'pem',type:'spki'})});await atomicJson(join(local,'sandbox/approvals/reviewed-retest.json'),{grant,signature:sign(null,Buffer.from(canonical(grant)),privateKey).toString('base64')});
 const controller=new BrowserController({local,origin:scope.origin});
 const plan=r=>{const s=buildSpec(r);if(config.mockWorkflows&&['document-import','text-transform','editor-overflow'].includes(s.driver)){delete s.blocker;s.mutation='signed-offline-fixture-only'}return s};
 const engine=()=>new RetestEngine({local,controller,plan,driverFactory:(...args)=>new MockWorkflowDrivers(...args,{scope,grantId:grant.id,source:SOURCE_SCRIPT,golden:GOLDEN_SCRIPT,required:['[pause 1.5s]','(steady delivery)'],entities:['QA Cycle']}),budget:async()=>{}});
 t.after(async()=>{await controller.close();server.closeAllConnections();await new Promise(ok=>server.close(ok));await rm(local,{recursive:true,force:true})});
 return {local,scope,controller,engine,records,counts};
}
