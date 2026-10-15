import { expect, test, type Page } from '@playwright/test';
import { errorToast, signIn, unique } from './helpers.ts';

// The search in My day, over Current tasks (docs/product/interface.md, Find).
test.describe('search', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  const search = (page: Page) => page.getByPlaceholder('Найти: теги или текст');
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

  test('text is searched in contexts and comments of tasks I see', async ({ page }) => {
    await search(page).fill('карусель');
    await expect(panel(page).getByRole('link', { name: /сайт.*редизайн.*главная/ })).toBeVisible();
  });

  test('"Create tag" when nothing is spelled so; "New task" takes the picked tags', async ({ page }) => {
    const tag = unique('новый');
    await search(page).click();
    await page.keyboard.type('склад');
    await page.getByRole('option', { name: 'склад', exact: true }).click();
    await page.keyboard.type(tag);
    await page.getByRole('option', { name: `Создать тег «${tag}»` }).click();
    await page.keyboard.press('Escape');
    await expect(panel(page).getByText('Ничего не найдено')).toBeVisible();
    await page.getByRole('tab', { name: /Мои/ }).click();
    await page.getByRole('link', { name: 'Новая задача' }).click();
    await expect(page.getByRole('button', { name: tag, exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Создать задачу' }).click();
    await expect(page).toHaveURL(/\/tasks\/\d+$/);
    await expect(page.getByText(tag, { exact: true }).filter({ visible: true }).first()).toBeVisible();
  });

  test('the same set of tags twice is refused with an explanation', async ({ page }) => {
    await search(page).click();
    for (const tag of ['офис', 'переезд']) {
      await page.keyboard.type(tag);
      await page.keyboard.press('Enter');
      await expect(page.getByRole('button', { name: tag, exact: true })).toBeVisible();
    }
    await page.keyboard.press('Escape');
    await page.getByRole('tab', { name: /Мои/ }).click();
    await page.getByRole('link', { name: 'Новая задача' }).click();
    await page.getByRole('button', { name: 'Создать задачу' }).click();
    await expect(errorToast(page)).toHaveText('Задача с таким набором тегов уже есть — добавьте тег, чтобы различить их.');
  });
});
