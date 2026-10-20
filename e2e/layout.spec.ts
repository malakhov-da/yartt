/// <reference lib="dom" />
import { expect, test, type Page } from '@playwright/test';
import { employeeId, signIn, taskId } from './helpers.ts';

/** Nothing sticks out to the side: no horizontal scroll at phone width. */
async function fits(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
}

test.describe('at phone width', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('My day with the team, a task, an employee page', async ({ page }) => {
    await signIn(page);
    await fits(page);
    await page.goto(`/tasks/${await taskId('сайт', 'новая главная к осенней кампании')}`);
    await expect(page.getByText('Новая главная к запуску осенней кампании.')).toBeVisible();
    await fits(page);
    await page.goto(`/employees/${await employeeId('marina@example.com')}`);
    await expect(page.getByRole('heading', { name: 'Показатели' })).toBeVisible();
    await fits(page);
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Моя команда' })).toBeVisible();
    await fits(page);
    // The team table fits its block, its details open too: no scroll inside either.
    const table = page.getByRole('table').filter({ has: page.getByRole('columnheader', { name: 'Задержка' }) });
    await table.getByRole('row').filter({ hasText: 'Марина Соколова' }).first().getByRole('button', { name: /^(Подробнее и графики|Скрыть подробности)$/ }).click();
    await expect(page.getByText('Время', { exact: true })).toBeVisible();
    expect(await table.evaluate((el) => el.parentElement!.scrollWidth - el.parentElement!.clientWidth)).toBeLessThanOrEqual(1);
    await fits(page);
  });
});
