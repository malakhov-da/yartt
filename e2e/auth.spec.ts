import { expect, test } from '@playwright/test';
import { FIRST, signIn, sql } from './helpers.ts';

test.describe('sign-in', () => {
  test('a link is requested by email; the page does not tell whether the email exists', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/login$/);
    await page.getByLabel('Email').fill('nobody@example.com');
    await page.getByRole('button', { name: 'Получить ссылку' }).click();
    await expect(page.getByText('Если такой сотрудник есть, мы отправили ссылку для входа.')).toBeVisible();
  });

  test('the link signs in once; log out returns to the sign-in page', async ({ page }) => {
    const [row] = await sql<{ token: string }[]>`SELECT issue_token(${FIRST}) AS token`;
    await page.goto(`/login/${row!.token}`);
    await expect(page.getByRole('heading', { name: /Ждёт меня/ })).toBeVisible();
    await expect(page).toHaveTitle(/яртт/);

    await page.getByRole('button', { name: /Алексей Громов/ }).click();
    await page.getByRole('menuitem', { name: 'Выйти' }).click();
    await expect(page).toHaveURL(/\/login$/);

    // The same link again: single-use.
    await page.goto(`/login/${row!.token}`);
    await expect(page.getByText(/Ссылка для входа недействительна/)).toBeVisible();
  });

  test('a dismissed employee cannot sign in', async ({ page }) => {
    const [row] = await sql<{ token: string | null }[]>`SELECT issue_token('sergey@example.com') AS token`;
    expect(row!.token).toBeNull();
    await signIn(page);
  });
});

test('a sign-in link switches to its person even when someone is signed in', async ({ page }) => {
  await signIn(page);
  await expect(page.getByRole('heading', { name: 'Моя команда' })).toBeVisible();
  await signIn(page, 'ivan@example.com');
  await expect(page.getByRole('button', { name: /Иван Кузнецов/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Моя команда' })).toHaveCount(0);
});
