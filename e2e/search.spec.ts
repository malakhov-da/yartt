import { expect, test, type Page } from '@playwright/test';
import { errorToast, signIn, unique } from './helpers.ts';

// The search in My day, over Current tasks (docs/product/interface.md, Find).
test.describe('search', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  const search = (page: Page) => page.getByPlaceholder('Найти по тегам');
  const panel = (page: Page) => page.getByRole('region', { name: 'Текущие задачи' });
  /** The tags picked in the search field (tags in the lines below are buttons too). */
  const picked = (page: Page) => panel(page).locator('.MuiAutocomplete-root');

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
    await panel(page).getByRole('link', { name: /склад инвентаризация за октябрь/ }).click();
    await expect(page).toHaveURL(/\/tasks\/\d+$/);
  });

  test('a tag in a task line adds itself to the search instead of opening the task', async ({ page }) => {
    await panel(page).getByRole('link', { name: /^#\d+ сайт/ }).first().getByRole('button', { name: 'сайт', exact: true }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(picked(page).getByRole('button', { name: 'сайт', exact: true })).toBeVisible();
    await expect(panel(page).getByRole('link', { name: /^#/ }).first()).toBeVisible();
    await expect(panel(page).getByRole('link', { name: /^#/ }).filter({ hasNotText: 'сайт' })).toHaveCount(0);
  });

  test('a tag is found despite a typo or the other layout; words become a set of tags', async ({ page }) => {
    await search(page).fill('crkfl');
    await expect(page.getByRole('option', { name: 'склад', exact: true })).toBeVisible();
    await search(page).fill('скалд закупкм');
    await page.getByRole('option', { name: 'склад закупки', exact: true }).first().click();
    await expect(picked(page).getByRole('button', { name: 'закупки', exact: true })).toBeVisible();
  });

  test('only tags are searched: a missing tag is not offered, Enter takes the best match', async ({ page }) => {
    const missing = unique('нет');
    await search(page).fill(missing);
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('option')).toHaveCount(0);
    await search(page).fill('crkfl');
    await expect(page.getByRole('option', { name: 'склад', exact: true })).toBeVisible();
    await page.keyboard.press('Enter');
    await expect(picked(page).getByRole('button', { name: 'склад', exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await page.getByRole('tab', { name: /Остальные/ }).click();
    await expect(panel(page).getByRole('link', { name: /склад инвентаризация за октябрь/ })).toBeVisible();
  });

  test('"New task" takes the title typed: the picked tags and the rest as a new tag', async ({ page }) => {
    await search(page).click();
    await page.keyboard.type('склад');
    await page.getByRole('option', { name: 'склад', exact: true }).click();
    const phrase = unique('новая приёмка');
    await page.keyboard.type(phrase);
    await panel(page).getByRole('button', { name: 'Новая задача' }).click();
    // In the new task's form, which covers My day.
    const form = page.getByRole('main');
    await expect(form.getByRole('heading', { name: 'Новая задача' })).toBeVisible();
    await expect(form.getByRole('button', { name: 'склад', exact: true })).toBeVisible();
    await expect(form.getByRole('button', { name: phrase, exact: true })).toBeVisible();
  });

  test('a title that is taken: "New task" is off, and the task with it is named, with a link', async ({ page }) => {
    await search(page).click();
    // A title as the demo's office move has it: the rubric and its phrase.
    for (const tag of ['офис', 'переезд на 5-й этаж']) {
      await page.keyboard.type(tag);
      await page.keyboard.press('Enter');
      await expect(picked(page).getByRole('button', { name: tag, exact: true })).toBeVisible();
    }
    await expect(panel(page).getByRole('button', { name: 'Новая задача' })).toBeDisabled();
    await panel(page).getByRole('link', { name: /^Такая задача уже есть: #\d+$/ }).click();
    await expect(page).toHaveURL(/\/tasks\/\d+$/);
  });
});
