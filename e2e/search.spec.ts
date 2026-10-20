import { expect, test, type Page } from '@playwright/test';
import { errorToast, signIn, unique } from './helpers.ts';

// The search in My day, over Current tasks (docs/product/interface.md, Find).
test.describe('search', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  const search = (page: Page) => page.getByPlaceholder('Найти по тегам');
  const panel = (page: Page) => page.getByRole('region', { name: 'Текущие задачи' });

  test('"/" focuses it from a task too; a tag narrows the tasks; a task opens', async ({ page }) => {
    await panel(page).getByRole('link', { name: /^#\d+/ }).first().click();
    await expect(page).toHaveURL(/\/tasks\/\d+$/);
    await page.locator('body').press('/');
    await expect(page).toHaveURL(/\/$/);
    await expect(search(page)).toBeFocused();
    await page.keyboard.type('склад');
    await page.getByRole('option', { name: 'склад', exact: true }).click();
    await page.keyboard.press('Escape');
    await page.getByRole('tab', { name: /Остальные/ }).click();
    await expect(panel(page).getByRole('link', { name: /^#/ }).filter({ hasNotText: 'склад' })).toHaveCount(0);
    await panel(page).getByRole('link', { name: /склад инвентаризация/ }).click();
    await expect(page).toHaveURL(/\/tasks\/\d+$/);
  });

  test('a tag is found despite a typo or the other layout; words become a set of tags', async ({ page }) => {
    await search(page).fill('crkfl');
    await expect(page.getByRole('option', { name: 'склад', exact: true })).toBeVisible();
    await search(page).fill('склад инвентризация');
    await page.getByRole('option', { name: 'склад инвентаризация', exact: true }).first().click();
    await expect(page.getByRole('button', { name: 'инвентаризация', exact: true })).toBeVisible();
  });

  test('only tags are searched: a missing tag is not offered, Enter takes the best match', async ({ page }) => {
    const missing = unique('нет');
    await search(page).fill(missing);
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('option')).toHaveCount(0);
    await search(page).fill('crkfl');
    await expect(page.getByRole('option', { name: 'склад', exact: true })).toBeVisible();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('button', { name: 'склад', exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await page.getByRole('tab', { name: /Остальные/ }).click();
    await expect(panel(page).getByRole('link', { name: /склад инвентаризация/ })).toBeVisible();
  });

  test('"+" takes the title typed: the picked tags and the rest as a new tag', async ({ page }) => {
    await search(page).click();
    await page.keyboard.type('склад');
    await page.getByRole('option', { name: 'склад', exact: true }).click();
    const phrase = unique('новая приёмка');
    await page.keyboard.type(phrase);
    await panel(page).getByRole('button', { name: 'Новая задача' }).click();
    await expect(page.getByRole('button', { name: 'склад', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: phrase, exact: true })).toBeVisible();
  });

  test('a title that is taken: "+" is off, and the task with it is named', async ({ page }) => {
    await search(page).click();
    for (const tag of ['офис', 'переезд']) {
      await page.keyboard.type(tag);
      await page.keyboard.press('Enter');
      await expect(page.getByRole('button', { name: tag, exact: true })).toBeVisible();
    }
    await expect(panel(page).getByRole('button', { name: 'Новая задача' })).toBeDisabled();
    await panel(page).getByRole('link', { name: /^Такая задача уже есть: #\d+$/ }).click();
    await expect(page).toHaveURL(/\/tasks\/\d+$/);
  });
});
