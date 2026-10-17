import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { csv, xlsx } from '../client/hooks/xlsx.ts';

// The export is built in the browser by our own writer: check it is a ZIP
// any tool reads, with the parts Excel needs and the cells as given.
test('the workbook is a valid ZIP with a sheet per table, text escaped, numbers as numbers', () => {
  const file = join(mkdtempSync(join(tmpdir(), 'xlsx-')), 'export.xlsx');
  writeFileSync(file, xlsx([
    { name: 'Итоги', rows: [['Сотрудник', 'Часы'], ['Ольга <О&Б>', 7.5]] },
    { name: 'По дням', rows: [['Дата'], ['2026-10-16']] },
  ]));
  expect(execFileSync('unzip', ['-t', file]).toString()).toMatch(/No errors detected/);
  const list = execFileSync('unzip', ['-Z1', file]).toString();
  for (const part of ['[Content_Types].xml', 'xl/workbook.xml', 'xl/styles.xml', 'xl/worksheets/sheet2.xml']) expect(list).toContain(part);
  const sheet = execFileSync('unzip', ['-p', file, 'xl/worksheets/sheet1.xml']).toString();
  expect(sheet).toContain('Ольга &lt;О&amp;Б&gt;');
  expect(sheet).toContain('<c r="B2"><v>7.5</v></c>');
  expect(execFileSync('unzip', ['-p', file, 'xl/workbook.xml']).toString()).toContain('name="По дням"');
});

test('CSV quotes what needs quoting', () => {
  expect(csv([['a,b', 'say "hi"', null, 3]])).toBe('﻿"a,b","say ""hi""",,3');
});
