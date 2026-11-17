import {verify,createPublicKey} from 'node:crypto';
import {resolve} from 'node:path';
import {readJson,atomicJson,lock} from '../lib/storage.mjs';

export const OPERATIONS=['create','edit','read','export','cleanup','upload','generate'];
export const canonical=value=>JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
export const offlineOrigin=value=>{let u;try{u=new URL(value)}catch{throw Error('LIVE_CAPABILITY_DISABLED')}if(u.origin!==value||u.protocol!=='http:'||u.hostname!=='127.0.0.1'||!u.port)throw Error('LIVE_CAPABILITY_DISABLED');return u.origin};
export function validateGrant(grant) {
  const keys=['version','id','origin','account','route','objectId','objectName','runId','operations','expiresAt','maxActions','maxBytes','cleanupPlan','spending','tool','artifactId'];
  if(!grant||Object.keys(grant).some(k=>!keys.includes(k))||grant.version!==1||!/^[a-z0-9-]{1,64}$/.test(grant.id||''))throw Error('INVALID_LOCAL_GRANT');
  offlineOrigin(grant.origin);
  if(!/^qa-[a-z0-9-]{1,50}$/.test(grant.account||'')||!/^qa-[a-f0-9-]{36}$/.test(grant.objectId||'')||!/^QA [a-zA-Z0-9 -]{1,60}$/.test(grant.objectName||'')||!/^[a-f0-9-]{36}$/.test(grant.runId||''))throw Error('INVALID_SYNTHETIC_SCOPE');
  if(grant.route!=='/qa/projects/'+grant.objectId||!Array.isArray(grant.operations)||!grant.operations.length||new Set(grant.operations).size!==grant.operations.length||grant.operations.some(x=>!OPERATIONS.includes(x)))throw Error('INVALID_LOCAL_GRANT');
  if(!Number.isFinite(Date.parse(grant.expiresAt))||!Number.isSafeInteger(grant.maxActions)||grant.maxActions<1||grant.maxActions>100||!Number.isSafeInteger(grant.maxBytes)||grant.maxBytes<1||grant.maxBytes>8*1024*1024||typeof grant.cleanupPlan!=='string'||grant.cleanupPlan.length<5||grant.cleanupPlan.length>500)throw Error('INVALID_LOCAL_GRANT');
  if(!grant.spending||Object.keys(grant.spending).sort().join(',')!=='maxOperations,maxTokens'||!Number.isSafeInteger(grant.spending.maxTokens)||grant.spending.maxTokens<0||grant.spending.maxTokens>10000||!Number.isSafeInteger(grant.spending.maxOperations)||grant.spending.maxOperations<0||grant.spending.maxOperations>10)throw Error('INVALID_SPENDING_LIMIT');
  if(grant.operations.includes('generate')&&(grant.tool!=='qa-tone'||!['wav','png'].includes(grant.artifactId)))throw Error('INVALID_GENERATION_SCOPE');
  return grant;
}

// Verifies only. Signing keys never enter the worker, queue or repository.
export class ApprovalLedger {
  constructor(local){this.directory=resolve(local,'sandbox');}
  async reserve(id,scope,actionId) {
    if(!/^[a-z0-9-]{1,64}$/.test(id||'')||!/^[a-f0-9-]{36}$/.test(actionId||''))throw Error('INVALID_LOCAL_GRANT');
    const release=await lock(resolve(this.directory,'approval.lock'));
    try {
      const publicKey=await readJson(resolve(this.directory,'approval-public-key.json'));
      const envelope=await readJson(resolve(this.directory,'approvals',id+'.json'));
      if(Object.keys(envelope).sort().join(',')!=='grant,signature')throw Error('INVALID_LOCAL_GRANT');
      const grant=validateGrant(envelope.grant);
      if(createPublicKey(publicKey.pem).asymmetricKeyType!=='ed25519'||typeof envelope.signature!=='string'||!verify(null,Buffer.from(canonical(grant)),publicKey.pem,Buffer.from(envelope.signature,'base64')))throw Error('UNSIGNED_LOCAL_GRANT');
      const revoked=await readJson(resolve(this.directory,'revocations.json'),{ids:[]});
      if(grant.id!==id||Date.parse(grant.expiresAt)<=Date.now()||revoked.ids.includes(id))throw Error('EXPIRED_OR_REVOKED_GRANT');
      if(['origin','account','route','objectId','objectName','runId'].some(k=>grant[k]!==scope[k])||!grant.operations.includes(scope.operation))throw Error('LOCAL_GRANT_SCOPE_MISMATCH');
      if(scope.operation==='generate'&&(grant.tool!==scope.tool||grant.artifactId!==scope.artifactId))throw Error('LOCAL_GRANT_SCOPE_MISMATCH');
      const file=resolve(this.directory,'approval-usage.json'),usage=await readJson(file,{grants:{}});
      if(!usage.grants||typeof usage.grants!=='object'||Array.isArray(usage.grants))throw Error('INVALID_APPROVAL_LEDGER');
      const entry=usage.grants[id]||{actions:{},spentTokens:0,generationOperations:0};
      if(!entry.actions||typeof entry.actions!=='object'||Array.isArray(entry.actions)||!Number.isSafeInteger(entry.spentTokens)||entry.spentTokens<0||!Number.isSafeInteger(entry.generationOperations)||entry.generationOperations<0)throw Error('INVALID_APPROVAL_LEDGER');
      // A reservation is irreversible, including on crash; callers may not replay it.
      if(entry.actions[actionId])throw Error('INTERRUPTED_NO_REPLAY');
      if(Object.keys(entry.actions).length>=grant.maxActions)throw Error('LOCAL_ACTION_LIMIT');
      const estimate=scope.estimatedTokens||0;
      if(scope.operation==='generate'&&(!Number.isSafeInteger(estimate)||estimate<1||entry.spentTokens+estimate>grant.spending.maxTokens||entry.generationOperations>=grant.spending.maxOperations))throw Error('SPENDING_LIMIT');
      entry.actions[actionId]={operation:scope.operation,at:new Date().toISOString()};
      if(scope.operation==='generate'){entry.spentTokens+=estimate;entry.generationOperations++;}
      usage.grants[id]=entry;await atomicJson(file,usage);return grant;
    }finally{await release()}
  }
}
