import { expect, type Locator, type Download, type Page } from '@playwright/test';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

export function syntheticFile(name:string,bytes:number,maximum=1024*1024) {
  if(!Number.isSafeInteger(bytes) || bytes<0 || bytes>maximum || path.basename(name)!==name) throw Error('Unsafe synthetic fixture');
  return {name,mimeType:'application/octet-stream',buffer:Buffer.alloc(bytes,65)};
}
export async function verifyDownload(download:Download,directory:string,expected:{extension:string;minBytes:number;maxBytes:number;magic?:Buffer}) {
  const name=path.basename(download.suggestedFilename());
  if(!/^\.[a-z0-9]+$/i.test(expected.extension) || path.extname(name).toLowerCase()!==expected.extension.toLowerCase()) throw Error('Unexpected download format');
  const target=path.join(directory,name);
  await download.saveAs(target);
  expect(await download.failure()).toBeNull();
  const info=await stat(target);expect(info.size).toBeGreaterThanOrEqual(expected.minBytes);expect(info.size).toBeLessThanOrEqual(expected.maxBytes);
  if(expected.magic) expect((await readFile(target)).subarray(0,expected.magic.length)).toEqual(expected.magic);
  return {path:target,bytes:info.size,format:expected.extension,qualityReview:'NOT TESTED: content, spelling and visual/audio quality require scenario-specific verification'};
}
export async function verifyInvalidField(field:Locator,value:string,message:Locator) {
  await field.fill(value);await field.blur();await expect(message).toBeVisible();
}
export async function assertNoHorizontalOverflow(page:Page) {
  await expect.poll(()=>page.evaluate(()=>Math.max(document.body.scrollWidth,document.documentElement.scrollWidth)-document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
}
