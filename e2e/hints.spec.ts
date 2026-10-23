import { expect, test } from '@playwright/test';
import { signIn, taskId } from './helpers.ts';

// Words that are not self-evident explain themselves on hover.
test('"My open" and a deadline explain what they mean', async ({ page }) => {
  await signIn(page);
  // Away from the task lines first: their hints would cover the tab.
  await page.mouse.move(0, 0);
  await expect(page.getByRole('tooltip')).toHaveCount(0);
  await page.getByRole('tab', { name: /Мои открытые/ }).hover();
  await expect(page.getByRole('tooltip').filter({ hasText: /за которые отвечаете вы/ })).toBeVisible();

  await page.goto(`/tasks/${await taskId('сайт', 'новая главная к осенней кампании')}`);
  await page.getByLabel('Дедлайн').hover();
  // Hints of the task lines under the pointer on the way may show too: the deadline's is the one looked for.
  await expect(page.getByRole('tooltip').filter({ hasText: /Когда он наступит, задача закроется сама/ })).toBeVisible();
});

test('a task whose plan does not fit the deadline is marked at risk, and says whose plan', async ({ page }) => {
  await signIn(page);
  await page.goto(`/tasks/${await taskId('сайт', 'новая главная к осенней кампании')}`);
  const chip = page.getByText('Под угрозой').first();
  await expect(chip).toBeVisible();
  await chip.hover();
  // The site is also late for Pavel's task, which needs it earlier: both reasons are said.
  await expect(page.getByRole('tooltip').filter({ hasText: /Павел Орлов в плане/ })).toContainText(/Задерживает #\d+/);
});

test('a latest deadline on the task waited for says who sets it and where', async ({ page }) => {
  await signIn(page);
  const api = await taskId('сайт', 'api', 'перевести форму заявки на новый api');
  await page.goto(`/tasks/${await taskId('сайт', 'новая главная к осенней кампании')}`);
  await page.getByText(/^ждёт эту до /).first().hover();
  await expect(page.getByRole('tooltip').filter({ hasText: `задаёт владелец #${api}` })).toBeVisible();
});
