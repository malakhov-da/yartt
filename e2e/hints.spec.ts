import { expect, test } from '@playwright/test';
import { signIn, taskId } from './helpers.ts';

// Words that are not self-evident explain themselves on hover.
test('"I own" and a deadline explain what they mean', async ({ page }) => {
  await signIn(page);
  await page.getByRole('tab', { name: /Я владелец/ }).hover();
  await expect(page.getByRole('tooltip')).toHaveText(/за которые отвечаете вы/);

  await page.goto(`/tasks/${await taskId('сайт', 'новая главная к осенней кампании')}`);
  await page.getByLabel('Дедлайн').hover();
  await expect(page.getByRole('tooltip')).toHaveText(/Когда он наступит, задача закроется сама/);
});

test('a task whose plan does not fit the deadline is marked at risk, and says whose plan', async ({ page }) => {
  await signIn(page);
  await page.goto(`/tasks/${await taskId('сайт', 'новая главная к осенней кампании')}`);
  const chip = page.getByText('Под угрозой').first();
  await expect(chip).toBeVisible();
  await chip.hover();
  await expect(page.getByRole('tooltip')).toHaveText(/Павел Орлов в плане/);
});
