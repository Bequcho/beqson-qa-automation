import { test, expect } from '@playwright/test';

test.describe('Mobile menu behavior', () => {
  test.beforeEach(({ isMobile }) => {
    test.skip(!isMobile, 'These interactions require the configured mobile browser profile.');
  });

  test('supports toggle and Escape dismissal with keyboard focus restoration', async ({ page }) => {
    await page.goto('/en/');
    const toggle = page.getByRole('button', { name: 'Open menu', exact: true });
    const navigation = page.locator('#main-nav');
    await expect(navigation).toBeHidden();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');

    await toggle.click();
    await expect(navigation).toBeVisible();
    const close = page.getByRole('button', { name: 'Close', exact: true });
    await expect(close).toHaveAttribute('aria-expanded', 'true');
    await expect(navigation.getByRole('link', { name: 'Business Solutions', exact: true })).toBeFocused();

    await close.click();
    await expect(navigation).toBeHidden();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');

    await toggle.click();
    await expect(navigation).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(navigation).toBeHidden();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(toggle).toBeFocused();
  });

  test('closes after a section link and can reopen to navigate to Projects', async ({ page }) => {
    await page.goto('/en/');
    const toggle = page.getByRole('button', { name: 'Open menu', exact: true });
    const navigation = page.locator('#main-nav');

    await toggle.click();
    await navigation.getByRole('link', { name: 'Business Solutions', exact: true }).click();
    await expect(page).toHaveURL(/\/en\/#services$/);
    await expect(navigation).toBeHidden();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('#services')).toBeInViewport();

    await toggle.click();
    await expect(navigation).toBeVisible();
    const documentResponse = page.waitForResponse(response =>
      new URL(response.url()).pathname === '/en/projects/' &&
      response.request().resourceType() === 'document',
    );
    await navigation.getByRole('link', { name: 'Our Projects', exact: true }).click();
    expect((await documentResponse).ok()).toBe(true);
    await expect(page).toHaveURL(/\/en\/projects\/$/);
    await expect(page.getByRole('heading', { level: 1 }))
      .toHaveText('A broader view of what we can build.');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });
});
