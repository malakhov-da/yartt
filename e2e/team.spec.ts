import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { employeeId, signIn } from './helpers.ts';

test.describe('Team and the employee page', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test('My team: my whole team on top, then me and my reports; a report\'s team unfolds into them and theirs; a row opens its details', async ({ page }) => {
    const team = page.locator('.MuiPaper-root').filter({ has: page.getByRole('heading', { name: 'Моя команда' }) });
    await expect(team).toBeVisible();
    for (const column of ['Сотрудник', 'В задачах', 'Оценка', 'Задачи', 'Задержка']) {
      await expect(team.getByRole('columnheader', { name: column })).toBeVisible();
    }
    await expect(team.getByRole('columnheader')).toHaveCount(5);
    const rows = team.getByRole('row');
    await expect(rows.nth(1)).toContainText('Вся моя команда · 6'); // me and everyone under me
    await expect(rows.nth(3)).toContainText('First Employee'); // then me (each line is followed by its hidden details)
    await expect(team.getByText(/^до \d+/)).toBeVisible(); // Olga is away

    // Marina is part of her team: a line of its own, folded; she and her reports show when it unfolds.
    const marinaTeam = team.getByRole('row', { name: /Команда: Марина Соколова · 4/ });
    await expect(marinaTeam).toBeVisible();
    await expect(team.getByRole('link', { name: 'Марина Соколова' })).toHaveCount(0);
    await expect(team.getByRole('row', { name: /Павел Орлов/ })).toHaveCount(0);
    await marinaTeam.getByRole('button', { name: 'Показать команду' }).click();
    await expect(team.getByRole('link', { name: 'Марина Соколова' })).toBeVisible();
    const pavel = team.getByRole('row').filter({ hasText: 'Павел Орлов' }).first();
    await expect(pavel).toBeVisible();
    // Sergey was dismissed three weeks ago (the demo data): shown for 30 days.
    await expect(team.getByText(/^Уволен \d+/)).toBeVisible();

    // Pavel writes his timesheet the next day (the demo data): the Delay column says so.
    await expect(pavel.getByRole('cell').last()).toHaveText(/^2\dч\s*табель$/);
    // The chart sign opens the details: the numbers behind the columns, with charts.
    await pavel.getByRole('button', { name: 'Подробнее и графики' }).click();
    await expect(pavel.getByRole('button', { name: 'Скрыть подробности' })).toHaveAttribute('aria-expanded', 'true');
    await expect(team.getByText(/^Табель \d+ч/)).toBeVisible();
    await expect(team.getByText(/^Запись табеля: 2\dч/)).toBeVisible();
    await expect(team.getByText(/^Бэклог \d+ч/)).toBeVisible();
    await pavel.getByRole('button', { name: /^(Подробнее и графики|Скрыть подробности)$/ }).click();

    // A team's details: its manager's score, no backlog (hours of different people are not added up).
    await marinaTeam.getByRole('button', { name: /^(Подробнее и графики|Скрыть подробности)$/ }).click();
    await expect(team.getByText('Оценка руководителя')).toBeVisible();
    await expect(team.getByText(/^Бэклог группы не считается/)).toBeVisible();
    await marinaTeam.getByRole('button', { name: /^(Подробнее и графики|Скрыть подробности)$/ }).click();

    // The team's tick picks all of it; a tick adds one more person.
    await team.getByLabel('Выбрать всю команду: Марина Соколова').check();
    await expect(pavel.getByRole('checkbox')).toBeChecked();
    await team.getByLabel('Выбрать: Ольга Белова').check();
    const picked = team.getByRole('row', { name: /Выбрано · 5/ });
    await expect(picked).toBeVisible();
    await picked.getByRole('button', { name: 'Снять выбор' }).click();
    await expect(picked).toHaveCount(0);

    // For the last 7 days Sergey is out of the table; he is Marina's to bring back, not in my list.
    await team.getByRole('button', { name: '7 дн.' }).click();
    await expect(team.getByRole('button', { name: '7 дн.' })).toHaveClass(/MuiChip-filled/);
    await expect(team.getByRole('row', { name: /Сергей Волков/ })).toHaveCount(0);
    await expect(team.getByRole('button', { name: /Мои уволенные/ })).toHaveCount(0);
    await team.getByRole('link', { name: 'Марина Соколова' }).click();
    await expect(page).toHaveURL(/\/employees\/\d+$/);
  });

  test('the direct manager brings a report back from the folded list of their dismissed, and dismisses from the details', async ({ page }) => {
    await signIn(page, 'marina@example.com');
    const team = page.locator('.MuiPaper-root').filter({ has: page.getByRole('heading', { name: 'Моя команда' }) });
    const sergey = team.getByRole('row').filter({ hasText: 'Сергей Волков' }).first();
    await team.getByRole('button', { name: 'Мои уволенные · 1' }).click();
    await team.getByRole('button', { name: 'Вернуть' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Email').fill('sergey.back@example.com');
    await dialog.getByRole('button', { name: 'Вернуть' }).click();
    await expect(sergey.getByText(/^Уволен/)).toHaveCount(0);
    await expect(team.getByRole('button', { name: /Мои уволенные/ })).toHaveCount(0);

    await sergey.getByRole('button', { name: /^(Подробнее и графики|Скрыть подробности)$/ }).click();
    page.once('dialog', (d) => void d.accept());
    await team.getByRole('button', { name: 'Уволить' }).click();
    await expect(sergey.getByText(/^Уволен/)).toBeVisible();
    await expect(team.getByRole('button', { name: 'Мои уволенные · 1' })).toBeVisible();
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
    await expect(team.getByRole('row', { name: /Вся моя команда/ })).toBeVisible();
    await team.getByRole('button', { name: 'Выгрузить' }).click();
    const [xlsxFile] = await Promise.all([page.waitForEvent('download'), page.getByRole('menuitem', { name: /Excel/ }).click()]);
    expect(xlsxFile.suggestedFilename()).toMatch(/^yartt-\d{4}-\d{2}-\d{2}-\d{4}-\d{2}-\d{2}\.xlsx$/);
    const bytes = readFileSync((await xlsxFile.path())!);
    expect(bytes.subarray(0, 2).toString()).toBe('PK'); // a ZIP, as .xlsx is

    await team.getByRole('row', { name: /Команда: Марина Соколова/ }).getByRole('button', { name: 'Показать команду' }).click();
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
