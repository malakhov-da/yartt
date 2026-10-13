import { z } from 'zod';
import { interpolate, TRANSLATIONS } from '#shared/i18n/index.ts';
import type { Message } from '../delivery.ts';
import env from '../env.ts';
import { sql } from '../pg.ts';

const Title = z.object({ title: z.string() });
const Name = z.object({ id: z.number(), fullName: z.string() });

/** A task "title": its tags in the order the employee sees them. */
async function taskTitle(taskId: number, employeeId: number): Promise<string> {
  const [row] = Title.array().parse(await sql`
    SELECT array_to_string(ARRAY(
             SELECT tag.name
               FROM unnest(ordered_tags(${employeeId}, k.tag_ids)) WITH ORDINALITY AS o(id, n)
               JOIN tag ON tag.id = o.id
              ORDER BY o.n
           ), ' · ') AS title
      FROM task k WHERE k.id = ${taskId}
  `);
  return row?.title ?? `#${taskId}`;
}

async function names(ids: number[]): Promise<Map<number, string>> {
  if (ids.length === 0) return new Map();
  const rows = Name.array().parse(await sql`SELECT id, full_name FROM employee WHERE id = ANY(${ids})`);
  return new Map(rows.map((r) => [r.id, r.fullName]));
}

/** Subject and plain-text body in the recipient's language. */
export async function renderMail(message: Message): Promise<{ subject: string; text: string }> {
  const t = TRANSLATIONS[message.to.locale].mail;
  const p = message.payload;
  const recipientId = message.to.employeeId;

  const personIds = [
    'by' in p ? p.by : null,
    'employeeId' in p ? p.employeeId : null,
    'from' in p ? p.from : null,
    'for' in p ? p.for : null,
  ].filter((id): id is number => typeof id === 'number');
  const people = await names(personIds);
  const person = (id: number | undefined) => (id === undefined ? '' : (people.get(id) ?? `#${id}`));

  const params: Record<string, string> = {
    task: message.taskId === null ? '' : await taskTitle(message.taskId, recipientId),
    by: person('by' in p ? p.by : undefined),
    employee: person('employeeId' in p ? p.employeeId : undefined),
    from: person('from' in p ? p.from : undefined),
    dependency: 'dependencyId' in p ? await taskTitle(p.dependencyId, recipientId) : '',
    text: 'text' in p ? (p.text ?? '') : '',
    day: 'day' in p ? p.day : '',
    url: p.kind === 'login' ? p.url : `${env.PUBLIC_URL}/login`,
  };

  const template = t[p.kind];
  const lines = [interpolate(template.body, params).trim()];
  if ('for' in p && p.for !== undefined) lines.push(interpolate(t.awayCopy, { name: person(p.for) }));
  if (message.taskId !== null) lines.push(interpolate(t.open, { url: `${env.PUBLIC_URL}/tasks/${message.taskId}` }));

  return { subject: interpolate(template.subject, params), text: lines.join('\n\n') };
}
