import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { employeeId, signIn } from './helpers.ts';

test.describe('Team and the employee page', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test('My team as a tree: me at the root, each team nested with its own line; ticks pick people', async ({ page }) => {
    const team = page.locator('.MuiPaper-root').filter({ has: page.getByRole('heading', { name: 'Моя команда' }) });
    await expect(team).toBeVisible();
    for (const column of ['Табель', 'В задачах', 'Оценка', 'К оценке', 'Вручную', 'Автоматически', 'Открыто', 'Запись', 'Ответ', 'Оценивает', 'Бэклог']) {
      await expect(team.getByRole('columnheader', { name: column })).toBeVisible();
    }
    const rows = team.getByRole('row');
    await expect(rows.nth(1)).toContainText('First Employee'); // me at the root
    await expect(rows.nth(2)).toContainText('Ольга Белова'); // then my direct reports (by name)
    await expect(team.getByText(/^до \d+/)).toBeVisible(); // Olga is away
    await expect(team.getByText('Уволен')).toBeVisible();

    // Marina's reports hang under her, followed by the line of her team; nobody's hours are added up.
    const marinaTeam = team.getByRole('row', { name: /^Команда: Марина Соколова/ });
    await expect(marinaTeam).toBeVisible();
    await expect(marinaTeam.getByRole('cell').nth(1)).toHaveText('—');
    await expect(team.getByRole('row', { name: /^Команда: First Employee/ })).toBeVisible();
    await team.getByLabel('С руководителями').check();
    await expect(team.getByRole('row', { name: /^Команда с руководителем: Марина Соколова/ })).toBeVisible();
    await team.getByRole('button', { name: 'Свернуть команду' }).nth(1).click();
    await expect(team.getByRole('row', { name: /Павел Орлов/ })).toHaveCount(0);
    await team.getByRole('button', { name: 'Показать команду' }).click();

    // Pavel writes his timesheet the next day (the demo data): the "Written" column says so.
    const pavelRow = team.getByRole('row').filter({ hasText: 'Павел Орлов' });
    await expect(pavelRow.getByRole('cell').nth(9)).toHaveText(/^2\dч/);

    // One click picks Marina's whole team; a tick adds one more person.
    const pavel = team.getByRole('row').filter({ hasText: 'Павел Орлов' });
    await team.getByRole('row').filter({ hasText: 'Марина Соколова' }).first().getByRole('button', { name: 'Выбрать всю команду' }).click();
    await expect(pavel.getByRole('checkbox')).toBeChecked();
    await team.getByLabel('Выбрать: Ольга Белова').check();
    const picked = team.getByRole('row', { name: /^Выбрано · \d+/ });
    await expect(picked).toBeVisible();
    await picked.getByRole('button', { name: 'Снять выбор' }).click();
    await expect(picked).toHaveCount(0);

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

    // Withdrawn: the day is open again for the employee, the reason waits for the next score.
    await page.getByRole('button', { name: 'Оценка 50%' }).first().click();
    await page.getByRole('button', { name: 'Снять оценку' }).click();
    await expect(page.getByText('Оценка снята: сотрудник может поправить табель').first()).toBeVisible();
    await page.getByRole('button', { name: 'Оценить' }).first().click();
    await expect(page.getByLabel('Почему')).toHaveValue('Слишком поздно начали');
  });

  test('payroll export: everyone or the picked, as Excel or CSV, one row per person and day', async ({ page }) => {
    const team = page.locator('.MuiPaper-root').filter({ has: page.getByRole('heading', { name: 'Моя команда' }) });
    await expect(team.getByRole('row').nth(2)).toBeVisible();
    await team.getByRole('button', { name: 'Выгрузить' }).click();
    const [xlsxFile] = await Promise.all([page.waitForEvent('download'), page.getByRole('menuitem', { name: /Excel/ }).click()]);
    expect(xlsxFile.suggestedFilename()).toMatch(/^yartt-\d{4}-\d{2}-\d{2}-\d{4}-\d{2}-\d{2}\.xlsx$/);
    const bytes = readFileSync((await xlsxFile.path())!);
    expect(bytes.subarray(0, 2).toString()).toBe('PK'); // a ZIP, as .xlsx is

    await team.getByLabel('Выбрать: Павел Орлов').check();
    await team.getByRole('button', { name: 'Выгрузить выбранных · 1' }).click();
    const [csvFile] = await Promise.all([page.waitForEvent('download'), page.getByRole('menuitem', { name: /CSV/ }).click()]);
    const text = readFileSync((await csvFile.path())!, 'utf8');
    expect(text).toContain('Сотрудник,Дата,"Табель, ч"');
    expect(text).toContain('Павел Орлов,');
    expect(text).not.toContain('Марина Соколова');
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
