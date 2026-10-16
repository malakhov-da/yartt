import { expect, test } from '@playwright/test';
import { signIn, taskId } from './helpers.ts';

// Words that are not self-evident explain themselves on hover.
test('"I own" and a deadline explain what they mean', async ({ page }) => {
  await signIn(page);
  await page.getByRole('tab', { name: /Я владелец/ }).hover();
  await expect(page.getByRole('tooltip')).toHaveText(/за которые отвечаете вы/);

  await page.goto(`/tasks/${await taskId('сайт', 'редизайн', 'главная')}`);
  await page.getByLabel('Дедлайн').hover();
  await expect(page.getByRole('tooltip')).toHaveText(/Когда он наступит, задача закроется сама/);
});
