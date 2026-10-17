import { expect, test } from '@playwright/test';
import { editable, signIn } from './helpers.ts';

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
    // No "Done" without a reply: answer right here, then close.
    await expect(item.getByRole('button', { name: 'Готово' })).toBeDisabled();
    await item.getByRole('button', { name: 'Ответить' }).click();
    await editable(page).click();
    await page.keyboard.type('Подпишу сегодня');
    await page.getByRole('button', { name: 'Отправить' }).click();
    await expect(item.getByRole('button', { name: 'Готово' })).toBeEnabled({ timeout: 15_000 });
    await expect(item.getByText(/Мой ответ · .*«Подпишу сегодня»/)).toBeVisible(); // the answer shows inside its mention
    await item.getByRole('button', { name: 'Готово' }).click();
    await expect(todo.getByText('Нужна ваша подпись')).toHaveCount(0);
  });

  test('TODO: reply right from My day', async ({ page }) => {
    const item = page.locator('.MuiStack-root').filter({ hasText: 'Сборка #512 упала' }).filter({ has: page.getByRole('button', { name: 'Ответить' }) }).last();
    await item.getByRole('button', { name: 'Ответить' }).click();
    await expect(page.getByText(/Ответ на комментарий CI-бот/)).toBeVisible();
  });

  test('current tasks: mine and others, with pages', async ({ page }) => {
    await expect(page.getByRole('tab', { name: /Я владелец · 3/ })).toBeVisible();
    const others = page.getByRole('tab', { name: /Остальные · \d+/ });
    await others.click();
    await expect(page.getByRole('link', { name: /тикет-/ }).first()).toBeVisible();
    await page.getByRole('button', { name: 'Go to page 2' }).first().click();
    await expect(page.getByRole('link', { name: /#\d+/ }).first()).toBeVisible();
    // The tab keeps its state when coming back from a task.
    await page.getByRole('link', { name: /#\d+/ }).first().click();
    await page.getByRole('link', { name: 'Мой день', exact: true }).click(); // the logo is the way home
    await expect(page.getByRole('tab', { name: /Остальные/ })).toHaveAttribute('aria-selected', 'true');
  });

  test('history: start a shift today and close it with what was done; confirm a suggested one', async ({ page }) => {
    // Each arrival of today has its own start button; the shift starts from it.
    const first = page.getByRole('button', { name: /^Начать смену с \d\d:\d\d$/ }).first();
    const time = (await first.getAttribute('aria-label'))!.slice(-5);
    await first.click();
    await expect(page.getByText(new RegExp(`Смена идёт с ${time}`))).toBeVisible();
    await page.getByRole('button', { name: 'Закрыть', exact: true }).click();
    await page.getByLabel('Что сделано').fill('Проверка e2e');
    await page.getByRole('dialog').getByRole('button', { name: 'Закрыть', exact: true }).click();
    await expect(page.getByText('Проверка e2e')).toBeVisible();

    await page.getByRole('button', { name: 'Подтвердить' }).first().click();
    await expect(page.getByText(/Смена \d\d:\d\d–\d\d:\d\d/).first()).toBeVisible();
    await expect(page.getByRole('navigation').or(page.locator('.MuiPagination-root')).first()).toBeVisible();
  });

  test('history: time is logged to a task I opened, right from My day', async ({ page }) => {
    const history = page.locator('.MuiPaper-root').filter({ has: page.getByRole('heading', { name: 'Мои дни' }) });
    const entries = history.getByRole('button', { name: 'Удалить списание' });
    await expect(history.getByRole('button', { name: 'Списать время' }).first()).toBeVisible();
    await page.waitForLoadState('networkidle');
    const before = await entries.count();
    await history.getByRole('button', { name: 'Списать время' }).first().click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: '30м' }).click();
    await dialog.getByRole('button', { name: 'Сохранить' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(entries).toHaveCount(before + 1);
  });

  test('history: a shift is added to a past day, corrected and deleted while the day is not scored', async ({ page }) => {
    const history = page.locator('.MuiPaper-root').filter({ has: page.getByRole('heading', { name: 'Мои дни' }) });
    await expect(history.getByRole('button', { name: 'Добавить смену' }).nth(1)).toBeVisible();
    await page.waitForLoadState('networkidle');
    const edits = history.getByRole('button', { name: 'Поправить смену' });
    const before = await edits.count();
    await history.getByRole('button', { name: 'Добавить смену' }).nth(1).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Что сделано').fill('Забытая смена');
    await dialog.getByRole('button', { name: 'Сохранить' }).click();
    await expect(history.getByText('Забытая смена')).toBeVisible();
    await expect(edits).toHaveCount(before + 1);

    const row = history.locator('.MuiStack-root').filter({ hasText: 'Забытая смена' }).filter({ has: page.getByRole('button', { name: 'Поправить смену' }) }).last();
    await row.getByRole('button', { name: 'Поправить смену' }).click();
    await dialog.getByLabel('Что сделано').fill('Забытая смена, поправлено');
    await dialog.getByRole('button', { name: 'Сохранить' }).click();
    await expect(history.getByText('Забытая смена, поправлено')).toBeVisible();
    await row.getByRole('button', { name: 'Удалить смену' }).click();
    await expect(history.getByText('Забытая смена, поправлено')).toHaveCount(0);
  });

  test('history: activity after a written shift is offered as the shift that was not written down', async ({ page }) => {
    await signIn(page, 'pavel@example.com');
    const history = page.locator('.MuiPaper-root').filter({ has: page.getByRole('heading', { name: 'Мои дни' }) });
    const hint = history.getByText('Похоже на смену 20:10–21:05');
    for (let page2 = 2; page2 <= 3; page2++) {
      await page.waitForLoadState('networkidle');
      if (await hint.isVisible()) break;
      await history.getByRole('button', { name: `Go to page ${page2}` }).click();
    }
    const row = history.locator('.MuiStack-root').filter({ hasText: 'Похоже на смену 20:10–21:05' }).last();
    await row.getByRole('button', { name: 'Подтвердить' }).click();
    await expect(history.getByText(/Смена 20:10–21:05/)).toBeVisible();
  });
});
