import { expect, test } from '@playwright/test';
import { signIn, taskId } from './helpers.ts';

// Hour budgets on tag combinations (decision 69).
test('a budget shows spent of the limit and the forecast; a change is a new version kept in the history; the task shows it', async ({ page }) => {
  await signIn(page, 'alexey@example.com');
  await page.getByRole('link', { name: 'Теги', exact: true }).click(); // from the top line
  const block = page.getByRole('region', { name: 'Бюджеты часов' });
  // The demo's budget on the site: logged and planned already go past it.
  await expect(block.getByText(/из 80ч · \d+% · прогноз/)).toBeVisible();

  await block.getByRole('button', { name: 'Изменить (новая версия)' }).first().click();
  await expect(block.getByText(/Сохранение создаст новую версию/)).toBeVisible();
  await block.getByLabel('Часов').fill('120');
  await block.getByRole('button', { name: 'Сохранить' }).click();
  await expect(block.getByText(/из 120ч · \d+% · прогноз/)).toBeVisible();
  // Ordered by the end of the period: Marina's on the warehouse first, mine on the site after it.
  await block.getByRole('button', { name: 'Показать график и историю' }).last().click();
  await expect(block.getByText('История')).toBeVisible();
  await expect(block.getByText(/80ч, .* · действовал /)).toBeVisible();

  // On the task, under My time: the budgets it falls under.
  await page.goto(`/tasks/${await taskId('сайт', 'новая главная к осенней кампании')}`);
  await expect(page.getByText('Бюджеты этой задачи')).toBeVisible();
  await expect(page.getByText(/из 120ч · \d+% · прогноз/)).toBeVisible();
});

test('a tag picked for a budget clears the text typed to find it', async ({ page }) => {
  await signIn(page, 'alexey@example.com');
  await page.goto('/tags');
  const block = page.getByRole('region', { name: 'Бюджеты часов' });
  await block.getByRole('button', { name: 'Новый бюджет' }).click();
  const tags = block.getByRole('combobox', { name: 'Теги' });
  await tags.fill('сай');
  await page.getByRole('option', { name: 'сайт', exact: true }).click();
  await expect(block.getByRole('button', { name: 'сайт' })).toBeVisible();
  await expect(tags).toHaveValue('');
});
