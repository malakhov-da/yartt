import { expect, test } from '@playwright/test';
import { createTask, signIn, sql, taskId, unique } from './helpers.ts';

test.describe('new task', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test('"New task" over the search opens a new task: tags as the title, priority, then the task opens', async ({ page }) => {
    const tag = unique('форма');
    await page.getByRole('button', { name: 'Новая задача' }).click();
    await expect(page).toHaveURL(/\/tasks\/new$/);
    await expect(page.getByLabel('Теги')).toBeFocused();
    // Enter makes a new tag when none is spelled so; the cursor stays in the field.
    await page.keyboard.type(tag.toUpperCase());
    await page.keyboard.press('Enter');
    await expect(page.getByRole('button', { name: tag, exact: true })).toBeVisible();
    await expect(page.getByLabel('Теги')).toHaveValue('');
    await expect(page.getByLabel('Теги')).toBeFocused();
    // The button for it holds its place while the letters are checked — the form does not jump —
    // and leaves the cursor in the field too.
    const second = unique('макет');
    await page.keyboard.type(second.slice(0, 3));
    const button = page.getByRole('button', { name: /^Новый тег «/ });
    await expect(button).toBeVisible();
    const element = await button.elementHandle();
    await page.keyboard.type(second.slice(3), { delay: 30 });
    expect(await element!.evaluate((e) => e.isConnected)).toBe(true);
    await page.getByRole('button', { name: `Новый тег «${second}»` }).click();
    await expect(page.getByRole('button', { name: second, exact: true })).toBeVisible();
    await expect(page.getByLabel('Теги')).toBeFocused();
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
    // The title reads as text: its tags with dots between.
    const heading = page.getByRole('main').getByRole('heading', { level: 1 });
    await expect(heading).toContainText(tag);
    await expect(heading).toContainText('склад');
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
    await expect(page.getByRole('link', { name: new RegExp(`#${id} склад · инвентаризация за октябрь`) })).toBeVisible();
    await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toContainText(phrase);
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
