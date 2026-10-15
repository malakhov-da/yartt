import { expect, test, type Page } from '@playwright/test';
import { createTask, editable, signIn, taskId, unique } from './helpers.ts';

// One task goes through everything its owner and observers do.
test.describe.serial('a task from creation to hand-over', () => {
  let page: Page;
  const tag = unique('e2e');

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await signIn(page);
    await createTask(page, [tag, 'проверка']);
  });
  test.afterAll(async () => {
    await page.close();
  });

  test('a new task is private, owned by its creator', async () => {
    await expect(page.getByText('Приватная')).toBeVisible();
    await expect(page.getByText('First Employee').filter({ visible: true }).first()).toBeVisible();
    await expect(page.getByText('Владелец ещё не описал задачу.')).toBeVisible();
  });

  test('the owner edits priority, deadline and context in place', async () => {
    await page.getByRole('combobox').filter({ hasText: 'Обычный' }).click();
    await page.getByRole('option', { name: 'Высокий' }).click();
    await expect(page.getByRole('combobox').filter({ hasText: 'Высокий' })).toBeVisible();

    await page.getByLabel('Дедлайн').fill(`${new Date().getFullYear() + 1}-03-15T18:00`);
    await expect(page.getByText(/через \d+ (день|дня|дней|месяц|месяца|месяцев)/)).toBeVisible();
    await expect(page.getByText(/Дедлайн: 15 мар\./)).toBeVisible(); // the move is an event in the feed

    await page.getByRole('button', { name: 'Изменить' }).nth(1).click();
    await editable(page).first().fill('Проверить всё от начала до конца.');
    await page.getByRole('button', { name: 'Сохранить' }).first().click();
    await expect(page.getByText('Проверить всё от начала до конца.')).toBeVisible();
  });

  test('a comment waits a few seconds with "Back to editing", then appears; c focuses the composer', async () => {
    await page.locator('body').press('c');
    const composer = editable(page);
    await expect(composer).toBeFocused();
    await composer.fill('Первый комментарий');
    await page.getByRole('button', { name: 'Отправить' }).click();
    await expect(page.getByRole('button', { name: 'Вернуть в редактирование' })).toBeVisible();
    await expect(page.getByText('Первый комментарий').last()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('button', { name: 'Вернуть в редактирование' })).toHaveCount(0, { timeout: 15_000 });
  });

  test('a mention makes the person an observer; a reply quotes its parent', async () => {
    await page.getByRole('button', { name: 'Упомянуть сотрудника' }).click();
    await page.keyboard.type('Павел');
    await page.getByRole('option', { name: 'Павел Орлов' }).click();
    await editable(page).fill('Павел, посмотри');
    await page.getByRole('button', { name: 'Отправить' }).click();
    await expect(page.getByText('@Павел Орлов · открыто')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/Упомянут — остаётся/)).toBeVisible(); // he observes now, and says why

    await page.getByRole('button', { name: 'Ответить' }).first().click();
    await expect(page.getByText(/Ответ на комментарий/)).toBeVisible();
    await page.getByRole('button', { name: /Отменить ответ/ }).click();
    await expect(page.getByText(/Ответ на комментарий/)).toHaveCount(0);
  });

  test('my time: logged and planned; both show in the feed as events', async () => {
    await page.getByRole('button', { name: 'Списать время' }).click();
    await page.getByLabel('Сколько', { exact: true }).fill('1ч 30м');
    await page.getByRole('dialog').getByRole('button', { name: 'Сохранить' }).click();
    await expect(page.getByText('Потратил 1ч 30м')).toBeVisible();

    await page.getByRole('button', { name: 'Мой план' }).click();
    await page.getByLabel('Сколько ещё планирую потратить').fill('2ч');
    await page.getByRole('dialog').getByRole('button', { name: 'Сохранить' }).click();
    await expect(page.getByText('В плане ещё 2ч').filter({ visible: true }).first()).toBeVisible();

    await page.getByRole('button', { name: 'Все события', exact: true }).click();
    await expect(page.getByText(/First Employee: списано 1ч 30м/)).toBeVisible();
    await expect(page.getByText(/First Employee: в плане ещё 2ч/)).toBeVisible();
  });

  test('observers: add, hide, public and private again', async () => {
    await page.getByPlaceholder('Добавить наблюдателя').click();
    await page.keyboard.type('Иван');
    await page.getByRole('option', { name: 'Иван Кузнецов' }).click();
    await expect(page.getByPlaceholder('Добавить наблюдателя')).toHaveValue('');
    const ivan = page.getByText('Иван Кузнецов', { exact: true }).last();
    await expect(ivan).toBeVisible();
    await ivan.hover(); // "Hide" shows on hover
    await page.getByRole('button', { name: 'Скрыть' }).click();
    await expect(page.getByText(/больше не наблюдает/)).toBeVisible();

    await page.getByRole('button', { name: 'Сделать публичной' }).click();
    await expect(page.getByText('Публичная — видят все')).toBeVisible();
    await page.getByRole('button', { name: 'Сделать приватной' }).click();
    await expect(page.getByText('Приватная')).toBeVisible();
    // Pavel has an open mention: he stays, and says why.
    await expect(page.getByText(/Упомянут — остаётся/)).toBeVisible();
  });

  test('a hard dependency on another task; its hint explains the tie', async () => {
    const site = await taskId('сайт', 'редизайн', 'главная');
    await page.getByRole('button', { name: 'Добавить' }).click();
    await page.getByLabel('Задача').fill(String(site));
    await page.getByRole('button', { name: 'Сохранить' }).click();
    await expect(page.getByRole('link', { name: new RegExp(`#${site}`) })).toBeVisible();
    await page.getByRole('button', { name: 'Убрать зависимость' }).click();
    await expect(page.getByRole('link', { name: new RegExp(`#${site}`) })).toHaveCount(0);
  });

  test('a reminder for myself', async () => {
    await page.getByRole('button', { name: 'Напомнить' }).click();
    await page.getByRole('button', { name: 'Через час' }).click();
    await page.getByLabel('О чём напомнить').fill('Глянуть ещё раз');
    await page.getByRole('dialog').getByRole('button', { name: 'Сохранить' }).click();
    await expect(page.getByText('Глянуть ещё раз')).toBeVisible();
    await page.getByRole('button', { name: 'Удалить напоминание' }).click();
    await expect(page.getByText('Глянуть ещё раз')).toHaveCount(0);
  });

  test('finish closes it; the hand-over leaves me an observer', async () => {
    await page.getByRole('button', { name: 'Завершить' }).click();
    await expect(page.getByText('Закрыта')).toBeVisible();

    await page.getByRole('button', { name: 'Передать' }).click();
    await page.getByLabel('Новый владелец').click();
    await page.keyboard.type('Марина');
    await page.getByRole('option', { name: 'Марина Соколова' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Передать' }).click();
    // Marina owns it now; I observe as her manager — no owner's buttons, and I cannot leave.
    await expect(page.getByRole('button', { name: 'Завершить' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Сделать публичной' })).toHaveCount(0);
    await expect(page.getByText('Марина Соколова').filter({ visible: true }).first()).toBeVisible();
  });
});

test('someone without access sees the header and asks for it', async ({ page }) => {
  await signIn(page, 'ivan@example.com');
  const report = await taskId('отчёт', 'Q3');
  await page.goto(`/tasks/${report}`);
  await expect(page.getByText('Это приватная задача')).toBeVisible();
  await page.getByRole('button', { name: 'Запросить доступ' }).click();
  await expect(page.getByText('Заявка у владельца')).toBeVisible();
  await page.getByRole('button', { name: 'Отозвать заявку' }).click();
  await expect(page.getByRole('button', { name: 'Запросить доступ' })).toBeVisible();
});
