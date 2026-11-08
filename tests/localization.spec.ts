import { test, expect } from '@playwright/test';

const languageChanges = [
  {
    from: 'en', to: 'ru', label: 'Русский',
    heading: 'интернет-магазины', tools: 'Инструменты', openMenu: 'Открыть меню',
  },
  {
    from: 'ru', to: 'ka', label: 'ქართული',
    heading: 'ვებსაიტების შექმნა', tools: 'უფასო ინსტრუმენტები', openMenu: 'მენიუს გახსნა',
  },
  {
    from: 'ka', to: 'en', label: 'English',
    heading: 'Digital Solutions', tools: 'Free Tools', openMenu: 'Open menu',
  },
] as const;

test.describe('Language switching through the website interface', () => {
  for (const change of languageChanges) {
    test(`${change.from.toUpperCase()} to ${change.to.toUpperCase()} keeps content and tools navigation localized`, async ({ page, isMobile }) => {
      await page.goto(`/${change.from}/`);
      await page.locator('header').getByRole('link', { name: change.label, exact: true }).click();

      await expect(page).toHaveURL(new RegExp(`/${change.to}/$`));
      await expect(page.locator('html')).toHaveAttribute('lang', change.to);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expect(page.getByRole('heading', { level: 1 })).toContainText(change.heading);
      await expect(page.locator('header').getByRole('link', { name: change.label, exact: true }))
        .toHaveAttribute('aria-current', 'page');

      if (isMobile) {
        const toggle = page.getByRole('button', { name: change.openMenu, exact: true });
        await toggle.click();
        await expect(page.locator('button[aria-controls="main-nav"]'))
          .toHaveAttribute('aria-expanded', 'true');
      }

      await page.locator('#main-nav').getByRole('link', { name: change.tools, exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`/${change.to}/tools/$`));
      await expect(page.locator('html')).toHaveAttribute('lang', change.to);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    });
  }
});
