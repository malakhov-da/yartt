import postgres from 'postgres';
import env from './env.ts';

// Every query result is parsed with a zod schema at the call site:
// `Schema.array().parse(await sql`...`)`. The driver only shapes the data.
export function connect(url: string) {
  return postgres(url, {
    transform: {
      undefined: null,
      column: postgres.camel.column,
    },
    onnotice: () => {},
    types: {
      // DATE stays a YYYY-MM-DD string: a day must not depend on the server time zone.
      date: {
        to: 1082,
        from: [1082],
        serialize: (value: string) => value,
        parse: (value: string) => value,
      },
    },
  });
}

export type Sql = ReturnType<typeof connect>;

export const sql = connect(env.DATABASE_URL);
