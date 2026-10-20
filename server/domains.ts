import env from './env.ts';
import { AppError } from './errors.ts';

// The company's mail domains (EMAIL_DOMAINS, decision 52): only they are
// written as anyone's email. Set in the environment, not the database: it
// is how the installation is configured, like SMTP_URL.

/** True when no domains are set, or the address is at one of them (exact, case aside). */
export function emailAllowed(email: string): boolean {
  if (env.EMAIL_DOMAINS.length === 0) return true;
  const domain = email.slice(email.lastIndexOf('@') + 1).toLowerCase();
  return env.EMAIL_DOMAINS.includes(domain);
}

/**
 * Refuses an address outside the domains, wherever an email is written:
 * an invite, a change, bringing someone back.
 * @throws email_not_allowed
 */
export function assertEmailAllowed(email: string): void {
  if (!emailAllowed(email)) throw new AppError('email_not_allowed', { domains: env.EMAIL_DOMAINS.join(', ') });
}

/** Someone whose email is outside the domains: they may only change it. */
export function outsideDomains(email: string | null): boolean {
  return email !== null && !emailAllowed(email);
}
