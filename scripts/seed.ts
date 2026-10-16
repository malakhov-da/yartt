// Fills a development database with demo data that touches every screen:
// an org chart (managers, an absent and a dismissed employee, an invite,
// pronouns and a bot without one),
// tasks private and public, open and closed, handed over and ownerless,
// with comments, replies, mentions, attached tasks and files, access
// requests, a dependency, reminders, avatars, personal tag colors and
// weights, time left and logged, shifts (closed, open,
// suggested), visits and scores (one of them corrected).
//
//   npm run seed            — into a database with no data but the first employee
//   npm run seed -- --reset — drops everything in the database first
//
// Data goes through the API procedures wherever one exists, so the triggers
// and checks run as in real use. Moments are relative to today, so the
// demo looks fresh whenever it is seeded.
import { deflateSync, crc32 } from 'node:zlib';
import { z } from 'zod';
import { bootstrap } from '../server/bootstrap.ts';
import type { Context } from '../server/ctx.ts';
import env from '../server/env.ts';
import { migrate } from '../server/migrate.ts';
import { sql } from '../server/pg.ts';
import * as Attachments from '../server/services/Attachment.ts';
import { createCallerFactory } from '../server/trpc.ts';
import trpc from '../server/trpc/index.ts';

const createCaller = createCallerFactory(trpc);
const as = (employeeId: number) => {
  const ctx: Context = { employeeId, sessionToken: null, setSessionCookie: () => {}, clearSessionCookie: () => {} };
  return createCaller(ctx);
};

const Row = z.object({ id: z.number() });
const Moment = z.object({ value: z.date() });
const Text = z.object({ value: z.string() });
const Count = z.object({ n: z.number() });

// --- the database --------------------------------------------------------

if (process.argv.includes('--reset')) {
  await sql.unsafe('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  console.log('Dropped everything in the database');
}
await migrate(sql);
await bootstrap(sql);

const [count] = Count.array().parse(await sql`SELECT count(*)::int AS n FROM employee`);
const [tasks] = Count.array().parse(await sql`SELECT count(*)::int AS n FROM task`);
if ((count?.n ?? 0) > 1 || (tasks?.n ?? 0) > 0) {
  console.error('The database already has data. Run `npm run seed -- --reset` to start over.');
  await sql.end();
  process.exit(1);
}

// --- helpers ---------------------------------------------------------------

/** A moment `daysAgo` days back at local time `hm` in the employee's time zone. */
async function at(employeeId: number, daysAgo: number, hm: string): Promise<Date> {
  const [row] = Moment.array().parse(await sql`
    SELECT ((local_today(${employeeId}) - ${daysAgo}::int) + ${hm}::time)
             AT TIME ZONE (SELECT time_zone FROM employee WHERE id = ${employeeId}) AS value
  `);
  return row!.value;
}

/** The employee's local day `daysAgo` days back, YYYY-MM-DD. */
async function day(employeeId: number, daysAgo: number): Promise<string> {
  const [row] = Text.array().parse(await sql`SELECT (local_today(${employeeId}) - ${daysAgo}::int)::text AS value`);
  return row!.value;
}

/** Visits cannot be logged in the past through the API (log_visit uses NOW()). */
async function visit(employeeId: number, taskId: number | null, moment: Date): Promise<void> {
  await sql`INSERT INTO visit (employee_id, task_id, at) VALUES (${employeeId}, ${taskId}, ${moment})`;
}

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000);
const daysAhead = (days: number) => new Date(Date.now() + days * 86_400_000);

const comment = (taskId: number, html: string, extra: { mentionIds?: number[]; taskIds?: number[]; replyToId?: number; files?: { id: number; name: string }[] } = {}) => ({
  taskId,
  html,
  replyToId: extra.replyToId ?? null,
  files: extra.files ?? [],
  mentionIds: extra.mentionIds ?? [],
  taskIds: extra.taskIds ?? [],
});

/** A small PNG: a gradient from `base` (RGB), made without dependencies. */
function png(width: number, height: number, base: [number, number, number] = [40, 110, 220]): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 2, 0, 0, 0], 8); // 8-bit RGB
  const rows: number[] = [];
  for (let y = 0; y < height; y++) {
    rows.push(0);
    for (let x = 0; x < width; x++) {
      rows.push(...base.map((c, i) => Math.max(0, Math.min(255, c + [(x * 180) / width, (y * 100) / height, -(x * 120) / width][i]!))));
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.from(rows))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Working days among the last `n` calendar days, oldest first (Saturdays and Sundays skipped). */
async function workdays(employeeId: number, n: number): Promise<number[]> {
  const result: number[] = [];
  for (let daysAgo = n; daysAgo >= 1; daysAgo--) {
    const weekday = new Date(`${await day(employeeId, daysAgo)}T12:00:00Z`).getUTCDay();
    if (weekday !== 0 && weekday !== 6) result.push(daysAgo);
  }
  return result;
}

// --- people --------------------------------------------------------------

const [first] = Row.array().parse(await sql`SELECT id FROM employee ORDER BY id LIMIT 1`);
const me = first!.id;
const I = as(me);
await I.Employee.updateProfile({
  fullName: env.FIRST_EMPLOYEE_NAME ?? 'First Employee',
  email: env.FIRST_EMPLOYEE_EMAIL ?? 'first@example.com',
  about: 'Директор. Пишите в задачах, срочное — звоните.',
});

const invite = async (by: number, email: string, fullName: string) => (await as(by).Employee.invite({ email, fullName })).id;

const marina = await invite(me, 'marina@example.com', 'Марина Соколова');
await as(marina).Employee.setManager({ managerId: me });
await as(marina).Employee.updateProfile({ fullName: 'Марина Соколова', email: 'marina@example.com', about: 'Руководитель разработки' });

const pavel = await invite(marina, 'pavel@example.com', 'Павел Орлов');
await as(pavel).Employee.setManager({ managerId: marina });
await as(pavel).Employee.updateProfile({ fullName: 'Павел Орлов', email: 'pavel@example.com', about: 'Фронтенд. Telegram: @pavel' });

const ivan = await invite(marina, 'ivan@example.com', 'Иван Кузнецов');
await as(ivan).Employee.setManager({ managerId: marina });

const olga = await invite(me, 'olga@example.com', 'Ольга Белова');
await as(olga).Employee.setManager({ managerId: me });
await as(olga).Employee.updateSettings({ nextDay: await day(olga, -5) }); // on vacation: back in 5 days

const oleg = await invite(me, 'oleg@example.com', 'Олег Смирнов'); // no manager: another department
await as(oleg).Employee.updateProfile({ fullName: 'Олег Смирнов', email: 'oleg@example.com', about: 'Административный отдел' });

const sergey = await invite(marina, 'sergey@example.com', 'Сергей Волков');
await as(sergey).Employee.setManager({ managerId: marina });

await invite(olga, 'anna@example.com', 'Анна Петрова'); // invited, never signed in

// A team bot: no pronoun, so verbs about it keep both endings ("упомянул(а)").
const bot = await invite(me, 'ci-bot@example.com', 'CI-бот');

// Pronouns pick verb forms ("упомянула"); the first employee keeps none.
for (const [id, pronoun] of [[marina, 'she'], [pavel, 'he'], [ivan, 'he'], [olga, 'she'], [oleg, 'he'], [sergey, 'he']] as const) {
  await as(id).Employee.updateSettings({ pronoun });
}

// --- tasks ---------------------------------------------------------------

const P = as(pavel), M = as(marina), V = as(ivan), O = as(oleg), L = as(olga), S = as(sergey);

// 1. My task with a context, observers, a file and an image; new comments wait for my review.
const site = await I.Task.create({ tags: ['сайт', 'редизайн', 'главная'] });
await I.Task.update({
  id: site,
  priority: 'HIGH',
  context: '<p>Новая главная к запуску осенней кампании.</p><ul><li>блок с ценами</li><li>отзывы клиентов</li><li>форма заявки</li></ul><p>Готово, когда страница на проде и форма пишет в CRM.</p>',
});
await I.Task.setDeadline({ id: site, deadline: daysAhead(3) });
await I.Observer.add({ taskId: site, employeeId: pavel });
await I.Time.setLeft({ taskId: site, minutes: 240 });
await P.Time.setLeft({ taskId: site, minutes: 600 });
// Plans made three weeks ago; Pavel's has grown since: My team shows his backlog rising.
await sql`UPDATE estimate_minutes SET entered_at = NOW() - INTERVAL '21 days' WHERE task_id = ${site}`;
await sql`UPDATE estimate_minutes SET expired_at = NOW() - INTERVAL '5 days' WHERE task_id = ${site} AND "by" = ${pavel}`;
await sql`INSERT INTO estimate_minutes (task_id, "by", value, entered_at) VALUES (${site}, ${pavel}, 900, NOW() - INTERVAL '5 days')`;

// 2. My task; Oleg asks for access.
const report = await I.Task.create({ tags: ['отчёт', 'q3'] });
await I.Task.setDeadline({ id: report, deadline: daysAhead(10) });
await I.Task.update({ id: report, context: '<p>Квартальный отчёт для совета директоров: выручка, найм, ключевые проекты.</p>' });
await O.Observer.request({ taskId: report });

// 3. Marina's task (I see it as her manager); she mentions me.
const stock = await M.Task.create({ tags: ['склад', 'инвентаризация'] });
await M.Task.update({ id: stock, priority: 'CRITICAL' });
await M.Task.setDeadline({ id: stock, deadline: daysAhead(1) });
await M.Observer.add({ taskId: stock, employeeId: ivan });

// 4. Oleg's public task: everyone sees it in "others".
const move = await O.Task.create({ tags: ['офис', 'переезд'] });
await O.Task.update({ id: move, context: '<p>Переезд на 5-й этаж. Упакуйте личные вещи до пятницы, технику перевезут ИТ.</p>' });
await O.Task.setDeadline({ id: move, deadline: daysAhead(14) });
await O.Task.makePublic({ id: move });

// 5. My task, already reviewed: not in TODO.
const hiring = await I.Task.create({ tags: ['найм', 'бэкенд'] });
await I.Observer.add({ taskId: hiring, employeeId: olga });

// 6. My task, finished: its deadline moved twice and then "Finish".
const budget = await I.Task.create({ tags: ['бюджет', '2026'] });
await I.Task.setDeadline({ id: budget, deadline: daysAhead(2) });
await I.Task.setDeadline({ id: budget, deadline: daysAhead(4) });
await I.Task.setDeadline({ id: budget, deadline: new Date() });

// 7. Pavel's task hard-depends on the site: a day after it (I am told).
const auth = await P.Task.create({ tags: ['api', 'авторизация'] });
await P.Task.update({ id: auth, priority: 'HIGH' });
await P.Task.setDeadline({ id: auth, deadline: daysAhead(7) });
await P.Dependency.set({ taskId: auth, value: site, minMinutesAfter: 1440 });

// 8. Sergey's task goes to Marina when he is dismissed.
const laptops = await S.Task.create({ tags: ['закупки', 'ноутбуки'] });
await S.Task.setDeadline({ id: laptops, deadline: daysAhead(5) });
await S.Comment.create(comment(laptops, '<p>Счёт от поставщика запросил, жду до среды.</p>'));

// 9. Ivan's support tickets: enough for pages in "others".
const tickets: number[] = [];
for (let n = 1; n <= 22; n++) {
  const id = await V.Task.create({ tags: ['поддержка', `тикет-${1040 + n}`] });
  if (n % 4 !== 0) await V.Task.setDeadline({ id, deadline: daysAhead(n % 9 + 1) });
  if (n % 5 === 0) await V.Task.update({ id, priority: 'HIGH' });
  if (n % 7 === 0) await V.Task.update({ id, priority: 'LOW' });
  tickets.push(id);
}

// 10. Handed over by the manager: Marina gives Pavel's task to Ivan (Pavel is told).
const apiDocs = await P.Task.create({ tags: ['api', 'документация'] });
await M.Task.transfer({ id: apiDocs, ownerId: ivan });

// 11. An ownerless task (an owner without a manager left; only SQL can make one now).
const printer = await O.Task.create({ tags: ['принтер', '3-й этаж'] });
await O.Observer.add({ taskId: printer, employeeId: me });
await O.Comment.create(comment(printer, '<p>Принтер снова жуёт бумагу. Кто возьмётся?</p>'));
await sql`UPDATE task SET owner_id = NULL WHERE id = ${printer}`;

// 12. For the team summary: Marina closed a task by hand; Pavel's closed automatically
// (set a week ahead, reached three days ago — only SQL can move time).
const vendor = await M.Task.create({ tags: ['поставщик', 'договор'] });
await M.Task.setDeadline({ id: vendor, deadline: daysAhead(2) });
await M.Task.setDeadline({ id: vendor, deadline: new Date() });
const promo = await P.Task.create({ tags: ['лендинг', 'промо'] });
await P.Task.setDeadline({ id: promo, deadline: daysAhead(7) });
await sql`UPDATE finished_at SET value = NOW() - INTERVAL '3 days', entered_at = NOW() - INTERVAL '10 days' WHERE task_id = ${promo}`;

// 13. Olga's private task (I see it as her manager).
const docs = await L.Task.create({ tags: ['onboarding', 'документация'] });
await L.Task.update({ id: docs, priority: 'LOW', context: '<p>Собрать в одном месте всё, что нужно новичку в первую неделю.</p>' });

// --- comments ------------------------------------------------------------

const image = await Attachments.upload(pavel, png(480, 200), 'image/png');
const file = await Attachments.upload(pavel, Buffer.from('Блок,Ширина,Статус\nЦены,1200,готов\nОтзывы,1200,в работе\n'), 'text/csv');
const mockup = await P.Comment.create(comment(site,
  `<p>Макеты главной готовы, посмотрите блок с ценами:</p><p><img src="/api/attachments/${image}" alt="макет"></p><p>Таблица блоков во вложении.</p>`,
  { files: [{ id: file, name: 'блоки-главной.csv' }] },
));
await I.Comment.create(comment(site, '<p>Цены ок. Отзывы давайте каруселью.</p>', { replyToId: mockup }));
await P.Comment.create(comment(site, '<p>Карусель сделал, на стенде. Для формы нужен доступ к CRM — Марина, поможешь?</p>', { mentionIds: [marina] }));
await P.Comment.create(comment(auth, '<p>Начну, как только главная уедет на прод: форма заявки ходит через новый API.</p>', { taskIds: [site] }));

await M.Comment.create(comment(stock, '<p>Нужна ваша подпись на акте инвентаризации до завтра, иначе склад не закроем.</p>', { mentionIds: [me] }));
const recount = await M.Comment.create(comment(stock, '<p>Иван, пересчитай, пожалуйста, стеллаж B.</p>', { mentionIds: [ivan] }));
await V.Comment.create(comment(stock, '<p>Пересчитал, расхождений нет.</p>', { replyToId: recount }));
await V.Comment.closeMention({ taskId: stock, commentId: recount });

await O.Comment.create(comment(move, '<p>Схема рассадки на 5-м этаже будет к среде.</p>'));
await P.Comment.create(comment(move, '<p>А мониторы перевозим сами или ИТ?</p>'));

await L.Comment.create(comment(hiring, '<p>Три кандидата прошли техинтервью, резюме в почте.</p>'));
await I.Comment.create(comment(hiring, '<p>Спасибо, посмотрю на неделе.</p>'));
await I.Task.markReviewed({ id: hiring });

await V.Comment.create(comment(tickets[0]!, '<p>Клиент подтвердил, что всё работает.</p>'));

// The bot reports a failed build and mentions the owner: it shows in my TODO with neutral verbs.
await I.Observer.add({ taskId: site, employeeId: bot });
await as(bot).Comment.create(comment(site, '<p>Сборка #512 упала на этапе e2e: форма заявки не отвечает.</p>', { mentionIds: [me] }));

await M.Employee.dismiss({ id: sergey });

// --- days: visits, time logged, shifts ----------------------------------

// Me: shifts on most days; two days left without one — they show a suggested shift.
const myDays = await workdays(me, 14);
for (const [i, d] of myDays.entries()) {
  await visit(me, null, await at(me, d, `09:0${i % 6}`));
  await visit(me, site, await at(me, d, '10:15'));
  await visit(me, report, await at(me, d, '14:40'));
  if (i % 3 === 0) await visit(me, stock, await at(me, d, '16:05'));
  await visit(me, null, await at(me, d, `18:1${i % 6}`));
  await I.Time.log({ taskId: site, day: await day(me, d), minutes: 90 + (i % 4) * 30 });
  await I.Time.log({ taskId: report, day: await day(me, d), minutes: 60 + (i % 3) * 15 });
  if (i % 4 === 0) await I.Time.log({ taskId: hiring, day: await day(me, d), minutes: 45 });
  if (i === myDays.length - 1 || i === myDays.length - 4) continue;
  await I.Work.add({
    startedAt: await at(me, d, '09:00'),
    endedAt: await at(me, d, `18:${10 + (i % 5) * 5}`),
    about: ['Планёрка, отчёт, ревью макетов', 'Встречи с кандидатами', 'Бюджет на 2026', 'Созвон с подрядчиком, отчёт'][i % 4]!,
  });
}
// Today: came in, opened a task, logged time — the shift is not started yet.
await visit(me, null, minutesAgo(95));
await visit(me, site, minutesAgo(70));
await I.Time.log({ taskId: report, day: await day(me, 0), minutes: 45 });

// Pavel: closed shifts, and the last workday's shift is still open.
const pavelDays = await workdays(pavel, 10);
for (const [i, d] of pavelDays.entries()) {
  await visit(pavel, null, await at(pavel, d, '09:20'));
  await visit(pavel, site, await at(pavel, d, '09:25'));
  await visit(pavel, auth, await at(pavel, d, '15:00'));
  await P.Time.log({ taskId: site, day: await day(pavel, d), minutes: 300 + (i % 3) * 30 });
  await P.Time.log({ taskId: auth, day: await day(pavel, d), minutes: 90 });
  if (i === pavelDays.length - 1) await P.Work.start({ startedAt: await at(pavel, d, '09:20') });
  else await P.Work.add({ startedAt: await at(pavel, d, '09:20'), endedAt: await at(pavel, d, '18:30'), about: 'Главная, API' });
}

// Marina: closed shifts.
const marinaDays = await workdays(marina, 10);
for (const d of marinaDays) {
  await visit(marina, null, await at(marina, d, '08:50'));
  await visit(marina, stock, await at(marina, d, '11:00'));
  await M.Time.log({ taskId: stock, day: await day(marina, d), minutes: 120 });
  await M.Work.add({ startedAt: await at(marina, d, '08:50'), endedAt: await at(marina, d, '17:45'), about: 'Склад, найм, ревью' });
}

// The shifts above were written now, days after they ended. Make them look written on time —
// minutes after the end — except Pavel's, written the next day: My team shows how late
// the timesheet is written. The trigger stamps updated_at itself, so it is off for this.
await sql`ALTER TABLE work DISABLE TRIGGER work_check`;
await sql`
  UPDATE work SET updated_at = started_at + spent_minutes * INTERVAL '1 minute'
                              + CASE WHEN employee_id = ${pavel} THEN INTERVAL '1 day 2 hours' ELSE INTERVAL '12 minutes' END
   WHERE spent_minutes IS NOT NULL
`;
await sql`ALTER TABLE work ENABLE TRIGGER work_check`;

// Scores: I score some of Marina's days, Marina some of Pavel's; the rest wait. A score freezes its day.
const score = async (employeeId: number, by: number, daysAgo: number, value: number, reason: string | null) =>
  as(by).Team.score({ employeeId, day: await day(employeeId, daysAgo), value, reason });
await score(marina, me, marinaDays[0]!, 90, null);
await score(marina, me, marinaDays[1]!, 70, 'Инвентаризацию стоило начать раньше, а не в последний день.');
await score(marina, me, marinaDays[3]!, 100, null);
await score(pavel, marina, pavelDays[0]!, 95, 'Отличные макеты.');
await score(pavel, marina, pavelDays[1]!, 80, null);
await score(pavel, marina, pavelDays[2]!, 50, 'Ушёл в рефакторинг вместо формы заявки, а релиз завтра.');
// A correction: Pavel's mail keeps both versions, the interface shows only 65%.
await score(pavel, marina, pavelDays[2]!, 65, 'Рефакторинг был нужен для формы — но предупредить стоило заранее.');

// --- personal touches --------------------------------------------------

// Avatars (the HTTP endpoint is for browsers; the bytes are the same): Marina and Pavel have photos.
for (const [id, base] of [[marina, [200, 60, 140]], [pavel, [30, 120, 90]]] as const) {
  await sql`INSERT INTO avatar (employee_id, value, mime) VALUES (${id}, ${png(64, 64, [...base])}, 'image/png')`;
}

// My tag colors and weights: "сайт" and "отчёт" first and colored, "поддержка" sinks.
const tagId = async (name: string) => Row.array().parse(await sql`SELECT id FROM tag WHERE name = ${name}`)[0]!.id;
await I.Tags.set({ tagId: await tagId('сайт'), color: '#1e88e5', weight: 3 });
await I.Tags.set({ tagId: await tagId('отчёт'), color: '#43a047', weight: 2 });
await I.Tags.set({ tagId: await tagId('склад'), color: '#fb8c00', weight: 0 });
await I.Tags.set({ tagId: await tagId('поддержка'), color: null, weight: -1 });

// My reminders on the site: tomorrow morning and before the deadline.
await I.Remind.add({ taskId: site, at: await at(me, -1, '09:30'), text: 'Проверить форму заявки на стенде' });
await I.Remind.add({ taskId: site, at: daysAhead(2), text: null });

// --- summary -------------------------------------------------------------

const people = z.object({ fullName: z.string(), email: z.string().nullable() }).array().parse(await sql`
  SELECT full_name, email FROM employee ORDER BY id
`);
console.log('\nSeeded. Employees:');
for (const p of people) console.log(`  ${p.fullName.padEnd(18)} ${p.email ?? '(dismissed)'}`);
const [token] = Text.array().parse(await sql`SELECT issue_token(${env.FIRST_EMPLOYEE_EMAIL ?? 'first@example.com'}) AS value`);
console.log(`\nSign in as ${people[0]!.fullName} within 10 minutes: ${env.PUBLIC_URL}/login/${token!.value}`);
console.log('Anyone else: request a link on the sign-in page; without SMTP_URL it is printed in the server log.');
await sql.end();
