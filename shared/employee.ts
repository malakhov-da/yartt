import { z } from 'zod';
import { Keyboard, KEYBOARDS } from './keyboards.ts';

// A schema and its inferred type share a name: `Employee` is both.

export const LOCALES = ['ru', 'en'] as const;
export const Locale = z.enum(LOCALES);
export type Locale = z.infer<typeof Locale>;

/** How to speak of someone: verb forms in languages that have them. NULL — not given. */
export const PRONOUNS = ['he', 'she'] as const;
export const Pronoun = z.enum(PRONOUNS);
export type Pronoun = z.infer<typeof Pronoun>;

export const Id = z.number().int().positive();
export const Email = z.email().max(254);
export const FullName = z.string().trim().min(1).max(255);
export const TimeZone = z.string().min(1).max(64);
/** Calendar day, YYYY-MM-DD. */
export const Day = z.iso.date();

/** A person or a program acting through the API (db.sql, employee_kind). */
export const EmployeeKind = z.enum(['human', 'bot']);
export type EmployeeKind = z.infer<typeof EmployeeKind>;

export const Employee = z.object({
  id: Id,
  kind: EmployeeKind,
  /** The sign-in and mail address; NULL — none: no emails, no sign-in link. Kept on dismissal. */
  email: z.string().nullable(),
  /** When dismissed; NULL — working. */
  dismissedAt: z.date().nullable(),
  fullName: z.string(),
  about: z.string().nullable(),
  managerId: Id.nullable(),
  /** Back at work on this day (vacation, sick leave, ...); NULL = available, and always for a bot. */
  nextDay: Day.nullable(),
  timeZone: z.string(),
  locale: Locale,
  pronoun: Pronoun.nullable(),
  /** Layouts switched between, for text typed with the wrong one; NULL — by the interface language. */
  keyboards: Keyboard.array().nullable(),
  /** When the avatar was last set; NULL — none, the initials are shown. */
  avatarAt: z.date().nullable(),
});
export type Employee = z.infer<typeof Employee>;

/** The signed-in employee, and whether their email is outside the company's domains (decision 52). */
export const Me = Employee.extend({
  /** Their email is outside EMAIL_DOMAINS: they may only change it. */
  outsideDomains: z.boolean(),
  /** The company's mail domains; empty — any. */
  domains: z.string().array(),
});
export type Me = z.infer<typeof Me>;

export const InviteInput = z.object({
  email: Email,
  fullName: FullName,
  /** Defaults to the inviter's locale. */
  locale: Locale.optional(),
  /** Defaults to the inviter's time zone. */
  timeZone: TimeZone.optional(),
});
export type InviteInput = z.infer<typeof InviteInput>;

/** What the employee writes about themselves; saved with a button. */
export const ProfileInput = z.object({
  fullName: FullName,
  /** Free text: position, how to reach me, anything colleagues should know. */
  about: z.string().max(10_000).nullable(),
});
export type ProfileInput = z.infer<typeof ProfileInput>;

/** A new sign-in address: it becomes the person's once the link sent there is followed. */
export const EmailChangeInput = z.object({ email: Email });
export type EmailChangeInput = z.infer<typeof EmailChangeInput>;

/** Settings applied as soon as they are picked; only the given fields change. */
export const SettingsInput = z
  .object({
    nextDay: Day.nullable(),
    timeZone: TimeZone,
    locale: Locale,
    pronoun: Pronoun.nullable(),
    keyboards: Keyboard.array().min(1).max(KEYBOARDS.length).nullable(),
  })
  .partial();
export type SettingsInput = z.infer<typeof SettingsInput>;
