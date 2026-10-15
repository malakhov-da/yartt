import { z } from 'zod';
import type { Locale } from './employee.ts';

// Keyboard layouts, for text typed with the wrong one ("crkfl" for
// "склад"). Each is the 47 character keys without Shift, in the order of
// the US layout: ` 1-0 - =, q-p [ ] \, a-l ; ', z-m , . /. A new layout is
// one more line here, a value of the `keyboard` enum in db.sql and its name
// in shared/i18n.

export const KEYBOARD_KEYS = {
  en: '`1234567890-=qwertyuiop[]\\asdfghjkl;\'zxcvbnm,./',
  ru: 'ё1234567890-=йцукенгшщзхъ\\фывапролджэячсмитьбю.',
  uk: '\'1234567890-=йцукенгшщзхїґфівапролджєячсмитьбю.',
  be: 'ё1234567890-=йцукенгшўзх\'\\фывапролджэячсмітьбю.',
} as const;

export const KEYBOARDS = ['en', 'ru', 'uk', 'be'] as const;
export const Keyboard = z.enum(KEYBOARDS);
export type Keyboard = z.infer<typeof Keyboard>;

/** Until chosen in the profile: the interface language's layout and the US one. */
export function defaultKeyboards(locale: Locale): Keyboard[] {
  return locale === 'en' ? ['en'] : [locale, 'en'];
}

/**
 * The text as if the same keys were pressed with each other of the given
 * layouts: what was meant if the layout was wrong. A layout that has no key
 * for some character of the text cannot have been the one it was typed
 * with. Spaces stay.
 */
export function retype(text: string, keyboards: Keyboard[]): string[] {
  const results = new Set<string>();
  for (const from of keyboards) {
    const keys = KEYBOARD_KEYS[from];
    if (![...text].every((c) => c === ' ' || keys.includes(c))) continue;
    for (const to of keyboards) {
      if (to === from) continue;
      const target = [...KEYBOARD_KEYS[to]];
      const result = [...text].map((c) => (c === ' ' ? c : target[[...keys].indexOf(c)]!)).join('');
      if (result !== text) results.add(result);
    }
  }
  return [...results];
}
