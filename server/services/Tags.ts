import type { MyTags, SetTagInput, Suggestions, TagPart } from '#shared/tags.ts';
import { MyTag } from '#shared/tags.ts';
import { defaultKeyboards, Keyboard, retype } from '#shared/keyboards.ts';
import { Locale } from '#shared/employee.ts';
import { Tag, TagName } from '#shared/task.ts';
import { z } from 'zod';
import { AppError } from '../errors.ts';
import { sql } from '../pg.ts';

export const PAGE_SIZE = 50;

/**
 * The tags of the tasks I see, with how many such tasks carry each and how
 * many are open, and my own color and weight. Tags I gave a color or a
 * weight come first, then by weight, by how often I meet them, by name.
 */
export async function mine(viewerId: number, query: string, page: number): Promise<MyTags> {
  const like = '%' + query.replace(/[\\%_]/g, '\\$&') + '%';
  const tags = sql`
    SELECT t.id, t.name, u.color, COALESCE(u.weight, 0) AS weight,
           count(*)::int AS tasks,
           count(*) FILTER (WHERE f.value IS NULL OR f.value > NOW())::int AS open,
           (u.tag_id IS NOT NULL) AS personal
      FROM task k
      CROSS JOIN LATERAL unnest(k.tag_ids) AS kt(id)
      JOIN tag t ON t.id = kt.id
      LEFT JOIN finished_at f ON f.task_id = k.id AND f.expired_at IS NULL
      LEFT JOIN user_tag u ON u.tag_id = t.id AND u.employee_id = ${viewerId}
     WHERE can_see(k.id, ${viewerId}) AND t.name ILIKE ${like}
     GROUP BY t.id, t.name, u.tag_id, u.color, u.weight
  `;
  const items = MyTag.array().parse(await sql`
    SELECT id, name, color, weight, tasks, open FROM (${tags}) x
     ORDER BY personal DESC, weight DESC, tasks DESC, name
     LIMIT ${PAGE_SIZE} OFFSET ${(page - 1) * PAGE_SIZE}
  `);
  const [count] = z.object({ n: z.number() }).array().parse(await sql`SELECT count(*)::int AS n FROM (${tags}) x`);
  return { items, total: count?.n ?? 0 };
}

/** My color and weight of a tag; the default ones (no color, weight 0) remove my row. */
export async function set(employeeId: number, input: SetTagInput): Promise<void> {
  const [exists] = z.object({ value: z.boolean() }).array().parse(await sql`
    SELECT EXISTS (SELECT 1 FROM tag WHERE id = ${input.tagId}) AS value
  `);
  if (!exists?.value) throw new AppError('not_found');
  if (input.color === null && input.weight === 0) {
    await sql`DELETE FROM user_tag WHERE employee_id = ${employeeId} AND tag_id = ${input.tagId}`;
    return;
  }
  await sql`
    INSERT INTO user_tag (employee_id, tag_id, color, weight)
    VALUES (${employeeId}, ${input.tagId}, ${input.color}, ${input.weight})
    ON CONFLICT (employee_id, tag_id) DO UPDATE SET color = EXCLUDED.color, weight = EXCLUDED.weight
  `;
}

/** How close a tag must be to a phrase to be suggested (0..1). */
const MIN_SCORE = 0.6;
/** Words of the text read as tags; a longer text gets no variants. */
const MAX_WORDS = 8;
/** A tag may span this many words ("3-й этаж"). */
const MAX_SPAN = 3;
const VARIANTS = 5;

const Candidate = z.object({ ord: z.number(), id: z.number(), name: z.string(), color: z.string().nullable(), score: z.number() });
type Candidate = z.infer<typeof Candidate>;

/** How many nearest tags by trigrams each phrase looks at (the KNN index lookup). */
const KNN = 40;

/**
 * Tags close to each phrase, best first. Exact name — 1, exact in another
 * layout — 0.95; a name or its Latin form starting with the phrase — 0.9
 * (only where `prefix`: the word being typed), containing it — 0.7;
 * otherwise Levenshtein and trigrams on the Latin forms (db.sql, SEARCH).
 * Each phrase comes with `variants`: the same keys read with the viewer's
 * other layouts. A phrase of `words` words is compared only with tags of as
 * many words (0 — any): otherwise a long phrase would pass for a short tag
 * it merely contains. Candidates come from the indexes first: the nearest
 * by trigrams (KNN), the exact name, names starting with the word.
 */
async function candidates(
  viewerId: number,
  phrases: { text: string; variants: string[]; prefix: boolean; words: number }[],
  limit: number,
): Promise<Candidate[]> {
  if (phrases.length === 0) return [];
  const esc = (v: string) => v.replace(/[\\%_]/g, '\\$&');
  const rows = phrases.flatMap((p, i) => [p.text, ...p.variants].map((variant) => ({ ...p, ord: i + 1, variant })));
  return Candidate.array().parse(await sql`
      WITH q AS (
        SELECT ord::int, phrase, variant, prefix::bool AS prefix, words::int AS words, pattern, translit(variant) AS a
          FROM unnest(${rows.map((r) => String(r.ord))}::text[], ${rows.map((r) => r.text)}::text[],
                      ${rows.map((r) => r.variant)}::text[], ${rows.map((r) => (r.prefix ? 't' : 'f'))}::text[],
                      ${rows.map((r) => String(r.words))}::text[], ${rows.map((r) => esc(r.variant))}::text[])
               AS x(ord, phrase, variant, prefix, words, pattern)
      ), scored AS (
        SELECT q.ord, t.id, t.name, max(
                 CASE
                   WHEN t.name = q.phrase THEN 1.0
                   WHEN t.name = q.variant THEN 0.95
                   WHEN q.prefix AND (t.name LIKE q.pattern || '%' OR t.latin LIKE translit(q.pattern) || '%') THEN 0.9
                   WHEN q.prefix AND length(q.variant) >= 3 AND t.name LIKE '%' || q.pattern || '%' THEN 0.7
                   ELSE greatest(
                     1 - levenshtein(left(q.a, 255), left(t.latin, 255))::float8 / greatest(length(q.a), length(t.latin), 1),
                     similarity(q.a, t.latin))
                 END) AS score
          FROM q
          -- Candidates first, by the indexes: the nearest by trigrams (GiST, KNN),
          -- the exact name, and names starting with or containing the word typed.
          JOIN LATERAL (
            (SELECT c.id FROM tag c ORDER BY c.latin <-> q.a LIMIT ${KNN})
            UNION (SELECT c.id FROM tag c WHERE c.name = q.variant)
            UNION (SELECT c.id FROM tag c
                    WHERE q.prefix AND (c.name LIKE q.pattern || '%' OR c.latin LIKE translit(q.pattern) || '%') LIMIT ${KNN})
            UNION (SELECT c.id FROM tag c
                    WHERE q.prefix AND length(q.variant) >= 3 AND c.name LIKE '%' || q.pattern || '%' LIMIT ${KNN})
          ) candidate ON TRUE
          JOIN tag t ON t.id = candidate.id
         WHERE q.words = 0 OR q.words = array_length(string_to_array(t.name, ' '), 1)
         GROUP BY q.ord, t.id, t.name
      ), ranked AS (
        SELECT s.*, row_number() OVER (
                 PARTITION BY s.ord
                 ORDER BY s.score DESC, (SELECT count(*) FROM task k WHERE k.tag_ids @> ARRAY[s.id]) DESC, s.name
               ) AS rn
          FROM scored s
         WHERE s.score >= ${MIN_SCORE}
      )
      SELECT r.ord, r.id, r.name, u.color, r.score::float8 AS score
        FROM ranked r
        LEFT JOIN user_tag u ON u.tag_id = r.id AND u.employee_id = ${viewerId}
       WHERE r.rn <= ${limit}
       ORDER BY r.ord, r.rn
    `);
}

const KeyboardsRow = z.object({ keyboards: Keyboard.array().nullable(), locale: Locale });

type Partial = { parts: TagPart[]; score: number };

const key = (parts: TagPart[]) => parts.map((p) => ('tag' in p ? `#${p.tag.id}` : p.name)).join('|');

/**
 * Tags for what is typed: the closest to the whole text, and ways to read it
 * as several tags — a beam search over the words where a run of up to
 * MAX_SPAN words is an existing tag or the words between such runs make one
 * new tag. A variant scores the closeness of its tags times the words they
 * cover, so the reading that explains more of the text with existing tags
 * comes first.
 */
export async function suggest(viewerId: number, text: string): Promise<Suggestions> {
  const parsed = TagName.safeParse(text);
  if (!parsed.success) return { tags: [], variants: [], exact: false };
  const whole = parsed.data;
  // Only spaces part words: "," and ";" are letters typed in another layout ("б", "ж").
  const words = whole.split(' ');
  const [row] = KeyboardsRow.array().parse(await sql`SELECT keyboards::text[] AS keyboards, locale FROM employee WHERE id = ${viewerId}`);
  const keyboards = row?.keyboards ?? defaultKeyboards(row?.locale ?? 'en');
  const retyped = (phrase: string) => retype(phrase, keyboards);
  // The last word is still being typed unless a space follows it.
  const typing = !/\s$/.test(text);

  const spans: { from: number; to: number; text: string; variants: string[]; prefix: boolean; words: number }[] = [];
  if (words.length > 1 && words.length <= MAX_WORDS) {
    for (let from = 0; from < words.length; from++) {
      for (let to = from + 1; to <= Math.min(words.length, from + MAX_SPAN); to++) {
        const phrase = words.slice(from, to).join(' ');
        spans.push({ from, to, text: phrase, variants: retyped(phrase), prefix: typing && to === words.length, words: to - from });
      }
    }
  }
  const phrases = [{ text: whole, variants: retyped(whole), prefix: true, words: 0 }, ...spans];
  const found = await candidates(viewerId, phrases, 10);
  const byPhrase = (ord: number) => found.filter((c) => c.ord === ord).map(({ id, name, color, score }) => ({ tag: Tag.parse({ id, name, color }), score }));
  const tags = byPhrase(1).map((c) => c.tag);

  let beam: Partial[][] = [[{ parts: [], score: 0 }], ...words.map(() => [])];
  for (let i = 0; i < words.length; i++) {
    for (const partial of beam[i]!) {
      const last = partial.parts.at(-1);
      const asNew: TagPart[] = last && 'name' in last
        ? [...partial.parts.slice(0, -1), { name: `${last.name} ${words[i]}` }]
        : [...partial.parts, { name: words[i]! }];
      beam[i + 1]!.push({ parts: asNew, score: partial.score });
      spans.forEach((span, n) => {
        if (span.from !== i) return;
        for (const c of byPhrase(n + 2).slice(0, 2)) {
          if (partial.parts.some((p) => 'tag' in p && p.tag.id === c.tag.id)) continue;
          beam[span.to]!.push({ parts: [...partial.parts, { tag: c.tag }], score: partial.score + c.score * (span.to - span.from) });
        }
      });
    }
    for (let j = i + 1; j <= words.length; j++) {
      const seen = new Set<string>();
      beam[j] = beam[j]!.sort((a, b) => b.score - a.score).filter((p) => !seen.has(key(p.parts)) && !!seen.add(key(p.parts))).slice(0, VARIANTS * 2);
    }
  }
  const variants = words.length > 1
    ? beam[words.length]!.filter((p) => p.score > 0).slice(0, VARIANTS).map((p) => p.parts)
    : [];

  return { tags, variants, exact: tags.some((t) => t.name === whole) };
}
