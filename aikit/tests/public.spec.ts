import { test, expect, locales, home, tools, openHome, languageSelect } from './fixtures';

const scenario=process.env.AIKIT_SCENARIO;
for(const locale of locales) {
  test.describe(locale,()=>{
    if(!scenario || scenario==='public.home') test(`public.home [${locale}]`,async({page,jsErrors})=>{
      await test.step('Navigate to the public homepage',()=>openHome(page,locale));
      await expect(await languageSelect(page)).toHaveValue(locale);
      await expect(page.locator('main')).toContainText(/\S/);
      await expect(page).toHaveURL(home(locale));
      expect(jsErrors,'No uncaught JavaScript errors during this scenario').toEqual([]);
    });
    if(!scenario || scenario==='public.navigation') test(`public.navigation [${locale}]`,async({page,jsErrors})=>{
      await openHome(page,locale);
      const link=page.locator(`a[href="${tools(locale)}"],a[href="https://aikit.ai${tools(locale)}"]`).filter({visible:true}).first();
      test.skip(!await link.count(),'NOT TESTED:RELIABLE_TOOLS_LINK_UNAVAILABLE');
      await test.step('Click the visible Tools link',async()=>{await link.click();await expect(page).toHaveURL(`https://aikit.ai${tools(locale)}`);});
      await expect(page.locator('main')).toBeVisible();
      await test.step('Use browser Back and verify the original locale',async()=>{await page.goBack({waitUntil:'domcontentloaded'});await expect(page).toHaveURL(home(locale));await expect(await languageSelect(page)).toHaveValue(locale);});
      expect(jsErrors).toEqual([]);
    });
    if(process.env.AIKIT_PUBLIC_SAFE_ONLY!=='1' && (!scenario || scenario==='public.locale')) test(`public.locale [${locale}]`,async({page,jsErrors})=>{
      test.skip(process.env.AIKIT_ALLOW_LANGUAGE_PREFERENCE!=='1','BLOCKED:PERSISTENT_LANGUAGE_CHANGE_REQUIRES_AUTHORIZATION');
      await openHome(page,locale);
      const target=locale==='en'?'ja':'en';
      await test.step(`Select ${target} and verify the selected language after navigation`,async()=>{
        await (await languageSelect(page)).selectOption(target);
        await expect(page).toHaveURL(home(target));
        await expect(await languageSelect(page)).toHaveValue(target);
      });
      await test.step('Reload and verify language persistence',async()=>{await page.reload({waitUntil:'domcontentloaded'});await expect(await languageSelect(page)).toHaveValue(target);await expect(page).toHaveURL(home(target));});
      expect(jsErrors).toEqual([]);
    });
    if(!scenario || scenario==='public.mobile') test(`public.mobile [${locale}]`,async({page,jsErrors})=>{
      await page.setViewportSize({width:375,height:812});
      await openHome(page,locale);
      const measure=async()=>{
        for(const fraction of [0,.25,.5,.75,1]) {
          await page.evaluate(f=>window.scrollTo(0,(document.documentElement.scrollHeight-innerHeight)*f),fraction);
          await expect.poll(()=>page.evaluate(()=>Math.max(document.documentElement.scrollWidth,document.body.scrollWidth)-document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
        }
        await page.evaluate(()=>window.scrollTo(0,0));
      };
      await test.step('Check horizontal overflow at five scroll positions',measure);
      const menu=page.getByRole('button',{name:/menu|meni|menü|menú|меню|メニュー|메뉴|菜单|菜單|選單|قائمة|מניו|مینو|मेन्यू|মেনু|เมนู|menija/i}).filter({visible:true}).first();
      test.skip(!await menu.count(),'NOT TESTED:RELIABLE_MENU_CONTROL_UNAVAILABLE');
      await menu.click();
      const link=page.locator(`a[href="${tools(locale)}"],a[href="https://aikit.ai${tools(locale)}"]`).filter({visible:true}).first();
      await expect(link,'Tools link becomes visible after opening the mobile menu').toBeVisible();
      await link.click();
      await expect(page).toHaveURL(`https://aikit.ai${tools(locale)}`);
      await expect(page.locator('main')).toBeVisible();
      await measure();expect(jsErrors).toEqual([]);
    });
  });
}
