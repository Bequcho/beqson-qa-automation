import { chromium } from '@playwright/test';
import { resolve } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { BASE, PROGRAM, LOCAL, CATEGORIES } from './config.mjs';
import { getChecklist, slug } from './checklist.mjs';
import { atomicJson, lock } from './storage.mjs';

export async function syncProgram(local=LOCAL) {
  const release=await lock(resolve(local,'program-sync.lock'));
  const at=new Date().toISOString(),dir=resolve(local,'program-history',at.replace(/[:.]/g,'-'));
  await mkdir(dir,{recursive:true,mode:0o700});
  let context,browser;
  try {
    browser=await chromium.launch();
    context=await browser.newContext({storageState:resolve(local,'auth-state.json'),acceptDownloads:false,serviceWorkers:'block'});
    await context.route('**/*',async route=>{
      const request=route.request(),url=new URL(request.url());
      if(!['GET','HEAD','OPTIONS'].includes(request.method()) || (request.isNavigationRequest() && url.origin!==BASE)) return route.abort('blockedbyclient');
      return route.continue();
    });
    await context.tracing.start({screenshots:true,snapshots:true});
    const page=await context.newPage();
    await page.goto(BASE+PROGRAM,{waitUntil:'domcontentloaded'});
    await page.locator('a.tp-card-a').first().waitFor({timeout:30_000});
    const cards=await page.locator('a.tp-card-a').evaluateAll(nodes=>nodes.map(node=>({
      name:node.querySelector('.tp-card-t')?.textContent?.trim().replace(/ \(lighter pass\)$/,''),
      href:node.getAttribute('href'),meter:node.querySelector('.tp-meter')?.getAttribute('aria-label')
    })));
    const checklist=await getChecklist(local);
    if(!checklist) throw Error('CHECKLIST_IMPORT_REQUIRED');
    const observed=[];
    for(const [category,count] of Object.entries(CATEGORIES)) {
      const card=cards.find(c=>c.name===category);
      if(!card?.href || !/^\?item=[a-f0-9-]{36}$/.test(card.href)) throw Error('LIVE_CARD_UNAVAILABLE');
      const url=new URL(BASE+PROGRAM);url.searchParams.set('item',card.href.slice(6));
      await page.goto(url.href,{waitUntil:'domcontentloaded'});
      const dialog=page.getByRole('dialog');await dialog.waitFor({state:'visible',timeout:30_000});
      const boxes=dialog.locator('label').filter({has:page.locator('input[type="checkbox"]')});
      await boxes.first().waitFor({state:'visible',timeout:15_000});
      const items=await boxes.evaluateAll(labels=>labels.map(label=>({objective:label.textContent?.trim(),checked:label.querySelector('input')?.checked})));
      if(items.length!==count) throw Error('LIVE_CHECKLIST_COUNT_MISMATCH');
      const text=await dialog.innerText();
      const reports=await dialog.locator('a[href]').evaluateAll(links=>links.filter(link=>/report|issue|bug/i.test(link.getAttribute('href')||'')).map(link=>({title:link.textContent?.trim(),href:link.getAttribute('href')})));
      await writeFile(resolve(dir,slug(category)+'.txt'),text,{mode:0o600});
      await page.screenshot({path:resolve(dir,slug(category)+'.png')});
      observed.push({category,source:url.href,at,items,reports,meter:card.meter,reportEvidence:resolve(dir,slug(category)+'.txt'),reportsText:text.includes('Reports on this card')?text.slice(text.indexOf('Reports on this card')):''});
    }
    // Commit only after all nine cards and all 99 positions have been read successfully.
    for(const card of observed) for(const [index,item] of card.items.entries()) {
      const scenario=checklist.scenarios.find(s=>s.category===card.category && s.item===index+1);
      const same=scenario.objective.replace(/…$/,'').trim();
      const alignment=item.objective===scenario.objective || (scenario.sourceTruncated && item.objective.startsWith(same));
      scenario.liveObservation={checked:item.checked,source:card.source,at,objective:item.objective,alignedWithHistorical:alignment};
      if(alignment) {
        scenario.historicalObjective??=scenario.objective;scenario.objective=item.objective;scenario.expectedBehavior=item.objective;
        scenario.steps[1]=`Execute each operation in the official criterion: ${item.objective}`;
        scenario.sourceTruncated=item.objective.includes('…');scenario.reconciled=true;
      }
      scenario.relatedKnownBugReports=card.reports;
      scenario.knownReportEvidence={path:card.reportEvidence,reportReferences:[...card.reportsText.matchAll(/#(\d+)/g)].map(match=>Number(match[1])),reviewRequired:true};
      scenario.history.push({kind:'live-program-observation',at,checked:item.checked,source:card.source,alignment,evidenceVerified:false});
    }
    checklist.liveObservedAt=at;checklist.liveChecked=observed.flatMap(c=>c.items).filter(i=>i.checked).length;
    await atomicJson(resolve(dir,'snapshot.json'),observed);
    await atomicJson(resolve(local,'checklist.json'),checklist);
    const result={at,cards:observed.length,items:observed.flatMap(c=>c.items).length,checked:checklist.liveChecked,reconciled:checklist.scenarios.filter(s=>s.reconciled).length,truncated:checklist.scenarios.filter(s=>s.sourceTruncated).length,officialStatusesChanged:0};
    await atomicJson(resolve(local,'reconciliation.json'),result);return result;
  } finally {try{await context?.tracing.stop({path:resolve(dir,'private-program-trace.zip')}).catch(()=>{});await context?.close();await browser?.close();}finally{await release();}}
}
