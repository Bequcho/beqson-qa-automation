import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { BASE, LOCAL, PROGRAM } from '../lib/config.mjs';
import { atomicJson, lock } from '../lib/storage.mjs';

await mkdir(LOCAL,{recursive:true,mode:0o700});
const release=await lock(resolve(LOCAL,'profile.lock'));
let context;
try {
  context=await chromium.launchPersistentContext(resolve(LOCAL,'chrome-profile'),{headless:false,viewport:{width:1365,height:900},acceptDownloads:false});
  const page=context.pages()[0]||await context.newPage();
  await page.goto(BASE+'/login?next='+encodeURIComponent('/home/projects'),{waitUntil:'domcontentloaded'});
  console.log('Sign in manually in the dedicated QA browser. Credentials stay on this computer. Waiting up to 10 minutes.');
  await page.waitForURL(url=>url.origin===BASE && /^\/home(?:\/|$)/.test(url.pathname),{timeout:600_000});
  await context.storageState({path:resolve(LOCAL,'auth-state.json'),indexedDB:true});
  await page.goto(BASE+PROGRAM,{waitUntil:'domcontentloaded',timeout:45_000});
  await page.locator('main').waitFor({state:'visible',timeout:30_000}).catch(()=>{});
  // Local evidence only. A snapshot never automatically replaces checklist progress.
  await writeFile(resolve(LOCAL,'live-program.txt'),await page.locator('body').innerText(),{mode:0o600});
  await atomicJson(resolve(LOCAL,'login.json'),{at:new Date().toISOString(),sessionSaved:true,programRoute:new URL(page.url()).pathname===PROGRAM.split('?')[0],reconciliation:'PENDING_REVIEW'});
  console.log('Local session saved. Team Program snapshot is local; reconciliation still requires review.');
} finally {try{await context?.close();}finally{await release();}}
