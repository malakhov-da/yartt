import { expect, test } from '@playwright/test';
import { E2E_DEMO_URL } from './db.ts';

// The demo itself (DEMO_DATA=en, the second server of playwright.config.ts):
// no sign-in — a person is picked, and switched from the profile menu.
test.use({ baseURL: E2E_DEMO_URL });

test('the demo: pick whose eyes to see it through, switch from the menu; kept out of search engines', async ({ page }) => {
  const response = await page.goto('/');
  expect(response?.headers()['x-robots-tag']).toBe('noindex, nofollow');

  // The sign-in page is the company's people, not an email form (in the browser's language until someone is picked).
  await expect(page.getByRole('heading', { name: /demo|демо/i })).toBeVisible();
  await expect(page.getByLabel('Email')).toHaveCount(0);
  await expect(page.getByText('Michael Reed')).toBeVisible();
  await page.getByText('Emily Carter').click();

  // Signed in as Emily, in her language; the top line says it is a demo.
  await expect(page.getByRole('heading', { name: /^Waiting for me/ })).toBeVisible();
  await expect(page.getByRole('banner').getByText('Demo', { exact: true })).toBeVisible();

  await page.getByRole('banner').getByRole('button', { name: /Emily Carter/ }).click();
  await expect(page.getByText('View as')).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Emily Carter' })).toHaveCount(0); // not herself
  await page.getByRole('menuitem', { name: 'Jack Turner' }).click();

  await expect(page.getByRole('heading', { name: /^Waiting for me/ })).toBeVisible();
  await expect(page.getByRole('banner').getByRole('button', { name: /Jack Turner/ })).toBeVisible();
});
