import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {generateKeyPairSync,sign,randomUUID} from 'node:crypto';
import {ApprovalLedger,canonical} from '../sandbox/grants.mjs';
import {MAX_FILE_BYTES} from '../sandbox/artifacts.mjs';
import {atomicJson} from '../lib/storage.mjs';
export async function approvalFixture(t,origin='http://127.0.0.1:12345'){
 const local=await mkdtemp(join(tmpdir(),'aikit-phase2-'));t.after(()=>rm(local,{recursive:true,force:true}));
 const {publicKey,privateKey}=generateKeyPairSync('ed25519');
 const grant={version:1,id:'local-reviewed',origin,account:'qa-fixture',route:'',objectId:'qa-'+randomUUID(),objectName:'QA isolated fixture',runId:randomUUID(),operations:['create','edit','read','export','cleanup','upload','generate'],expiresAt:new Date(Date.now()+60000).toISOString(),maxActions:30,maxBytes:MAX_FILE_BYTES,cleanupPlan:'Delete only the created owned synthetic ID',spending:{maxTokens:10,maxOperations:2},tool:'qa-tone',artifactId:'wav'};grant.route='/qa/projects/'+grant.objectId;
 await atomicJson(join(local,'sandbox/approval-public-key.json'),{pem:publicKey.export({format:'pem',type:'spki'})});
 const save=async(g=grant)=>atomicJson(join(local,'sandbox/approvals',g.id+'.json'),{grant:g,signature:sign(null,Buffer.from(canonical(g)),privateKey).toString('base64')});await save();
 return {local,grant,save,scope:{origin,account:grant.account,route:grant.route,objectId:grant.objectId,objectName:grant.objectName,runId:grant.runId},ledger:new ApprovalLedger(local)};
}
