import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {readJson,atomicJson,lock} from '../lib/storage.mjs';
import {ApprovalLedger,offlineOrigin,canonical} from './grants.mjs';
import {ArtifactVault,sha256} from './artifacts.mjs';
import {fixturePayload} from './fixtures.mjs';

// This is a loopback mock contract, NOT a production aiKit endpoint adapter.
// No environment variable, signed file or queue issue can enable live requests.
export class SandboxClient {
  constructor({local,scope,grantId,enabled=false}={}){
    if(enabled!==true)throw Error('CAPABILITY_DISABLED');
    offlineOrigin(scope.origin);this.scope=structuredClone(scope);this.local=local;this.grantId=grantId;
    this.ledger=new ApprovalLedger(local);this.vault=new ArtifactVault(local,scope.runId);this.directory=resolve(local,'sandbox');
  }
  async #request(path,{method='GET',body,headers={},allowMissing=false}={}){
    offlineOrigin(this.scope.origin);
    if(!path.startsWith('/qa/')||/[?#\\]|\.\./.test(path))throw Error('SANDBOX_ROUTE_BLOCKED');
    const response=await fetch(this.scope.origin+path,{method,redirect:'error',credentials:'omit',signal:AbortSignal.timeout(10000),headers:{'x-qa-owner':this.scope.account,'x-qa-run':this.scope.runId,...headers},body});
    if(!(response.ok||allowMissing&&response.status===404)||response.headers.get('x-beqson-sandbox')!==this.scope.runId){await response.body?.cancel();throw Error('MOCK_CONTRACT_MISMATCH')}
    return response;
  }
  async #json(path,options){
    const response=await this.#request(path,options);let size=0,parts=[];
    if(!response.headers.get('content-type')?.startsWith('application/json')){await response.body?.cancel();throw Error('MOCK_CONTRACT_MISMATCH')}
    for await(const chunk of response.body){size+=chunk.length;if(size>65536)throw Error('MOCK_RESPONSE_LIMIT');parts.push(chunk)}
    return JSON.parse(Buffer.concat(parts).toString());
  }
  #identity(record){
    const s=this.scope;
    if(record?.id!==s.objectId||record.owner!==s.account||record.runId!==s.runId||record.name!==s.objectName||!record.name.startsWith('QA ')||record.publish!==false||record.notifications!==false)throw Error('SYNTHETIC_OWNERSHIP_MISMATCH');
    return record;
  }
  async #handshake(){const identity=await this.#json('/qa/identity');if(identity.account!==this.scope.account||identity.runId!==this.scope.runId||identity.sandbox!==true)throw Error('SANDBOX_IDENTITY_MISMATCH')}
  async #owned(){const registry=await readJson(resolve(this.directory,'objects.json'),{objects:{}});const entry=registry.objects[this.scope.objectId];if(entry?.status!=='owned'||entry.runId!==this.scope.runId||entry.origin!==this.scope.origin||entry.account!==this.scope.account)throw Error('OBJECT_NOT_OWNED');return this.#identity(await this.#json(this.scope.route))}
  async #record(status){const path=resolve(this.directory,'objects.json'),r=await readJson(path,{objects:{}});r.objects[this.scope.objectId]={status,runId:this.scope.runId,origin:this.scope.origin,account:this.scope.account,name:this.scope.objectName};await atomicJson(path,r)}
  async perform(operation,params={},actionId=randomUUID()){
    if(!['create','edit','read','export','cleanup','upload','generate','recover'].includes(operation)||!/^[a-f0-9-]{36}$/.test(actionId))throw Error('INVALID_SANDBOX_OPERATION');
    const keys={create:[],edit:['text'],read:[],export:['type'],cleanup:[],upload:['fixtureId'],generate:['tool','artifactId','estimatedTokens'],recover:[]}[operation];
    if(!params||typeof params!=='object'||Array.isArray(params)||Object.keys(params).some(k=>!keys.includes(k)))throw Error('INVALID_SANDBOX_PARAMETERS');
    if(operation==='edit'&&(typeof params.text!=='string'||!/^QA [a-zA-Z0-9 .-]{1,200}$/.test(params.text)))throw Error('INVALID_SYNTHETIC_TEXT');
    if(operation==='export'&&!['png','jpeg','webp','wav','pdf','docx'].includes(params.type))throw Error('INVALID_ARTIFACT_TYPE');
    const fingerprint=sha256(Buffer.from(canonical({scope:this.scope,operation,params}))),file=resolve(this.directory,'operations',actionId+'.json');
    const release=await lock(resolve(this.directory,'client.lock'));
    try{
      const old=await readJson(file,null);if(old){if(old.fingerprint!==fingerprint)throw Error('ACTION_ID_SCOPE_MISMATCH');if(old.stage==='complete')return old.result;throw Error('INTERRUPTED_NO_REPLAY')}
      const grant=await this.ledger.reserve(this.grantId,{...this.scope,operation:operation==='recover'?'read':operation,...params},actionId);
      await atomicJson(file,{stage:'started',operation,fingerprint});
      await this.#handshake();
      let result;const route=this.scope.route,headers={'content-type':'application/json','x-qa-action':actionId};
      if(operation==='create'){
        const registry=await readJson(resolve(this.directory,'objects.json'),{objects:{}});
        if(registry.objects[this.scope.objectId])throw Error('SYNTHETIC_ID_ALREADY_USED');
        await this.#record('prepared');
        result=this.#identity(await this.#json('/qa/projects',{method:'POST',headers,body:JSON.stringify({id:this.scope.objectId,owner:this.scope.account,runId:this.scope.runId,name:this.scope.objectName,publish:false,notifications:false})}));await this.#record('owned');
      }else if(operation==='recover'){
        const registry=await readJson(resolve(this.directory,'objects.json'),{objects:{}}),entry=registry.objects[this.scope.objectId];
        if(entry?.status!=='prepared'||entry.runId!==this.scope.runId||entry.origin!==this.scope.origin||entry.account!==this.scope.account)throw Error('NO_PREPARED_SYNTHETIC_OBJECT');
        result=this.#identity(await this.#json(route));await this.#record('owned');
      }else{
        const current=await this.#owned();
        if(operation==='read')result=current;
        if(operation==='edit')result=this.#identity(await this.#json(route,{method:'PATCH',headers,body:JSON.stringify({text:params.text,publish:false,notifications:false})}));
        if(operation==='cleanup'){
          const deleted=await this.#json(route,{method:'DELETE',headers});
          if(deleted.id!==this.scope.objectId||deleted.owner!==this.scope.account||deleted.runId!==this.scope.runId||deleted.deleted!==true)throw Error('MOCK_CONTRACT_MISMATCH');
          const absent=await this.#request(route,{allowMissing:true});await absent.body?.cancel();if(absent.status!==404)throw Error('CLEANUP_NOT_VERIFIED');
          await this.#record('deleted');result={deleted:true};
        }
        if(operation==='upload'){
          const fixture=await fixturePayload(this.local,params.fixtureId,grant.maxBytes);
          result=this.#identity(await this.#json(route+'/upload',{method:'POST',headers:{'content-type':fixture.mimeType,'x-qa-action':actionId,'x-qa-sha256':sha256(fixture.buffer)},body:fixture.buffer}));
          if(result.fixtureHash!==sha256(fixture.buffer))throw Error('UPLOAD_HASH_MISMATCH');
        }
        if(operation==='export'){
          const response=await this.#request(route+'/export/'+params.type);
          result=await this.vault.ingest(response.body,{type:params.type,mime:response.headers.get('content-type'),maxBytes:grant.maxBytes});
        }
        if(operation==='generate'){
          const hold=await readJson(resolve(this.directory,'generation-hold.json'),{blocked:false});if(hold.blocked)throw Error('USAGE_UNCONFIRMED');
          await atomicJson(resolve(this.directory,'generation-hold.json'),{blocked:true,actionId});
          const before=await this.#json('/qa/usage');
          if(!Number.isSafeInteger(before.remainingTokens)||!Number.isSafeInteger(before.usedTokens)||before.usedTokens<0||before.remainingTokens<params.estimatedTokens)throw Error('USAGE_UNCONFIRMED');
          // A durable hold precedes dispatch, including an interrupted request.
          const generated=await this.#json(route+'/generate',{method:'POST',headers,body:JSON.stringify(params)}),after=await this.#json('/qa/usage');
          if(!Number.isSafeInteger(after.usedTokens)||!Number.isSafeInteger(after.remainingTokens)||after.remainingTokens<0||after.usedTokens-before.usedTokens!==params.estimatedTokens||before.remainingTokens-after.remainingTokens!==params.estimatedTokens||generated.tokensUsed!==params.estimatedTokens)throw Error('USAGE_UNCONFIRMED');
          await atomicJson(resolve(this.directory,'generation-hold.json'),{blocked:false});result={syntheticMockOnly:true,usageVerified:true};
        }
      }
      await atomicJson(file,{stage:'complete',operation,fingerprint,result});return result;
    }finally{await release()}
  }
}
