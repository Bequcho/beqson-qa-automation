import { test as base, expect } from '@playwright/test';

// Block writes before loading production, including any accidental lead submission.
const test = base.extend<{ blockedWrites: string[] }>({
  blockedWrites: [async ({ context }, use) => {
    const blocked: string[] = [];
    await context.route('**/*', async route => {
      const request = route.request();
      if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) {
        blocked.push(`${request.method()} ${request.url()}`);
        await route.abort('blockedbyclient');
        return;
      }
      await route.continue();
    });
    await use(blocked);
    expect(blocked, 'Client validation and price selection must not attempt network writes').toEqual([]);
  }, { auto: true }],
});

test.describe('Website calculator interactions and validation', () => {
  test('calculates a business website with a large scope and selected add-ons', async ({ page }) => {
    await page.goto('/en/calculator/');
    await page.getByRole('button', { name: /^Business website/ }).click();
    await page.getByRole('button', { name: /^10\+ pages/ }).click();
    await page.getByRole('button', { name: /^Standard/ }).click();
    await page.getByRole('checkbox', { name: /^SEO setup/ }).check();
    await page.getByRole('checkbox', { name: /^CRM & forms/ }).check();

    // Reviewed USD tariff: 249 + 220 + 50 + 80 = 599 -> 600; 600 * 1.22 -> 730.
    await expect(page.locator('#price')).toHaveText('$600–$730');
    await expect(page.locator('#package')).toHaveText('Pro');
    await expect(page.locator('#summary')).toContainText('SEO setup, CRM & forms');
    await expect(page.locator('#mobilePrice')).toHaveText('$600–$730');
  });

  test('handles the smallest and largest scope options with zero add-ons and reverses the calculation', async ({ page }) => {
    await page.goto('/en/calculator/');
    await page.getByRole('button', { name: /^Landing page/ }).click();
    const smallestScope = page.getByRole('button', { name: /^1 page/ });
    await expect(smallestScope).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#extras').getByRole('checkbox', { checked: true })).toHaveCount(0);

    // Minimum: 149 + 0 -> 150; 150 * 1.22 -> 180. No invented numeric input.
    await expect(page.locator('#price')).toHaveText('$150–$180');
    await expect(page.locator('#package')).toHaveText('Start');
    await expect(page.locator('#summary')).toContainText('no add-ons');

    await page.getByRole('button', { name: /^10\+ pages/ }).click();
    // Largest offered scope: 149 + 220 -> 370; 370 * 1.22 -> 450.
    await expect(page.locator('#price')).toHaveText('$370–$450');
    await expect(page.locator('#package')).toHaveText('Growth');

    await smallestScope.click();
    await expect(page.locator('#price')).toHaveText('$150–$180');
    await expect(page.locator('#package')).toHaveText('Start');
    await expect(page.locator('#extras').getByRole('checkbox', { checked: true })).toHaveCount(0);
  });

  test('rejects empty and whitespace-only estimate requests without sending a lead', async ({ page, blockedWrites }) => {
    await page.goto('/en/calculator/');
    await page.getByRole('button', { name: /Get exact estimate/ }).click();
    const name = page.getByLabel('Your name', { exact: true });
    const contact = page.getByLabel('WhatsApp / Telegram / Email', { exact: true });
    const send = page.getByRole('button', { name: /Send configuration/ });

    await send.click();
    await expect(name).toHaveValue('');
    await expect(name).toBeFocused();
    expect(await name.evaluate((input: HTMLInputElement) => input.validity.valueMissing)).toBe(true);
    expect(await contact.evaluate((input: HTMLInputElement) => input.validity.valueMissing)).toBe(true);
    expect(blockedWrites).toEqual([]);

    // A reserved .invalid address is synthetic; every network write is intercepted.
    await name.fill('   ');
    await contact.fill('qa-validation@example.invalid');
    await page.getByRole('checkbox', { name: /I agree that BEQSON/ }).check();
    await send.click();
    await expect(page.getByRole('alert')).toHaveText('Enter your name, contact and confirm consent.');
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page.locator('#leadSuccess')).toBeHidden();
    expect(blockedWrites).toEqual([]);
  });
});
