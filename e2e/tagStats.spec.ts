import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { signIn } from './helpers.ts';

// Tags in My day: anyone has it, counted on the tasks they see (decision 58).
test('the tag summary: the most active rubrics, a tag unfolds into its people, picked tags add all and any, a CSV', async ({ page }) => {
  await signIn(page, 'pavel@example.com');
  const block = page.getByRole('region', { name: 'Статистика по тегам' });
  await block.getByRole('button', { name: '30 дн.' }).click();
  await expect(block.getByRole('row').nth(1)).toBeVisible();

  // A line unfolds into who worked under it.
  await block.getByRole('button', { name: 'Показать людей: api' }).click();
  await expect(block.getByText(/^комм\.: \d+$/).first()).toBeVisible();

  const search = block.getByPlaceholder('Выбрать теги');
  for (const tag of ['api', 'документация']) {
    await search.click();
    await page.keyboard.type(tag);
    await page.keyboard.press('Enter');
  }
  await page.keyboard.press('Escape');
  await expect(block.getByText(/^Все вместе: /)).toBeVisible();
  await expect(block.getByText(/^Любой из: /)).toBeVisible();

  const download = page.waitForEvent('download');
  await block.getByRole('button', { name: 'Выгрузить CSV' }).click();
  const file = await (await download).path();
  const text = await readFile(file, 'utf8');
  expect(text).toMatch(/^﻿Тег,Сотрудник,"?Списано, ч"?,Комментарии/);
  expect(text.split('\r\n').length).toBeGreaterThan(1);
});
