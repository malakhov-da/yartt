import { expect, test } from '@playwright/test';
import { editable, signIn, taskId, unique } from './helpers.ts';

// What is typed and not saved outlives leaving the page (decision 36).
test('a comment, a new task and a context being edited survive going elsewhere', async ({ page }) => {
  await signIn(page, 'marina@example.com');
  const id = await taskId('склад', 'инвентаризация за октябрь');
  const panel = page.getByRole('region', { name: 'Текущие задачи' });

  await page.goto(`/tasks/${id}`);
  await editable(page).click();
  await page.keyboard.type('недописанный комментарий');
  await page.getByRole('button', { name: 'Изменить', exact: true }).last().click();
  await page.locator('.ProseMirror[contenteditable="true"]').first().click();
  await page.keyboard.type(' и правка контекста');

  await page.getByRole('link', { name: 'Мой день' }).click();
  await panel.getByRole('button', { name: 'Новая задача' }).click();
  const tag = unique('черновик');
  await expect(page.getByLabel('Теги')).toBeFocused();
  await page.keyboard.type(tag);
  await page.getByRole('button', { name: `Новый тег «${tag}»` }).click();
  await expect(page.getByRole('button', { name: tag, exact: true })).toBeVisible();

  await page.goto(`/tasks/${id}`);
  await expect(page.getByText('недописанный комментарий')).toBeVisible();
  await expect(page.getByText('и правка контекста')).toBeVisible();
  await page.getByRole('button', { name: 'Отмена' }).first().click();

  await page.getByRole('link', { name: 'Мой день' }).click();
  await panel.getByRole('button', { name: 'Новая задача' }).click();
  await expect(page.getByRole('button', { name: tag, exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Отмена' }).click();
  await panel.getByRole('button', { name: 'Новая задача' }).click();
  await expect(page.getByRole('button', { name: tag, exact: true })).toHaveCount(0);
});
