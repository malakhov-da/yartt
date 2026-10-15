import { expect, test } from '@playwright/test';
import { signIn } from './helpers.ts';

test.describe('search', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test('"/" focuses it; a tag narrows the tasks; a task opens', async ({ page }) => {
    await page.locator('body').press('/');
    const search = page.getByPlaceholder('Найти или создать');
    await expect(search).toBeFocused();
    await page.keyboard.type('склад');
    await page.getByRole('option', { name: 'склад', exact: true }).click();
    await page.getByRole('option', { name: /склад.*инвентаризация/ }).click();
    await expect(page).toHaveURL(/\/tasks\/\d+$/);
    await expect(page.getByText('инвентаризация').filter({ visible: true }).first()).toBeVisible();
  });

  test('a tag is found despite a typo or the other layout; words become a set of tags', async ({ page }) => {
    const search = page.getByPlaceholder('Найти или создать');
    await search.fill('crkfl');
    await expect(page.getByRole('option', { name: 'склад', exact: true })).toBeVisible();
    await search.fill('склад инвентризация');
    await page.getByRole('option', { name: 'склад инвентаризация', exact: true }).first().click();
    await page.getByRole('option', { name: /^#\d+ склад инвентаризация/ }).click();
    await expect(page).toHaveURL(/\/tasks\/\d+$/);
  });

  test('text is searched in contexts and comments of tasks I see', async ({ page }) => {
    await page.getByPlaceholder('Найти или создать').fill('карусель');
    await expect(page.getByRole('option', { name: /сайт.*редизайн.*главная/ })).toBeVisible();
  });

  test('the typed text becomes a tag of the created task, a new one too', async ({ page }) => {
    const tag = `новый-${Date.now()}`;
    await page.getByPlaceholder('Найти или создать').click();
    await page.keyboard.type('склад');
    await page.getByRole('option', { name: 'склад', exact: true }).click();
    await page.keyboard.type(tag);
    await page.getByRole('option', { name: `Создать задачу: склад · ${tag}` }).click();
    await expect(page).toHaveURL(/\/tasks\/\d+$/);
    await expect(page.getByText(tag).filter({ visible: true }).first()).toBeVisible();
  });

  test('the same set of tags twice is refused with an explanation', async ({ page }) => {
    await page.getByPlaceholder('Найти или создать').click();
    for (const tag of ['офис', 'переезд']) {
      await page.keyboard.type(tag);
      await page.keyboard.press('Enter');
    }
    await page.getByRole('option', { name: /Создать задачу/ }).click();
    await expect(page.getByText('Задача с таким набором тегов уже есть — добавьте тег, чтобы различить их.')).toBeVisible();
  });
});
