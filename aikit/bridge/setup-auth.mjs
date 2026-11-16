import {chromium} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createInterface} from 'node:readline/promises';
import {stdin,stdout} from 'node:process';

const root=resolve(fileURLToPath(new URL('../../',import.meta.url)));
const profile=resolve(root,'.aikit-local','chrome-profile');
await mkdir(profile,{recursive:true,mode:0o700});
const browser=await chromium.launchPersistentContext(profile,{
 headless:false,viewport:{width:1280,height:800},acceptDownloads:false
});
const page=browser.pages()[0]||await browser.newPage();
await page.goto('https://aikit.ai/home',{waitUntil:'domcontentloaded'});
console.log('Please sign in to aiKit MANUALLY in the opened dedicated QA browser.');
console.log('No password, token or cookie is sent to ChatGPT or GitHub.');
const rl=createInterface({input:stdin,output:stdout});
await rl.question('After the aiKit dashboard opens, press ENTER here: ');
rl.close();
await browser.close();
console.log('Saved locally under .aikit-local/chrome-profile. Next run: node aikit/bridge/auth-smoke.mjs');