import type { Locale } from '../employee.ts';
import { en } from './en.ts';
import { ru, type Translation } from './ru.ts';

export type { Translation };

/** All translations by locale. The client feeds them to i18next, the server renders emails. */
export const TRANSLATIONS: Record<Locale, Translation> = { ru, en };

/** Substitutes {{name}} placeholders; unknown ones become empty. */
export function interpolate(template: string, params: Record<string, string | number | null | undefined>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, name: string) => String(params[name] ?? ''));
}
