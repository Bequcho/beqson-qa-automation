import { test as base, expect, type Page } from '@playwright/test';
import routeOverrides from '../routes.json';

export const test=base.extend<{ jsErrors:string[] }>({
  jsErrors:[async ({page},use,testInfo)=>{
    const errors:string[]=[];
    page.on('pageerror',error=>errors.push(error.message));
    // Public checks must never call account, generation or write endpoints.
    await page.route('**/*',async route=>{
      const request=route.request(),url=new URL(request.url());
      const navigation=request.isNavigationRequest();
      const allowedHost=url.hostname==='aikit.ai' || url.hostname.endsWith('.aikit.ai');
      if (navigation && (!allowedHost || !['GET','HEAD'].includes(request.method()))) return route.abort('blockedbyclient');
      const languageApproval=process.env.AIKIT_ALLOW_LANGUAGE_PREFERENCE==='1';
      // This permission is only used with fresh, signed-out browser contexts, never auth state.
      const preference=languageApproval && url.origin==='https://aikit.ai' && request.method()==='POST' && url.pathname==='/api/me/language';
      if (!['GET','HEAD','OPTIONS'].includes(request.method()) && !preference) return route.abort('blockedbyclient');
      if (request.resourceType()==='websocket') return route.abort('blockedbyclient');
      await route.continue();
    });
    await use(errors);
    if(errors.length) await testInfo.attach('javascript-errors-local',{body:JSON.stringify(errors),contentType:'application/json'});
  },{auto:true}],
});
export { expect };
export const locales=(process.env.AIKIT_LOCALES || 'en').split(',');
const routeLocale=(locale:string)=>(routeOverrides as Record<string,string>)[locale]??locale;
export const home=(locale:string)=>'https://aikit.ai/'+routeLocale(locale);
export const tools=(locale:string)=>routeLocale(locale)?`/${routeLocale(locale)}/tools`:'/tools';
export async function openHome(page:Page,locale:string) {
  let response;
  try { response=await page.goto(home(locale),{waitUntil:'load'}); }
  catch { test.skip(true,'BLOCKED:NETWORK_OR_NAVIGATION_UNAVAILABLE'); return; }
  test.skip(response?.status()===429 || response?.status()===403,'BLOCKED:SERVICE_ACCESS_LIMIT');
  expect(response?.status(),'Homepage must return a successful response').toBe(200);
  await expect(page.locator('main')).toBeVisible();
  await expect(page.locator('select:visible').first()).toBeVisible();
  // Observed application initialization marker. Avoid operating SSR-only controls before hydration.
  await expect(page.locator('html')).toHaveAttribute('data-pk',/^(light|dark)$/);
}
export async function languageSelect(page:Page) {
  // Keep a live locator across navigation; inspecting count once races the new document.
  return page.locator('select:visible').filter({has:page.locator('option[value="zh-Hans"]')}).first();
}
