import { test, expect } from '@playwright/test';

test.describe('BEQSON website smoke tests', () => {
  test('root URL routes visitors to the English homepage', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/en\/?$/);
    await expect(page).toHaveTitle(/BEQSON/i);
  });

  for (const language of ['en', 'ru', 'ka'] as const) {
    test(`${language.toUpperCase()} homepage loads with correct language`, async ({ page }) => {
      await page.goto(`/${language}/`);
      await expect(page.locator('html')).toHaveAttribute('lang', language);
      await expect(page.locator('h1').first()).toBeVisible();
      await expect(page.locator('#main-nav')).toBeAttached();
    });
  }

  test('English tools navigation opens the expected page', async ({ page, isMobile }) => {
    await page.goto('/en/');
    if (isMobile) {
      const toggle = page.locator('button.menu-toggle');
      await expect(toggle).toBeVisible();
      await toggle.click();
      await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    }

    await page.locator('#main-nav a[href="/en/tools/"]').click();
    await expect(page).toHaveURL(/\/en\/tools\/?$/);
    await expect(page.locator('h1')).toBeVisible();
  });

  test('contact links are available without sending messages', async ({ page }) => {
    await page.goto('/en/');
    const section = page.locator('#contact');
    await expect(section).toBeAttached();
    await expect(section.locator('a[href^="https://wa.me/"]').first()).toHaveAttribute('href', /wa\.me/);
    await expect(section.locator('a[href^="https://t.me/"]').first()).toHaveAttribute('href', /t\.me/);
    await expect(section.locator('a[href^="mailto:"]').first()).toHaveAttribute('href', /mailto:/);
  });

  test('English homepage exposes a canonical URL and language alternatives', async ({ page }) => {
    await page.goto('/en/');
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/en\/$/);
    for (const language of ['en', 'ru', 'ka']) {
      await expect(page.locator(`link[rel="alternate"][hreflang="${language}"]`))
        .toHaveAttribute('href', new RegExp(`/${language}/$`));
    }
  });
});
