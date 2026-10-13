import nodemailer from 'nodemailer';
import env from './env.ts';

const transport = env.SMTP_URL ? nodemailer.createTransport(env.SMTP_URL) : null;

/** True when SMTP_URL is configured. */
export const mailEnabled = transport !== null;

/** Sends a plain-text email through the configured SMTP server. */
export async function sendMail(to: string, subject: string, text: string): Promise<void> {
  if (!transport) throw new Error('SMTP_URL is not configured');
  await transport.sendMail({ from: env.MAIL_FROM, to, subject, text });
}
