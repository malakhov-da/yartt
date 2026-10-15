import { expect, test } from '@playwright/test';
import { signIn } from './helpers.ts';

// My day of the first employee over the demo data (scripts/seed.ts).
test.describe('My day', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test('TODO: an access request is answered, a mention is closed', async ({ page }) => {
    const todo = page.locator('div.MuiPaper-root').filter({ has: page.getByRole('heading', { name: /Ждёт меня/ }) }).first();
    await expect(todo.getByText('Олег Смирнов просит доступ')).toBeVisible();
    await expect(todo.getByText('Марина Соколова упомянула вас')).toBeVisible(); // her pronoun
    await expect(todo.getByText('CI-бот упомянул(а) вас')).toBeVisible(); // a bot: no pronoun
    await expect(todo.getByText(/Новые комментарии: \d+, от Павел Орлов/)).toBeVisible();

    await todo.getByRole('button', { name: 'Принять' }).click();
    await expect(todo.getByText('Олег Смирнов просит доступ')).toHaveCount(0);

    const mention = todo.locator('div').filter({ hasText: /^Марина Соколова упомянула вас/ }).first();
    await expect(mention).toBeVisible();
    const item = todo.locator('.MuiStack-root').filter({ hasText: 'Нужна ваша подпись' }).filter({ has: page.getByRole('button', { name: 'Готово' }) }).last();
    await item.getByRole('button', { name: 'Готово' }).click();
    await expect(todo.getByText('Нужна ваша подпись')).toHaveCount(0);
  });

  test('TODO: reply right from My day', async ({ page }) => {
    const item = page.locator('.MuiStack-root').filter({ hasText: 'Сборка #512 упала' }).filter({ has: page.getByRole('button', { name: 'Ответить' }) }).last();
    await item.getByRole('button', { name: 'Ответить' }).click();
    await expect(page.getByText(/Ответ на комментарий CI-бот/)).toBeVisible();
  });

  test('current tasks: mine and others, with pages', async ({ page }) => {
    await expect(page.getByRole('tab', { name: /Мои · 3/ })).toBeVisible();
    const others = page.getByRole('tab', { name: /Остальные · \d+/ });
    await others.click();
    await expect(page.getByRole('link', { name: /тикет-/ }).first()).toBeVisible();
    await page.getByRole('button', { name: 'Go to page 2' }).first().click();
    await expect(page.getByRole('link', { name: /#\d+/ }).first()).toBeVisible();
    // The tab keeps its state when coming back from a task.
    await page.getByRole('link', { name: /#\d+/ }).first().click();
    await page.getByRole('link', { name: 'яртт' }).click(); // the logo is the way home
    await expect(page.getByRole('tab', { name: /Остальные/ })).toHaveAttribute('aria-selected', 'true');
  });

  test('history: start a shift today and close it with what was done; confirm a suggested one', async ({ page }) => {
    await page.getByRole('button', { name: /Начать смену с/ }).click();
    await expect(page.getByText(/Смена идёт с/)).toBeVisible();
    await page.getByRole('button', { name: 'Закрыть смену' }).click();
    await page.getByLabel('Что сделано').fill('Проверка e2e');
    await page.getByRole('dialog').getByRole('button', { name: 'Закрыть смену' }).click();
    await expect(page.getByText('Проверка e2e')).toBeVisible();

    await page.getByRole('button', { name: 'Подтвердить' }).first().click();
    await expect(page.getByText(/Смена \d\d:\d\d–\d\d:\d\d/).first()).toBeVisible();
    await expect(page.getByRole('navigation').or(page.locator('.MuiPagination-root')).first()).toBeVisible();
  });
});
