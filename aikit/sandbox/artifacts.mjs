import {mkdir,open,readFile,lstat,realpath} from 'node:fs/promises';
import {resolve,relative,isAbsolute} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import bundle from '../../node_modules/playwright-core/lib/utilsBundle.js';
import {readJson,atomicJson,lock} from '../lib/storage.mjs';
import {offlineOrigin} from './grants.mjs';

export const MAX_FILE_BYTES=8*1024*1024,MAX_RUN_BYTES=32*1024*1024;
const MIME={png:'image/png',jpeg:'image/jpeg',webp:'image/webp',wav:'audio/wav',pdf:'application/pdf',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'};
export const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
const within=(root,path)=>{const rel=relative(root,path);return !rel.startsWith('..')&&!isAbsolute(rel)};
export async function inspectBytes(bytes,type,mime) {
  if(!Buffer.isBuffer(bytes)||!bytes.length||bytes.length>MAX_FILE_BYTES||!MIME[type]||mime?.split(';')[0].trim().toLowerCase()!==MIME[type])throw Error('ARTIFACT_TYPE_OR_SIZE');
  let metadata={},valid=false;
  if(type==='png'){
    valid=bytes.length>=45&&bytes.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex'))&&bytes.toString('ascii',12,16)==='IHDR'&&bytes.subarray(-8,-4).toString()==='IEND';
    if(valid)metadata={width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20)};
  }
  if(type==='jpeg'){
    valid=bytes[0]===255&&bytes[1]===216&&bytes.at(-2)===255&&bytes.at(-1)===217;
    for(let p=2;valid&&p+9<bytes.length;){if(bytes[p++]!==255){valid=false;break}let marker=bytes[p++];if(marker===218)break;if(marker===216||marker===217)continue;const n=bytes.readUInt16BE(p);if(n<2||p+n>bytes.length){valid=false;break}if([192,193,194].includes(marker)){metadata={width:bytes.readUInt16BE(p+5),height:bytes.readUInt16BE(p+3)};break}p+=n}
    valid=valid&&!!metadata.width;
  }
  if(type==='webp'){
    valid=bytes.length>=30&&bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP'&&bytes.readUInt32LE(4)+8===bytes.length;
    if(valid&&bytes.toString('ascii',12,16)==='VP8X')metadata={width:1+bytes.readUIntLE(24,3),height:1+bytes.readUIntLE(27,3)};
    else if(valid&&bytes.toString('ascii',12,16)==='VP8 '&&bytes.subarray(23,26).equals(Buffer.from('9d012a','hex')))metadata={width:bytes.readUInt16LE(26)&16383,height:bytes.readUInt16LE(28)&16383};
    else if(valid&&bytes.toString('ascii',12,16)==='VP8L'&&bytes[20]===47){const bits=bytes.readUInt32LE(21);metadata={width:(bits&16383)+1,height:((bits>>>14)&16383)+1}}
    valid=valid&&!!metadata.width;
  }
  if(type==='wav'){
    valid=bytes.length>=44&&bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WAVE'&&bytes.readUInt32LE(4)+8===bytes.length;
    let format,dataSize;
    for(let p=12;valid&&p+8<=bytes.length;){const n=bytes.readUInt32LE(p+4);if(p+8+n>bytes.length){valid=false;break}const tag=bytes.toString('ascii',p,p+4);if(tag==='fmt '&&n>=16)format={encoding:bytes.readUInt16LE(p+8),channels:bytes.readUInt16LE(p+10),sampleRate:bytes.readUInt32LE(p+12),byteRate:bytes.readUInt32LE(p+16)};if(tag==='data')dataSize=n;p+=8+n+(n%2)}
    valid=valid&&format?.encoding===1&&format.sampleRate>0&&format.byteRate>0&&dataSize>0;
    if(valid)metadata={durationSeconds:dataSize/format.byteRate,sampleRate:format.sampleRate,channels:format.channels};
  }
  if(type==='pdf')valid=bytes.subarray(0,5).toString()==='%PDF-'&&/%%EOF\s*$/.test(bytes.subarray(-32).toString());
  if(type==='docx')valid=await inspectDocx(bytes);
  if(!valid||metadata.width!==undefined&&(!metadata.width||!metadata.height||metadata.width>10000||metadata.height>10000))throw Error('INVALID_ARTIFACT');
  return {type,mime:MIME[type],bytes:bytes.length,sha256:sha256(bytes),metadata,validation:'STRUCTURAL_ONLY'};
}
async function inspectDocx(bytes){return new Promise((ok,fail)=>bundle.yauzl.fromBuffer(bytes,{lazyEntries:true,validateEntrySizes:true},(err,zip)=>{
  if(err)return ok(false);let count=0,total=0;const names=new Set();let invalid=false;
  zip.on('error',()=>{invalid=true;ok(false)});zip.on('end',()=>ok(!invalid&&['[Content_Types].xml','_rels/.rels','word/document.xml'].every(x=>names.has(x))));
  zip.on('entry',entry=>{
    count++;total+=entry.uncompressedSize;
    if(count>30||total>2*1024*1024||entry.uncompressedSize>512*1024||entry.generalPurposeBitFlag&1||/(?:^|\/)\.\.|\\|^\/|vba|\.exe$/i.test(entry.fileName)||names.has(entry.fileName)){invalid=true;zip.close();ok(false);return}
    names.add(entry.fileName);zip.openReadStream(entry,(err,stream)=>{if(err){zip.close();ok(false);return}let body='';stream.on('data',chunk=>{body+=chunk.toString();if(body.length>512*1024){invalid=true;stream.destroy();zip.close();ok(false)}});stream.on('error',()=>{zip.close();ok(false)});stream.on('end',()=>{if(/TargetMode\s*=\s*["']External|<!DOCTYPE|<!ENTITY/i.test(body))invalid=true;zip.readEntry()})});
  });zip.readEntry();
}));}

// Generated IDs only; suggested download filenames, arbitrary paths and URLs are
// never accepted. All bytes and detailed metadata remain in protected local data.
export class ArtifactVault {
  constructor(local,runId){if(!/^[a-f0-9-]{36}$/.test(runId))throw Error('INVALID_ARTIFACT_RUN');this.root=resolve(local,'sandbox','artifacts',runId);}
  async ingest(source,{type,mime,expectedHash,maxBytes=MAX_FILE_BYTES}={}){
    if(!Number.isSafeInteger(maxBytes)||maxBytes<1||maxBytes>MAX_FILE_BYTES)throw Error('ARTIFACT_QUOTA');
    await mkdir(this.root,{recursive:true,mode:0o700});
    if((await lstat(this.root)).isSymbolicLink())throw Error('ARTIFACT_PATH_BLOCKED');
    const release=await lock(resolve(this.root,'vault.lock'));
    const id=randomUUID(),path=resolve(this.root,id+'.bin');let handle;
    try{
      const index=await readJson(resolve(this.root,'index.json'),{usedBytes:0,artifacts:{}});let size=0;
      if(!Number.isSafeInteger(index.usedBytes)||index.usedBytes<0||index.usedBytes>MAX_RUN_BYTES||!index.artifacts||typeof index.artifacts!=='object'||Array.isArray(index.artifacts))throw Error('ARTIFACT_INDEX_INVALID');
      if(index.usedBytes+maxBytes>MAX_RUN_BYTES||Object.keys(index.artifacts).length>=32)throw Error('ARTIFACT_QUOTA');
      index.usedBytes+=maxBytes;index.artifacts[id]={path,status:'quarantined',reservedBytes:maxBytes};
      await atomicJson(resolve(this.root,'index.json'),index);
      handle=await open(path,'wx',0o600);
      for await(const chunk of source){const b=Buffer.from(chunk);if(size+b.length>maxBytes)throw Error('ARTIFACT_QUOTA');await handle.writeFile(b);size+=b.length}
      await handle.sync();await handle.close();handle=null;
      // Reserve disk usage even for rejected artifacts. Never silently delete evidence.
      index.usedBytes+=size-maxBytes;index.artifacts[id]={path,status:'quarantined',bytes:size};await atomicJson(resolve(this.root,'index.json'),index);
      const info=await inspectBytes(await readFile(path),type,mime);
      if(expectedHash&&info.sha256!==expectedHash)throw Error('ARTIFACT_HASH_MISMATCH');
      index.artifacts[id]={path,status:'validated',...info};await atomicJson(resolve(this.root,'index.json'),index);return {id,...info};
    }finally{if(handle)await handle.close();await release()}
  }
  async read(id){
    if(!/^[a-f0-9-]{36}$/.test(id))throw Error('ARTIFACT_PATH_BLOCKED');
    const index=await readJson(resolve(this.root,'index.json'));const item=index.artifacts[id];
    if(item?.status!=='validated')throw Error('ARTIFACT_NOT_VALIDATED');
    const path=resolve(this.root,id+'.bin');if(!within(await realpath(this.root),await realpath(path))||(await lstat(path)).isSymbolicLink())throw Error('ARTIFACT_PATH_BLOCKED');
    const bytes=await readFile(path);if(sha256(bytes)!==item.sha256)throw Error('ARTIFACT_HASH_MISMATCH');return bytes;
  }
  async ingestDownload(download,{enabled=false,origin,path,...options}={}){
    try{
      if(enabled!==true)throw Error('CAPABILITY_DISABLED');offlineOrigin(origin);
      if(!/^\/qa\/projects\/qa-[a-f0-9-]{36}\/export\/(?:png|jpeg|webp|wav|pdf|docx)$/.test(path||'')||download.url()!==origin+path)throw Error('DOWNLOAD_SCOPE_MISMATCH');
      const stream=await download.createReadStream();if(!stream)throw Error('DOWNLOAD_UNAVAILABLE');
      return await this.ingest(stream,options);
    }catch(error){await download.cancel().catch(()=>{});throw error}
  }
}
export const publicArtifact=info=>({type:Object.hasOwn(MIME,info?.type)?info.type:'unknown',structurallyValid:info?.validation==='STRUCTURAL_ONLY',dimensionsPresent:!!info?.metadata?.width,durationPresent:typeof info?.metadata?.durationSeconds==='number',evidence:'LOCAL_ONLY'});
