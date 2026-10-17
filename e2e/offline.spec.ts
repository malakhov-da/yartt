import { expect, test } from '@playwright/test';
import { editable, signIn, taskId } from './helpers.ts';

// Working offline (decision 43): a change made without a connection is
// accepted, survives a reload, and goes out when the connection is back.
test('a comment written offline waits in the outbox, survives a reload and is sent when online', async ({ page, context }) => {
  await signIn(page);
  const id = await taskId('отчёт', 'q3');
  await page.goto(`/tasks/${id}`);
  await expect(page.getByText('отчёт').filter({ visible: true }).first()).toBeVisible();
  // The service worker takes over the page once it is installed.
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload();
  await page.waitForLoadState('networkidle');

  await context.setOffline(true);
  await editable(page).click();
  await page.keyboard.type('Написано без связи');
  await page.getByRole('button', { name: 'Отправить' }).click();
  await expect(page.getByText(/Нет связи — изменение сохранено/)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('Не отправлено · 1')).toBeVisible();

  // Still offline, a reload brings the app back from the cache, the change still waiting.
  await page.reload();
  await expect(page.getByText('Не отправлено · 1')).toBeVisible();
  await expect(page.getByText('отчёт').filter({ visible: true }).first()).toBeVisible();

  await context.setOffline(false);
  await expect(page.getByText(/отправлено изменений: 1/)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('Не отправлено · 1')).toHaveCount(0);
  await expect(page.getByText('Написано без связи').first()).toBeVisible();
});
