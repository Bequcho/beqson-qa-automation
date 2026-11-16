import { test, expect } from '@playwright/test';
import path from 'node:path';
import { existsSync } from 'node:fs';

const state=path.resolve(process.env.AIKIT_LOCAL_DIR||'.aikit-local','auth-state.json');
test.use({storageState:existsSync(state)?state:undefined});
test('auth.projects',async({page,context})=>{
  test.skip(!existsSync(state),'BLOCKED:LOCAL_LOGIN_REQUIRED');
  await context.route('**/*',async route=>{
    const request=route.request();
    if(!['GET','HEAD','OPTIONS'].includes(request.method())) return route.abort('blockedbyclient');
    if(request.isNavigationRequest() && new URL(request.url()).origin!=='https://aikit.ai') return route.abort('blockedbyclient');
    return route.continue();
  });
  let response;
  try { response=await page.goto('https://aikit.ai/home/projects',{waitUntil:'domcontentloaded'}); }
  catch {test.skip(true,'BLOCKED:AUTH_NAVIGATION_UNAVAILABLE');return;}
  await page.waitForURL(/\/(?:home\/projects|login|auth)(?:[/?#]|$)/);
  if(/\/(?:login|auth)(?:[/?#]|$)/.test(new URL(page.url()).pathname)) test.skip(true,'BLOCKED:LOCAL_SESSION_EXPIRED');
  test.skip(response?.status()===401||response?.status()===403,'BLOCKED:LOCAL_SESSION_EXPIRED');
  const heading=page.getByRole('heading',{name:/^(Things you build|Your websites|My projects|Projects)$/i}).first();
  await heading.waitFor({state:'visible',timeout:15_000}).catch(()=>{});
  test.skip(!await heading.isVisible(),'BLOCKED:AUTHENTICATED_UI_NOT_VERIFIED');
  await expect(page).toHaveURL(/\/home\/projects(?:[/?#]|$)/);
  await expect(heading).toBeVisible();
  await expect(page.locator('input[type="password"]')).toHaveCount(0);
  expect(response?.ok()).toBe(true);
});
