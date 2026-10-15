import { expect, test } from '@playwright/test';
import { employeeId, signIn } from './helpers.ts';

test.describe('Team and the employee page', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test('My team in My day: the whole subtree for a range, direct reports first, with totals', async ({ page }) => {
    const team = page.locator('.MuiPaper-root').filter({ has: page.getByRole('heading', { name: 'Моя команда' }) });
    await expect(team).toBeVisible();
    for (const column of ['Табель', 'В задачах', 'Оценка', 'К оценке', 'Вручную', 'Автоматически', 'Открыто']) {
      await expect(team.getByRole('columnheader', { name: column })).toBeVisible();
    }
    const rows = team.getByRole('row');
    await expect(rows.nth(1)).toContainText('Ольга Белова'); // direct reports first (by name)
    await expect(team.getByText(/^до \d+/)).toBeVisible(); // Olga is away
    await expect(team.getByRole('cell', { name: 'Подчинённые ваших подчинённых' })).toBeVisible();
    await expect(team.getByText(/руководитель — Марина Соколова/).first()).toBeVisible();
    await expect(team.getByText('Уволен')).toBeVisible();
    await expect(team.getByRole('row', { name: /^Всего/ })).toBeVisible();

    await team.getByRole('button', { name: '7 дн.' }).click();
    await expect(team.getByRole('button', { name: '7 дн.' })).toHaveClass(/MuiChip-filled/);
    await team.getByRole('link', { name: 'Марина Соколова' }).click();
    await expect(page).toHaveURL(/\/employees\/\d+$/);
  });

  test('someone without reports has no team block', async ({ page }) => {
    await signIn(page, 'ivan@example.com');
    await expect(page.getByRole('heading', { name: 'Моя команда' })).toHaveCount(0);
  });

  test('metrics for a range with a chart; the direct manager scores and corrects a day', async ({ page }) => {
    await page.goto(`/employees/${await employeeId('marina@example.com')}`);
    await expect(page.getByRole('heading', { name: 'Показатели' })).toBeVisible();
    await expect(page.locator('svg').filter({ has: page.locator('rect') }).first()).toBeVisible();
    await page.getByRole('button', { name: '7 дн.' }).click();
    await expect(page.getByText('Табель', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Оценить' }).first().click();
    await page.getByRole('button', { name: '90%' }).click();
    await page.getByRole('button', { name: 'Поставить оценку' }).click();
    const chip = page.getByRole('button', { name: 'Оценка 90%' }).first();
    await expect(chip).toBeVisible();

    await chip.click();
    await expect(page.getByText(/Изменить оценку за/)).toBeVisible();
    await page.getByRole('button', { name: '50%' }).click();
    await expect(page.getByRole('button', { name: 'Поставить оценку' })).toBeDisabled(); // a low score needs a reason
    await page.getByLabel('Почему').fill('Слишком поздно начали');
    await page.getByRole('button', { name: 'Поставить оценку' }).click();
    await expect(page.getByRole('button', { name: 'Оценка 50%' }).first()).toBeVisible();
  });

  test('a manager higher up sees the days but does not score', async ({ page }) => {
    await page.goto(`/employees/${await employeeId('pavel@example.com')}`);
    await expect(page.getByText('Руководитель: Марина Соколова')).toBeVisible();
    await expect(page.getByText(/Смена идёт с/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Оценить' })).toHaveCount(0);
  });

  test('nobody else sees an employee page', async ({ page }) => {
    await page.goto(`/employees/${await employeeId('oleg@example.com')}`);
    await expect(page.getByText('Недостаточно прав для этого действия.').first()).toBeVisible();
  });
});
