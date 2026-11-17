import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {readJson,atomicJson} from '../lib/storage.mjs';

export function allowedUrl(input,origin='https://aikit.ai') {
  let url;try{url=new URL(input);}catch{throw Error('URL_NOT_ALLOWED');}
  if(url.origin!==origin||url.username||url.password||url.hash||url.pathname.includes('%')||/[\\\u0000-\u0020]/.test(url.pathname))throw Error('URL_NOT_ALLOWED');
  if(!['https:','http:'].includes(url.protocol)||(!origin.startsWith('http://127.0.0.1:')&&url.protocol!=='https:'))throw Error('URL_NOT_ALLOWED');
  if(!/^\/(?:[a-z]{2}(?:-[a-z]+)?)?$/i.test(url.pathname)&&!/^\/(?:tools|home)(?:\/[a-z0-9-]+)*\/?$/i.test(url.pathname))throw Error('URL_NOT_ALLOWED');
  for(const [key,value] of url.searchParams)if(!((key==='tab'&&['space','overview','tools','projects'].includes(value))||(key==='item'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value))))throw Error('URL_QUERY_NOT_ALLOWED');
  if(/(?:^|\/)(?:api|logout|signout|delete|publish|checkout|billing|purchase|payment|generate|synthesize|send|invite)(?:\/|$)/i.test(url.pathname))throw Error('URL_ACTION_BLOCKED');
  return url.href;
}
export function requestAllowed(request,origin,readPaths=[]) {
  const url=new URL(request.url());
  if(!['GET','HEAD','OPTIONS'].includes(request.method()))return false;
  if(request.isNavigationRequest()) {try{allowedUrl(url.href,origin);return true;}catch{return false;}}
  if(/(?:^|\/)(?:generate|generation|synthesize|publish|delete|checkout|purchase|payment|send|logout|signout|invite)(?:\/|$)/i.test(url.pathname))return false;
  if(url.origin===origin) {
    if(url.pathname.startsWith('/api/')) {
      if(/generate|synthesi[sz]|publish|delete|checkout|purchase|payment|send|logout|signout|invite|billing|update|create|save|remove|record|clone|execute/i.test(url.pathname))return false;
      if(url.pathname!=='/api/me'&&!readPaths.includes(url.pathname))return false;
      for(const [key,value]of url.searchParams)if(!['q','search','page','limit','offset','sort','filter','category','language','locale','cursor','id','projectId','project_id'].includes(key)||value.length>256)return false;
    }
    return true;
  }
  return ['fonts.googleapis.com','fonts.gstatic.com'].includes(url.hostname)&&['stylesheet','font'].includes(request.resourceType());
}
export function descriptorFingerprint(descriptor) {
  return createHash('sha256').update(JSON.stringify([descriptor.tag,descriptor.role,descriptor.label,descriptor.href,descriptor.type,descriptor.form,descriptor.controls,descriptor.inputMode])).digest('hex');
}
export function classify(descriptor) {
  if(descriptor.verifiedBackdrop==='aikit-drawer')return 'backdrop';
  const label=descriptor.label||'';
  if(descriptor.sensitive||/password|token|api.?key|credit.?card|consent/i.test(label))return 'sensitive';
  if(/generate|create|save|publish|delete|remove|buy|purchase|pay|send|invite|subscribe|account|billing|logout|sign out|clone|record/i.test(label))return 'sensitive';
  if(descriptor.tag==='a'&&descriptor.href)return 'navigation';
  if(descriptor.role==='searchbox'||descriptor.type==='search'||/^search\b/i.test(label))return 'search';
  if((descriptor.controls||descriptor.expanded!==null||descriptor.role==='tab')&&!descriptor.form)return 'disclosure';
  if(descriptor.tag==='select'&&/filter|sort|category|view/i.test(label))return 'filter';
  if(['input','textarea','select'].includes(descriptor.tag))return 'editable';
  return 'other';
}
export function allowedOperations(descriptor) {
  const kind=classify(descriptor),ops=['inspect'];
  if(!descriptor.enabled||descriptor.ambiguous)return ops;
  if(['navigation','disclosure'].includes(kind))ops.push('click');
  if(kind==='backdrop')ops.push('dismiss');
  if(kind==='search')ops.push('fill','press');
  if(kind==='filter')ops.push('select','press');
  return ops;
}
export async function authorizeAction(descriptor,op,{local,authorizationId,url,origin}) {
  if(op==='inspect')return;
  if(op==='press'&&descriptor.key==='Escape')return;
  if(allowedOperations(descriptor).includes(op)) {
    if(op==='press'&&descriptor.key==='Enter')throw Error('FORM_SUBMISSION_BLOCKED');
    if(op==='click'&&classify(descriptor)==='navigation')allowedUrl(new URL(descriptor.href,url).href,origin);
    return;
  }
  if(!authorizationId)throw Error('LOCAL_SCOPED_AUTHORIZATION_REQUIRED');
  const file=resolve(local,'interactive','authorizations.json'),policy=await readJson(file,{grants:[]});
  const grant=policy.grants.find(g=>g.id===authorizationId);
  if(!grant||Date.parse(grant.expiresAt)<=Date.now()||!Number.isFinite(Date.parse(grant.expiresAt))||grant.origin!==origin||grant.path!==new URL(url).pathname||grant.fingerprint!==descriptorFingerprint(descriptor)||!grant.operations?.includes(op)||!Number.isSafeInteger(grant.remainingActions)||grant.remainingActions<1||!grant.syntheticObject?.id||!grant.syntheticObject?.name?.startsWith('QA ')||!grant.cleanupPlan)throw Error('LOCAL_AUTHORIZATION_SCOPE_MISMATCH');
  // This vertical slice permits explicitly scoped local field editing only. No network-write capability exists.
  if(grant.capability!=='local-form-edit'||!['fill','select'].includes(op)||classify(descriptor)==='sensitive')throw Error('CAPABILITY_DISABLED');
  grant.remainingActions--;await atomicJson(file,policy);
}
