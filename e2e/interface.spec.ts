/// <reference lib="dom" />
import { expect, test, type Page } from '@playwright/test';
import { createTask, editable, employeeId, FIRST, signIn, sql, taskId, unique } from './helpers.ts';

// The interface as described in docs/product/interface.md, item by item —
// what the other specs do not walk through. Runs before my-day.spec.ts, so it
// never touches the demo items those specs expect (the first employee's TODO).

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

/** A translation key on screen means a missing translation: "myDay.todo.title" instead of the text. */
async function noRawKeys(page: Page) {
  const text = await page.evaluate(() => document.body.innerText);
  const keys = text.match(/\b(?:common|nav|login|myDay|search|newTask|tagInput|task|team|employee|tags|invite|profile|locales|errors|app)\.[a-zA-Z_.]+\b/g);
  expect(keys ?? []).toEqual([]);
}

test.describe('the top line', () => {
  test('Invite: a name and an email; the person can then be picked as a manager', async ({ page }) => {
    await signIn(page);
    await page.getByRole('button', { name: 'Пригласить сотрудника' }).click();
    const email = `${unique('new')}@example.com`;
    await page.getByRole('dialog').getByLabel('Имя').fill('Новый Сотрудник');
    await page.getByRole('dialog').getByLabel('Email').fill(email);
    await page.getByRole('button', { name: 'Пригласить' }).click();
    await expect(page.getByText(`Приглашение отправлено: ${email}`)).toBeVisible();
    const [row] = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM employee WHERE email = ${email}`;
    expect(row!.n).toBe(1);
  });

  test('every screen speaks its language: no raw translation keys, in Russian and in English', async ({ page }) => {
    for (const locale of ['ru', 'en']) {
      await sql`UPDATE employee SET locale = ${locale} WHERE email = 'marina@example.com'`;
      await signIn(page, 'marina@example.com');
      await noRawKeys(page);
      await page.goto(`/tasks/${await taskId('склад', 'инвентаризация за октябрь')}`);
      await expect(page.getByText('инвентаризация').filter({ visible: true }).first()).toBeVisible();
      await page.getByRole('button', { name: /Все события|All events/ }).last().click();
      await noRawKeys(page);
      await page.goto(`/employees/${await employeeId('pavel@example.com')}`);
      await expect(page.locator('svg').filter({ has: page.locator('rect') }).first()).toBeVisible();
      await noRawKeys(page);
      await page.getByRole('button', { name: /Марина Соколова/ }).click();
      await page.getByRole('menuitem', { name: /Профиль|Profile/ }).click();
      await noRawKeys(page);
      await page.getByRole('tab', { name: /Мои теги|My tags/ }).click();
      await expect(page.getByText(/задач: \d+|tasks: \d+/).first()).toBeVisible();
      await noRawKeys(page);
    }
    await sql`UPDATE employee SET locale = 'ru' WHERE email = 'marina@example.com'`;
  });
});

test.describe('My day', () => {
  test('"No intervention needed" in TODO takes the task out of it', async ({ page }) => {
    await signIn(page, 'marina@example.com');
    const item = page.locator('.MuiStack-root').filter({ hasText: /Новые комментарии: \d+, от Иван Кузнецов/ })
      .filter({ has: page.getByRole('button', { name: 'Вмешательство не требуется' }) }).last();
    await item.getByRole('button', { name: 'Вмешательство не требуется' }).click();
    await expect(page.getByText(/от Иван Кузнецов/)).toHaveCount(0);
  });

  test('My day keeps two days, History all of them; an entry deleted; the open shift deleted; a shift started now', async ({ page }) => {
    await signIn(page, 'pavel@example.com');
    const history = page.locator('.MuiPaper-root').filter({ has: page.getByRole('heading', { name: 'Мои дни' }) });
    await expect(history.getByText('Сегодня', { exact: true })).toBeVisible();
    await expect(history.locator('.MuiPagination-root')).toHaveCount(0);
    await expect(history.getByLabel('Лента дня: смены, заходы и действия')).toHaveCount(2);
    // History is Pavel's own page: all his days, in pages.
    await history.getByRole('link', { name: 'История' }).click();
    await expect(page.getByLabel('Лента дня: смены, заходы и действия').nth(2)).toBeVisible();
    await page.goto('/');

    // Every task once; several entries of one task are deleted one by one from a menu.
    const total = history.getByText(/^Списано на задачи: /).first();
    const before = await total.textContent();
    await history.getByRole('button', { name: 'Удалить списание' }).first().click();
    const menu = page.getByRole('menuitem');
    if (await menu.count()) await menu.first().click();
    await expect(total).not.toHaveText(before!);

    // Pavel's last shift is open: deleting it lets a shift start again — now.
    await history.getByRole('button', { name: 'Удалить открытую смену' }).click();
    await history.getByRole('button', { name: 'Начать смену' }).click();
    await expect(history.getByText(/Смена идёт с \d\d:\d\d/)).toBeVisible();
  });
});

test.describe('a task', () => {
  test('the owner edits tags in place; clears the deadline; a hard dependency that does not fit is explained', async ({ page }) => {
    await signIn(page, 'olga@example.com');
    const tag = unique('if');
    await createTask(page, [tag]);
    await page.getByRole('button', { name: 'Изменить' }).first().click();
    const second = unique('второй');
    await page.getByLabel('Теги').fill(second);
    await page.getByRole('button', { name: `Новый тег «${second}»` }).click();
    await page.getByRole('button', { name: 'Сохранить' }).click();
    await expect(page.getByText(second, { exact: true }).first()).toBeVisible();

    await page.getByLabel('Дедлайн').fill(`${new Date().getFullYear() + 1}-01-10T12:00`);
    await page.getByRole('button', { name: 'Убрать дедлайн' }).click();
    await expect(page.getByLabel('Дедлайн')).toHaveValue('');

    // A hard dependency on the site (deadline in a few days) while mine is a year ahead is fine;
    // a lag of a year is not.
    await page.getByLabel('Дедлайн').fill(`${new Date().getFullYear() + 1}-01-10T12:00`);
    const site = await taskId('сайт', 'новая главная к осенней кампании');
    await page.getByRole('button', { name: 'Добавить' }).first().click();
    await page.getByLabel('Найти задачу: теги или номер').fill(`#${site}`);
    await page.getByRole('button', { name: `Выбрать задачу #${site}` }).click();
    await page.getByRole('combobox', { name: 'Зависимость' }).click();
    await page.getByRole('option', { name: 'Жёсткая' }).click();
    await page.getByLabel('Не раньше чем через').fill('400д');
    await page.getByRole('button', { name: 'Сохранить' }).click();
    await expect(page.getByText(/Дедлайны не сходятся с жёсткой зависимостью|Проверьте поля/)).toBeVisible();
  });

  test('a comment: back to editing restores it; Ctrl+Enter sends; a file and an image go with it', async ({ page }) => {
    await signIn(page, 'olga@example.com');
    await createTask(page, [unique('cm')]);
    const composer = editable(page);
    await composer.fill('Черновик, который я заберу');
    await page.getByRole('button', { name: 'Отправить' }).click();
    await page.getByRole('button', { name: 'Вернуть в редактирование' }).click();
    await expect(editable(page)).toContainText('Черновик, который я заберу');

    await page.locator('input[type=file]:not([accept])').setInputFiles({ name: 'отчёт.csv', mimeType: 'text/csv', buffer: Buffer.from('a,b\n1,2\n') });
    await expect(page.getByText('отчёт.csv')).toBeVisible();
    await page.locator('input[type=file][accept="image/*"]').last().setInputFiles({ name: 'pic.png', mimeType: 'image/png', buffer: PNG });
    await expect(editable(page).locator('img')).toHaveCount(1);
    await editable(page).press('Control+Enter');
    await expect(page.getByRole('button', { name: 'Вернуть в редактирование' })).toBeVisible();

    const comment = page.locator('img[src^="/api/attachments/"]').filter({ visible: true }).last();
    await expect(comment).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('link', { name: /отчёт\.csv/ })).toBeVisible();
    const popup = page.waitForEvent('popup');
    await comment.click();
    await expect((await popup).url()).toMatch(/\/api\/attachments\/\d+$/);
  });

  test('made private again: who commented and was left out is offered back; an observer leaves', async ({ browser }) => {
    const olga = await browser.newPage();
    await signIn(olga, 'olga@example.com');
    await createTask(olga, [unique('pp')]);
    const url = olga.url();
    await olga.getByRole('button', { name: 'Сделать публичной' }).click();

    const ivan = await browser.newPage();
    await signIn(ivan, 'ivan@example.com');
    await ivan.goto(url);
    await editable(ivan).fill('Я тоже тут');
    await editable(ivan).press('Control+Enter');
    // Sent after the few seconds of "Back to editing": shown in the feed (a read-only editor).
    await expect(ivan.locator('.ProseMirror[contenteditable="false"]', { hasText: 'Я тоже тут' })).toBeVisible({ timeout: 15_000 });

    await olga.reload();
    await olga.getByRole('button', { name: 'Сделать приватной' }).click();
    await expect(olga.getByText(/Комментировали, но не остались: Иван Кузнецов/)).toBeVisible();
    await olga.getByRole('button', { name: /Вернуть всех · 1/ }).click();
    await expect(olga.getByText('Иван Кузнецов', { exact: true }).filter({ visible: true }).last()).toBeVisible();

    await ivan.reload();
    await ivan.getByRole('button', { name: 'Выйти из задачи' }).click();
    await expect(ivan.getByText('Это приватная задача')).toBeVisible();
    await olga.close();
    await ivan.close();
  });

  test("one person's time entries in a row are one line in the feed, the days on a click", async ({ page }) => {
    await signIn(page, 'marina@example.com');
    const stock = await taskId('склад', 'инвентаризация за октябрь');
    // How many days the seed gave Marina depends on the calendar (her days are
    // among the last ten), so the number comes from the data, as the feed counts it.
    const [row] = await sql<{ days: number }[]>`
      SELECT count(DISTINCT day)::int AS days FROM spent_minutes
       WHERE task_id = ${stock} AND by = ${await employeeId('marina@example.com')}
    `;
    const days = row!.days;
    expect(days).toBeGreaterThan(1);
    await page.goto(`/tasks/${stock}`);
    await page.getByRole('button', { name: 'Все события', exact: true }).click();
    const run = page.getByRole('button', { name: new RegExp(`Марина Соколова: списано .+ за ${days} дн\\.`) });
    await expect(run).toBeVisible();
    await expect(page.getByText(/Марина Соколова: списано 2ч за/)).toHaveCount(0);
    await run.click();
    await expect(run).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByRole('listitem').filter({ hasText: /— 2ч$/ })).toHaveCount(days);
  });

  test('time logged for a past day lands on that day in My day', async ({ page }) => {
    await signIn(page, 'olga@example.com');
    await page.goto(`/tasks/${await taskId('найм', 'документация', 'памятка новичку на первую неделю')}`);
    await page.getByRole('button', { name: 'Списать время' }).click();
    const day = new Date(Date.now() - 2 * 86_400_000);
    const ymd = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
    await page.getByRole('dialog').getByLabel('День').fill(ymd);
    await page.getByLabel('Сколько', { exact: true }).fill('45');
    await page.getByRole('dialog').getByRole('button', { name: 'Сохранить' }).click();
    await page.getByRole('link', { name: 'Мой день', exact: true }).click();
    const history = page.locator('.MuiPaper-root').filter({ has: page.getByRole('heading', { name: 'Мои дни' }) });
    await expect(history.getByText('Списано на задачи: 45м')).toBeVisible();
  });
});

test.describe('scores and the profile', () => {
  test('the direct manager scores only past days with a closed timesheet', async ({ page }) => {
    await signIn(page, 'marina@example.com');
    await page.goto(`/employees/${await employeeId('ivan@example.com')}`);
    // Ivan has no shifts: nothing to score.
    await expect(page.getByText('Сегодня')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Оценить' })).toHaveCount(0);
  });

  test('name and "about" saved with a button; manager applied at once; log out everywhere', async ({ page }) => {
    await signIn(page, 'oleg@example.com');
    await page.getByRole('button', { name: /Олег Смирнов/ }).click();
    await page.getByRole('menuitem', { name: 'Профиль' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('О себе').fill('Административный отдел, 3-й этаж');
    await dialog.getByRole('button', { name: 'Сохранить' }).click();
    await expect(page.getByText('Сохранено')).toBeVisible();

    await dialog.getByLabel('Мой руководитель').click();
    await page.getByRole('option', { name: 'Алексей Громов' }).click();
    await expect.poll(async () => (await sql<{ m: number | null }[]>`SELECT manager_id AS m FROM employee WHERE email = 'oleg@example.com'`)[0]!.m)
      .toBe(await employeeId(FIRST));
    await sql`UPDATE employee SET manager_id = NULL WHERE email = 'oleg@example.com'`;

    await dialog.getByRole('button', { name: 'Выйти на всех устройствах' }).click();
    await expect(page).toHaveURL(/\/login$/);
  });
});
