import { expect, test } from '@playwright/test';
import { createTask, signIn, sql, taskId, unique } from './helpers.ts';

test.describe('new task', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test('"+" in the search opens a new task: tags as the title, priority, then the task opens', async ({ page }) => {
    const tag = unique('форма');
    await page.getByRole('button', { name: 'Новая задача' }).click();
    await expect(page).toHaveURL(/\/tasks\/new$/);
    await expect(page.getByLabel('Теги')).toBeFocused();
    // Enter never makes a tag: a new one is its own button, under the field.
    await page.keyboard.type(tag.toUpperCase());
    await page.keyboard.press('Enter');
    await expect(page.getByRole('button', { name: tag, exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: `Новый тег «${tag}»` }).click();
    // A new tag exists only once the task is saved: titles change while typed.
    expect(await sql`SELECT 1 FROM tag WHERE name = ${tag}`).toHaveLength(0);
    // A tag spelled exactly so exists: it has to be picked before the task is created.
    await page.keyboard.type('склад');
    await expect(page.getByText('Тег «склад» уже есть — выберите его в подсказках')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Создать задачу' })).toBeDisabled();
    await page.keyboard.press('Enter');
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
    const id = await taskId('склад', 'инвентаризация за октябрь');
    await page.goto(`/tasks/${id}`);
    await page.getByRole('link', { name: 'Новая задача' }).last().click();
    await expect(page).toHaveURL(new RegExp(`/tasks/new\\?waitsFor=${id}$`));
    await expect(page.getByText('Будет ждать задачу')).toBeVisible();
    await expect(page.getByLabel('Теги')).toBeFocused();
    // The title starts as that task's tags; the same set is taken, so something must be added.
    await expect(page.getByRole('button', { name: 'склад', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'инвентаризация за октябрь', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Создать задачу' })).toBeDisabled();
    // Text left unpicked becomes a tag of its own: one phrase, one tag.
    const phrase = `${unique('ждёт')} акта`;
    await page.keyboard.type(phrase);
    await page.getByRole('button', { name: 'Создать задачу' }).click();
    await expect(page).toHaveURL(/\/tasks\/\d+$/);
    await expect(page.getByRole('link', { name: new RegExp(`#${id} склад инвентаризация за октябрь`) })).toBeVisible();
    await expect(page.getByText(phrase, { exact: true }).filter({ visible: true }).first()).toBeVisible();
  });

  test('"Add" under "Waits for" finds a task by tags and links it', async ({ page }) => {
    await createTask(page, [unique('связь')]);
    await page.getByRole('button', { name: 'Добавить' }).first().click();
    await page.getByLabel('Найти задачу: теги или номер').click();
    await page.keyboard.type('офис');
    await page.keyboard.press('Enter');
    await page.getByRole('button', { name: /^Выбрать задачу #\d+$/ }).first().click();
    await page.getByRole('button', { name: 'Сохранить' }).click();
    await expect(page.getByRole('link', { name: /офис.*(переезд|принтер)/ })).toBeVisible();
  });
});
