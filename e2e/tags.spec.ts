import { expect, test } from '@playwright/test';
import { signIn } from './helpers.ts';

test('My tags in the profile: my color and weight; a tag opens the search', async ({ page }) => {
  await signIn(page);
  await page.getByRole('button', { name: /First Employee/ }).click();
  await page.getByRole('menuitem', { name: 'Профиль' }).click();
  await page.getByRole('tab', { name: 'Мои теги' }).click();
  const row = page.locator('.MuiStack-root').filter({ has: page.getByRole('button', { name: 'найм', exact: true }) }).filter({ has: page.getByRole('button', { name: 'Тяжелее' }) }).last();
  await row.getByRole('button', { name: '#8e24aa' }).click();
  await expect(row.getByRole('button', { name: 'найм', exact: true })).toHaveCSS('background-color', 'rgba(142, 36, 170, 0.16)');
  await row.getByRole('button', { name: 'Тяжелее' }).click();
  await expect(row.getByText('1', { exact: true })).toBeVisible();

  await row.getByRole('button', { name: 'найм', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0); // the profile closes
  await expect(page.getByRole('region', { name: 'Текущие задачи' }).getByRole('link', { name: /найм.*бэкенд/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'найм', exact: true })).toBeVisible();
});
