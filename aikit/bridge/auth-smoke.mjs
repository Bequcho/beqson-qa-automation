import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(fileURLToPath(new URL('../../',import.meta.url)));
const local=resolve(root,'.aikit-local');
const profile=resolve(local,'chrome-profile');
const result={
 date:new Date().toISOString(),
 task:'AUTH_SMOKE',
 authenticated:false,
 projectVisible:false,
 checks:[],
 note:'Read-only smoke checks. These do not complete any official Round 2 checklist item.'
};
await mkdir(local,{recursive:true,mode:0o700});
let context;
try{
 context=await chromium.launchPersistentContext(profile,{headless:true,viewport:{width:1365,height:768},acceptDownloads:false});
 const page=context.pages()[0]||await context.newPage();
 const response=await page.goto('https://aikit.ai/home/projects',{waitUntil:'domcontentloaded',timeout:35000});
 await page.waitForTimeout(1000);
 const url=page.url();
 const text=await page.locator('body').innerText();
 const loginForm=await page.locator('input[type="password"]').count()>0;
 const route=/\/home\/projects(?:\/|$|\?)/i.test(url);
 const projectUI=/Your websites|Projects|New project|Start a Project|Clearflow|My projects/i.test(text);
 result.checks.push({name:'projects HTTP',pass:response?.ok()??false,status:response?.status()??null});
 result.checks.push({name:'expected route',pass:route});
 result.checks.push({name:'no login form',pass:!loginForm});
 result.checks.push({name:'project UI evidence',pass:projectUI});
 result.projectVisible=Boolean(response?.ok()&&route&&projectUI&&!loginForm);
 result.authenticated=result.projectVisible;
 result.checks.push({name:'authenticated project list',status:result.authenticated?'PASS':'NOT_CONFIRMED'});
}catch(error){
 result.checks.push({name:'execution',status:'BLOCKED',error:String(error.message||error).split('\n')[0].slice(0,250)});
}finally{
 if(context)await context.close().catch(()=>{});
 await writeFile(resolve(local,'auth-smoke.json'),JSON.stringify(result,null,2),{mode:0o600});
}
console.log('AUTH_SMOKE: '+(result.authenticated?'CONFIRMED':'NOT CONFIRMED')+'. Detailed report saved locally.');
if(!result.authenticated)process.exitCode=1;