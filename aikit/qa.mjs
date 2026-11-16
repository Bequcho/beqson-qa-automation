import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

const BASE = 'https://aikit.ai';
const ALL = ['en','es','pt-BR','fr','de','it','nl','pl','cs','hr','da','sv','el','ru','tr','he','ar','hi','bn','pa-Arab','id','vi','th','ht','zh-Hans','zh-Hant','ja','ko'];
const REMAINING = ['ht','zh-Hans','zh-Hant','ja','ko'];
const locales = process.argv.includes('--all') ? ALL : REMAINING;
const results = { timestamp: new Date().toISOString(), project: 'aiKit Round 2', mode: 'public-read-only', results: [] };
const menuPattern = /menu|meni|menü|menú|меню|מניו|قائمة|مینو|メニュー|메뉴|菜单|菜單|選單|选单|मेन्यू|মেনু|เมนู|meniu|menija/i;
const record = (checks, name, status, evidence) => checks.push({ name, status, evidence });
const short = error => String(error?.message || error).split('\n')[0].slice(0, 300);
async function selectedLocale(page) {
  return await page.locator('select').evaluateAll(nodes => {
    const language = nodes.find(node => [...node.options].some(option => option.value === 'zh-Hans'));
    return language?.value || null;
  });
}
function sameLocale(a,b) { return (a || '').toLowerCase() === b.toLowerCase(); }
async function overflow(page) {
  const measurements = [];
  for (const part of [0, 0.25, 0.5, 0.75, 1]) {
    const measurement = await page.evaluate(p => {
      window.scrollTo(0, Math.max(0, document.documentElement.scrollHeight - window.innerHeight) * p);
      return { width: document.documentElement.clientWidth, scrollWidth: Math.max(document.body.scrollWidth, document.documentElement.scrollWidth) };
    }, part);
    measurements.push(measurement.scrollWidth - measurement.width);
  }
  return Math.max(...measurements);
}
const browser = await chromium.launch({ headless: true });
for (const locale of locales) {
  const result = { locale, url: BASE + '/' + locale, checks: [], observations: [], errors: [] };
  const check = (name, passed, evidence) => record(result.checks, name, passed ? 'PASS' : 'FAIL', evidence);
  const note = (name, evidence) => record(result.checks, name, 'NOT_TESTED', evidence);
  let context;
  try {
    context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    page.on('pageerror', e => result.errors.push(short(e)));
    const response = await page.goto(result.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    check('desktop home response', Boolean(response?.ok()), 'HTTP ' + (response?.status() ?? 'none'));
    check('correct language selected', sameLocale(await selectedLocale(page), locale), await selectedLocale(page));
    if (locale === 'ht') {
      const body = await page.locator('body').innerText();
      for (const s of ['Reyève sou entènèt','Kòч']) if (body.includes(s)) result.observations.push({ type: 'KNOWN_LOCALIZATION', exactText: s });
    }
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
    check('language persists on reload', sameLocale(await selectedLocale(page), locale), page.url());
    const tools = page.locator('a[href="' + BASE + '/' + locale + '/tools"]').first();
    if (await tools.isVisible().catch(() => false)) {
      await tools.click({ timeout: 10000 });
      check('Tools navigation after actual click', new URL(page.url()).pathname.toLowerCase() === ('/' + locale + '/tools').toLowerCase(), page.url());
      await page.goBack({ waitUntil: 'domcontentloaded', timeout: 30000 });
      check('Back restores homepage and locale', new URL(page.url()).pathname.toLowerCase() === ('/' + locale).toLowerCase() && sameLocale(await selectedLocale(page), locale), page.url());
    } else {
      note('Tools and Back clicks', 'Localized visible Tools link was not identified');
    }
  } catch (e) { result.errors.push('desktop: ' + short(e)); record(result.checks, 'desktop execution', 'FAIL', short(e)); }
  finally { if (context) await context.close(); }
  let mobileContext;
  try {
    mobileContext = await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
    const page = await mobileContext.newPage();
    page.on('pageerror', e => result.errors.push(short(e)));
    const response = await page.goto(result.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    check('mobile home response', Boolean(response?.ok()), 'HTTP ' + (response?.status() ?? 'none'));
    const overflowHome = await overflow(page);
    check('mobile home horizontal overflow <= 1px', overflowHome <= 1, overflowHome + 'px');
    await page.evaluate(() => window.scrollTo(0,0));
    const menuButtons = page.locator('button[aria-label], button[title]');
    let candidate = null;
    for (let i = 0; i < await menuButtons.count(); i++) {
      const el = menuButtons.nth(i);
      const label = (await el.getAttribute('aria-label')) || (await el.getAttribute('title')) || '';
      if (menuPattern.test(label) && await el.isVisible().catch(() => false)) { candidate = el; break; }
    }
    if (candidate) {
      const before = await page.locator('a:visible').count();
      await candidate.click({ timeout: 10000 });
      const expanded = await candidate.getAttribute('aria-expanded');
      const after = await page.locator('a:visible').count();
      check('mobile menu opens after click', expanded === 'true' || after > before, 'expanded=' + expanded + ', links ' + before + ' to ' + after);
    } else note('mobile menu opens', 'No reliable visible localized menu control located');
    const toolsResponse = await page.goto(BASE + '/' + locale + '/tools', { waitUntil: 'domcontentloaded', timeout: 30000 });
    check('mobile Tools URL loads', Boolean(toolsResponse?.ok()) && new URL(page.url()).pathname.toLowerCase() === ('/' + locale + '/tools').toLowerCase(), page.url());
    const overflowTools = await overflow(page);
    check('mobile Tools horizontal overflow <= 1px', overflowTools <= 1, overflowTools + 'px');
  } catch (e) { result.errors.push('mobile: ' + short(e)); record(result.checks, 'mobile execution', 'FAIL', short(e)); }
  finally { if (mobileContext) await mobileContext.close(); }
  result.summary = {
    pass: result.checks.filter(x => x.status === 'PASS').length,
    fail: result.checks.filter(x => x.status === 'FAIL').length,
    notTested: result.checks.filter(x => x.status === 'NOT_TESTED').length
  };
  results.results.push(result);
  console.log(locale + ': ' + JSON.stringify(result.summary));
}
await browser.close();
await mkdir('aikit-qa-results', { recursive: true });
await writeFile('aikit-qa-results/report.json', JSON.stringify(results, null, 2), 'utf8');
const rows = ['# Public aiKit Round 2 checks', '', 'This automated suite does not cover authenticated workflows, AI generation, download quality, or subjective visual clipping.', '', '| Locale | Pass | Fail | Not tested |', '|---|---:|---:|---:|'];
for (const result of results.results) {
  rows.push('| ' + result.locale + ' | ' + result.summary.pass + ' | ' + result.summary.fail + ' | ' + result.summary.notTested + ' |');
}
for (const result of results.results) {
  rows.push('', '## ' + result.locale);
  for (const c of result.checks) rows.push('- ' + c.status + ' | ' + c.name + ' | ' + c.evidence);
  for (const o of result.observations) rows.push('- OBSERVATION: ' + JSON.stringify(o));
  for (const e of result.errors) rows.push('- ERROR: ' + e);
}
await writeFile('aikit-qa-results/report.md', rows.join('\n'), 'utf8');
console.log('AIKIT_RESULT: ' + results.results.length + ' locale test suites completed; report available as workflow artifact.');
process.exitCode = results.results.some(r => r.summary.fail > 0) ? 1 : 0;
