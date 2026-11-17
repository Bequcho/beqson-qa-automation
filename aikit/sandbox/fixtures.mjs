import {mkdir,writeFile,readFile,lstat} from 'node:fs/promises';
import {resolve} from 'node:path';
import bundle from '../../node_modules/playwright-core/lib/utilsBundle.js';
import {atomicJson,readJson} from '../lib/storage.mjs';
import {sha256,inspectBytes,MAX_FILE_BYTES} from './artifacts.mjs';

const TYPES={png:'image/png',jpeg:'image/jpeg',webp:'image/webp',wav:'audio/wav',pdf:'application/pdf',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'};
export function wavFixture(){const data=Buffer.alloc(1600),header=Buffer.alloc(44);header.write('RIFF');header.writeUInt32LE(36+data.length,4);header.write('WAVEfmt ',8);header.writeUInt32LE(16,16);header.writeUInt16LE(1,20);header.writeUInt16LE(1,22);header.writeUInt32LE(8000,24);header.writeUInt32LE(16000,28);header.writeUInt16LE(2,32);header.writeUInt16LE(16,34);header.write('data',36);header.writeUInt32LE(data.length,40);return Buffer.concat([header,data])}
export function pdfFixture(){const parts=['%PDF-1.4\n'],offsets=[0];for(const object of ['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 100 100] /Contents 4 0 R >>','<< /Length 0 >>\nstream\n\nendstream']){offsets.push(Buffer.byteLength(parts.join('')));parts.push(`${offsets.length-1} 0 obj\n${object}\nendobj\n`)}const start=Buffer.byteLength(parts.join(''));parts.push(`xref\n0 5\n0000000000 65535 f \n${offsets.slice(1).map(o=>String(o).padStart(10,'0')+' 00000 n \n').join('')}trailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`);return Buffer.from(parts.join(''))}
export async function docxFixture(){return new Promise((ok,fail)=>{const zip=new bundle.yazl.ZipFile(),chunks=[];zip.outputStream.on('data',b=>chunks.push(b));zip.outputStream.on('end',()=>ok(Buffer.concat(chunks)));zip.outputStream.on('error',fail);zip.addBuffer(Buffer.from('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'),'[Content_Types].xml');zip.addBuffer(Buffer.from('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'),'_rels/.rels');zip.addBuffer(Buffer.from('<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>QA synthetic fixture</w:t></w:r></w:p></w:body></w:document>'),'word/document.xml');zip.end()})}
export async function createFixtures(local,page){
  const root=resolve(local,'sandbox','fixtures');await mkdir(root,{recursive:true,mode:0o700});
  const index=await readJson(resolve(root,'index.json'),{fixtures:{},retention:'manual-review-no-automatic-deletion'});
  const files={wav:wavFixture(),pdf:pdfFixture(),docx:await docxFixture(),invalid:Buffer.from('QA deliberately invalid fixture'),oversize:Buffer.alloc(MAX_FILE_BYTES+1)};
  if(page)for(const type of ['png','jpeg','webp'])files[type]=Buffer.from(await page.evaluate(type=>{const canvas=document.createElement('canvas');canvas.width=16;canvas.height=16;const c=canvas.getContext('2d');c.fillStyle='#2468ab';c.fillRect(0,0,16,16);return canvas.toDataURL('image/'+type).split(',')[1]},type),'base64');
  for(const [id,bytes] of Object.entries(files)){
    const expectedValid=!!TYPES[id];if(expectedValid)await inspectBytes(bytes,id,TYPES[id]);
    const existing=index.fixtures[id],hash=sha256(bytes);
    if(existing){if(sha256(await readFile(resolve(root,id+'.bin')))!==existing.sha256)throw Error('FIXTURE_HASH_MISMATCH');continue}
    await writeFile(resolve(root,id+'.bin'),bytes,{flag:'wx',mode:0o600});index.fixtures[id]={type:id,mime:TYPES[id]||'application/octet-stream',bytes:bytes.length,sha256:hash,expectedValid};
  }
  await atomicJson(resolve(root,'index.json'),index);return index;
}
export async function fixturePayload(local,id,maxBytes=MAX_FILE_BYTES){
  if(!Object.hasOwn(TYPES,id))throw Error('UNAPPROVED_FIXTURE');
  const root=resolve(local,'sandbox','fixtures'),index=await readJson(resolve(root,'index.json')),file=resolve(root,id+'.bin');
  const item=index.fixtures[id];if(!item?.expectedValid||(await lstat(file)).isSymbolicLink())throw Error('UNAPPROVED_FIXTURE');
  const buffer=await readFile(file);if(buffer.length>maxBytes)throw Error('FIXTURE_QUOTA');if(sha256(buffer)!==item.sha256)throw Error('FIXTURE_HASH_MISMATCH');
  await inspectBytes(buffer,item.type,item.mime);return {name:'QA-fixture.'+(id==='jpeg'?'jpg':id),mimeType:item.mime,buffer};
}
