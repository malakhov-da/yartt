/// <reference lib="dom" />
import { expect, test } from '@playwright/test';
import { signIn, sql } from './helpers.ts';

// The guide behind "?" in the top line, written for each language (decision 62).
test.describe('the guide', () => {
  test.afterEach(async () => {
    await sql`UPDATE employee SET locale = 'ru' WHERE email = 'olga@example.com'`;
  });

  test('opens from the top line: the essentials, use cases and why it is so; in the person\'s language', async ({ page }) => {
    await signIn(page, 'olga@example.com');
    await page.getByRole('link', { name: 'Как работать' }).click();
    await expect(page).toHaveURL(/\/help$/);
    await expect(page.getByRole('heading', { name: 'Как работать в яртт' })).toBeVisible();
    await page.getByRole('button', { name: 'Почему задача закрывается сама, когда наступает срок?' }).click();
    await expect(page.getByText(/настоящая ответственность за срок/)).toBeVisible();

    await sql`UPDATE employee SET locale = 'en' WHERE email = 'olga@example.com'`;
    await page.reload();
    await expect(page.getByRole('heading', { name: 'How to work in yartt' })).toBeVisible();
    await page.getByRole('button', { name: 'Create a task' }).click();
    await expect(page.getByText(/Press "New task" in the block/)).toBeVisible();
  });
});
