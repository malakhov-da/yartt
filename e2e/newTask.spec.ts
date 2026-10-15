import { expect, test } from '@playwright/test';
import { signIn, taskId, unique } from './helpers.ts';

test.describe('new task', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test('"New task" in My tasks: tags as the title, priority, then the task opens', async ({ page }) => {
    const tag = unique('форма');
    await page.getByRole('link', { name: 'Новая задача' }).click();
    await expect(page).toHaveURL(/\/tasks\/new$/);
    await expect(page.getByLabel('Теги')).toBeFocused();
    await page.keyboard.type(tag.toUpperCase());
    await page.getByRole('option', { name: `Создать тег «${tag}»` }).click();
    await page.keyboard.type('склад');
    await page.keyboard.press('Escape');
    await page.getByLabel('Приоритет').click();
    await page.getByRole('option', { name: 'Высокий' }).click();
    await page.getByRole('button', { name: 'Создать задачу' }).click();
    await expect(page).toHaveURL(/\/tasks\/\d+$/);
    await expect(page.getByText(tag, { exact: true }).filter({ visible: true }).first()).toBeVisible();
    await expect(page.getByText('склад', { exact: true }).filter({ visible: true }).first()).toBeVisible();
    await expect(page.getByText('Высокий').filter({ visible: true }).first()).toBeVisible();
  });

  test('"New task" under "Waited on by" makes a task that waits for this one', async ({ page }) => {
    const id = await taskId('склад', 'инвентаризация');
    await page.goto(`/tasks/${id}`);
    await page.getByRole('link', { name: 'Новая задача' }).last().click();
    await expect(page).toHaveURL(new RegExp(`/tasks/new\\?waitsFor=${id}$`));
    await expect(page.getByText('Будет ждать задачу')).toBeVisible();
    await expect(page.getByLabel('Теги')).toBeFocused();
    await page.keyboard.type(unique('ждёт'));
    await page.keyboard.press('Enter');
    await page.getByRole('button', { name: 'Создать задачу' }).click();
    await expect(page).toHaveURL(/\/tasks\/\d+$/);
    await expect(page.getByRole('link', { name: new RegExp(`#${id} склад инвентаризация`) })).toBeVisible();
  });
});
