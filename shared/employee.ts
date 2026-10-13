import { z } from 'zod';

// A schema and its inferred type share a name: `Employee` is both.

export const LOCALES = ['ru', 'en'] as const;
export const Locale = z.enum(LOCALES);
export type Locale = z.infer<typeof Locale>;

export const Id = z.number().int().positive();
export const Email = z.email().max(254);
export const FullName = z.string().trim().min(1).max(255);
export const TimeZone = z.string().min(1).max(64);
/** Calendar day, YYYY-MM-DD. */
export const Day = z.iso.date();

export const Employee = z.object({
  id: Id,
  /** NULL = dismissed. */
  email: z.string().nullable(),
  fullName: z.string(),
  about: z.string().nullable(),
  managerId: Id.nullable(),
  /** Away until this day; NULL = available. */
  nextDay: Day.nullable(),
  timeZone: z.string(),
  locale: Locale,
});
export type Employee = z.infer<typeof Employee>;

export const InviteInput = z.object({
  email: Email,
  fullName: FullName,
  /** Defaults to the inviter's locale. */
  locale: Locale.optional(),
  /** Defaults to the inviter's time zone. */
  timeZone: TimeZone.optional(),
});
export type InviteInput = z.infer<typeof InviteInput>;

export const ProfileInput = z.object({
  fullName: FullName,
  about: z.string().max(10_000).nullable(),
  nextDay: Day.nullable(),
  timeZone: TimeZone,
  locale: Locale,
});
export type ProfileInput = z.infer<typeof ProfileInput>;
