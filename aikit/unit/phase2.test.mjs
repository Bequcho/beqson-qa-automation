import {test} from 'node:test';
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {ApprovalLedger,validateGrant} from '../sandbox/grants.mjs';
import {ArtifactVault,inspectBytes,publicArtifact,MAX_FILE_BYTES,sha256} from '../sandbox/artifacts.mjs';
import {createFixtures,fixturePayload,wavFixture,pdfFixture,docxFixture} from '../sandbox/fixtures.mjs';
import {SandboxClient} from '../sandbox/client.mjs';
import {atomicJson,readJson} from '../lib/storage.mjs';
import {safeObservation} from '../browser/privacy.mjs';
import {validateAction} from '../browser/protocol.mjs';

import {approvalFixture} from '../test-support/approval.mjs';
test('signed grants reject tampering, wrong scope, expiration and revocation before reservation',async t=>{
 const f=await approvalFixture(t);const file=join(f.local,'sandbox/approvals/local-reviewed.json');
 const envelope=await readJson(file);envelope.grant.maxActions=100;await atomicJson(file,envelope);
 await assert.rejects(f.ledger.reserve(f.grant.id,{...f.scope,operation:'create'},randomUUID()),/UNSIGNED/);
 await f.save();await assert.rejects(f.ledger.reserve(f.grant.id,{...f.scope,account:'qa-other',operation:'create'},randomUUID()),/SCOPE/);
 await f.save({...f.grant,expiresAt:new Date(0).toISOString()});await assert.rejects(f.ledger.reserve(f.grant.id,{...f.scope,operation:'create'},randomUUID()),/EXPIRED/);
 await f.save();await atomicJson(join(f.local,'sandbox/revocations.json'),{ids:[f.grant.id]});await assert.rejects(f.ledger.reserve(f.grant.id,{...f.scope,operation:'create'},randomUUID()),/REVOKED/);
});
test('reservations survive restart, cannot replay and enforce operation and spending limits',async t=>{
 const f=await approvalFixture(t),id=randomUUID();await f.ledger.reserve(f.grant.id,{...f.scope,operation:'generate',tool:'qa-tone',artifactId:'wav',estimatedTokens:6},id);
 await assert.rejects(new ApprovalLedger(f.local).reserve(f.grant.id,{...f.scope,operation:'generate',tool:'qa-tone',artifactId:'wav',estimatedTokens:6},id),/NO_REPLAY/);
 await assert.rejects(f.ledger.reserve(f.grant.id,{...f.scope,operation:'generate',tool:'qa-tone',artifactId:'wav',estimatedTokens:5},randomUUID()),/SPENDING_LIMIT/);
 await assert.rejects(f.ledger.reserve(f.grant.id,{...f.scope,operation:'generate',tool:'other',artifactId:'wav',estimatedTokens:1},randomUUID()),/SCOPE/);
 await f.save({...f.grant,maxActions:1});await assert.rejects(f.ledger.reserve(f.grant.id,{...f.scope,operation:'read'},randomUUID()),/ACTION_LIMIT/);
});
test('production capabilities are hard disabled even with a positive budget and enabled flag',async t=>{
 const f=await approvalFixture(t);
 assert.throws(()=>new SandboxClient({local:f.local,scope:f.scope,grantId:f.grant.id}),/CAPABILITY_DISABLED/);
 for(const origin of ['https://aikit.ai','http://localhost:1234','http://127.0.0.1:1234/path','https://127.0.0.1:1234']){
  assert.throws(()=>new SandboxClient({local:f.local,scope:{...f.scope,origin},grantId:f.grant.id,enabled:true}),/LIVE_CAPABILITY_DISABLED/);
  assert.throws(()=>validateGrant({...f.grant,origin}),/LIVE_CAPABILITY_DISABLED/);
 }
});
test('artifact validation checks MIME, magic, sizes, hashes and bounded local-only metadata',async t=>{
 const f=await approvalFixture(t),vault=new ArtifactVault(f.local,f.scope.runId);
 const wav=wavFixture(),info=await vault.ingest([wav],{type:'wav',mime:'audio/wav',expectedHash:sha256(wav)});
 assert.equal(info.metadata.durationSeconds,0.1);assert.deepEqual(await vault.read(info.id),wav);
 assert.deepEqual(publicArtifact(info),{type:'wav',structurallyValid:true,dimensionsPresent:false,durationPresent:true,evidence:'LOCAL_ONLY'});
 assert.equal(JSON.stringify(publicArtifact({...info,path:'private',sha256:'secret'})).includes('secret'),false);
 await assert.rejects(inspectBytes(wav,'wav','image/png'),/TYPE_OR_SIZE/);
 await assert.rejects(inspectBytes(Buffer.from('not a PDF'),'pdf','application/pdf'),/INVALID_ARTIFACT/);
 await assert.rejects(vault.ingest([wav],{type:'wav',mime:'audio/wav',expectedHash:'0'.repeat(64)}),/HASH_MISMATCH/);
 await writeFile(join(vault.root,info.id+'.bin'),Buffer.from('corrupt'));await assert.rejects(vault.read(info.id),/HASH_MISMATCH/);
 await assert.rejects(vault.read('../secret'),/PATH_BLOCKED/);
 const pdf=await inspectBytes(pdfFixture(),'pdf','application/pdf');assert.equal(pdf.validation,'STRUCTURAL_ONLY');
 assert.equal((await inspectBytes(await docxFixture(),'docx','application/vnd.openxmlformats-officedocument.wordprocessingml.document')).type,'docx');
});
test('failed and oversized artifacts consume quota and are quarantined rather than replayed or deleted',async t=>{
 const f=await approvalFixture(t),vault=new ArtifactVault(f.local,f.scope.runId);
 for(let i=0;i<4;i++)await assert.rejects(vault.ingest([Buffer.alloc(MAX_FILE_BYTES),Buffer.from('x')],{type:'wav',mime:'audio/wav'}),/ARTIFACT_QUOTA/);
 await assert.rejects(vault.ingest([wavFixture()],{type:'wav',mime:'audio/wav'}),/ARTIFACT_QUOTA/);
 const index=await readJson(join(vault.root,'index.json'));assert.equal(index.usedBytes,32*1024*1024);assert.equal(Object.keys(index.artifacts).length,4);assert.ok(Object.values(index.artifacts).every(x=>x.status==='quarantined'));
});
test('fixtures are synthetic, hashed and quota-bound; arbitrary files and modified fixtures are rejected',async t=>{
 const f=await approvalFixture(t);await createFixtures(f.local);const p=await fixturePayload(f.local,'wav');assert.equal(p.name,'QA-fixture.wav');
 await assert.rejects(fixturePayload(f.local,'../auth-state.json'),/UNAPPROVED/);
 await assert.rejects(fixturePayload(f.local,'invalid'),/UNAPPROVED/);await assert.rejects(fixturePayload(f.local,'oversize'),/UNAPPROVED/);
 await assert.rejects(fixturePayload(f.local,'wav',10),/QUOTA/);
 await writeFile(join(f.local,'sandbox/fixtures/wav.bin'),Buffer.from('changed'));await assert.rejects(fixturePayload(f.local,'wav'),/HASH_MISMATCH/);
});
test('semantic observations never expose field values, names, validation text, paths or raw DOM',()=>{
 const s=safeObservation({snapshotId:'s_'+'a'.repeat(24),url:'https://aikit.ai/tools/audio-kit',semantics:{forms:2,fileInputs:1,alerts:2,secret:'private@example.invalid'},controls:[{elementId:'e_'+'b'.repeat(24),label:'private@example.invalid',field:{required:true,invalid:true,inputKind:'email',value:'private@example.invalid',name:'secret'},allowedOps:['inspect','javascript'],kind:'sensitive'}]});
 assert.equal(s.semantics.forms,2);assert.equal(s.controls[0].field.required,true);assert.equal(JSON.stringify(s).includes('private@example'),false);assert.equal(JSON.stringify(s).includes('secret'),false);
 assert.throws(()=>validateAction({op:'dismiss',target:{ref:'last',match:{label:'Dismiss backdrop'}},x:100}),/INVALID/);
 assert.throws(()=>validateAction({op:'upload',target:{ref:'last',match:{label:'Upload'}},path:'auth-state.json'}),/INVALID/);
});
test('sandbox downloads fail closed on disabled capability, remote URL and cancelled payload; filenames are ignored',async t=>{
 const f=await approvalFixture(t),vault=new ArtifactVault(f.local,f.scope.runId);let cancelled=0,reads=0;
 const fake={url:()=>f.scope.origin+f.scope.route+'/export/pdf',cancel:async()=>cancelled++,suggestedFilename:()=>{throw Error('Filename must never be used')},createReadStream:async()=>{reads++;return [pdfFixture()]}};
 await assert.rejects(vault.ingestDownload(fake,{origin:f.scope.origin,path:f.scope.route+'/export/pdf',type:'pdf',mime:'application/pdf'}),/CAPABILITY_DISABLED/);assert.equal(reads,0);
 await assert.rejects(vault.ingestDownload(fake,{enabled:true,origin:'https://aikit.ai',path:f.scope.route+'/export/pdf',type:'pdf',mime:'application/pdf'}),/LIVE_CAPABILITY_DISABLED/);
 const result=await vault.ingestDownload(fake,{enabled:true,origin:f.scope.origin,path:f.scope.route+'/export/pdf',type:'pdf',mime:'application/pdf'});assert.equal(result.type,'pdf');
 await assert.rejects(vault.ingestDownload({...fake,createReadStream:async()=>{throw Error('canceled')}},{enabled:true,origin:f.scope.origin,path:f.scope.route+'/export/pdf',type:'pdf',mime:'application/pdf'}),/canceled/);assert.equal(cancelled,3);
});
test('concurrent grant use cannot bypass the action cap; malformed artifact index fails closed',async t=>{
 const f=await approvalFixture(t);await f.save({...f.grant,maxActions:1});
 const results=await Promise.allSettled([f.ledger.reserve(f.grant.id,{...f.scope,operation:'read'},randomUUID()),f.ledger.reserve(f.grant.id,{...f.scope,operation:'read'},randomUUID())]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 const vault=new ArtifactVault(f.local,f.scope.runId);await atomicJson(join(vault.root,'index.json'),{usedBytes:-1,artifacts:{}});await assert.rejects(vault.ingest([wavFixture()],{type:'wav',mime:'audio/wav'}),/INDEX_INVALID/);
});
test('malformed approval usage cannot erase token reservations or grant more actions',async t=>{
 const f=await approvalFixture(t);await atomicJson(join(f.local,'sandbox/approval-usage.json'),{grants:{[f.grant.id]:{actions:{},spentTokens:null,generationOperations:0}}});
 await assert.rejects(f.ledger.reserve(f.grant.id,{...f.scope,operation:'generate',tool:'qa-tone',artifactId:'wav',estimatedTokens:1},randomUUID()),/INVALID_APPROVAL_LEDGER/);
});
