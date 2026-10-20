import type { Locale } from '#shared/employee.ts';
import type { NotificationPayload } from '#shared/notification.ts';
import env from './env.ts';
import { mailEnabled, sendMail } from './mail.ts';
import { renderMail } from './services/Mail.ts';
import { sendWebhook, type WebhookTarget } from './webhook.ts';

export type Recipient = {
  employeeId: number;
  kind: 'human' | 'bot';
  /** NULL — no address: the webhook only. */
  email: string | null;
  fullName: string;
  locale: Locale;
  /** Moments in emails are shown in it. */
  timeZone: string;
  /** A bot's own webhook; NULL — it has none, and gets nothing outside its bell. */
  webhook?: WebhookTarget | null;
};

/**
 * A notification from the queue, or a link that never touches the queue:
 * to sign in, or to confirm a new email (and the word to the old one).
 */
export type Payload = NotificationPayload
  | { kind: 'login'; url: string }
  | { kind: 'email_confirm'; url: string; email: string }
  | { kind: 'email_changing'; email: string };

/** Only by email: a link that proves the mailbox must not arrive anywhere else. */
const MAIL_ONLY = new Set<Payload['kind']>(['email_confirm', 'email_changing']);

export type Message = {
  to: Recipient;
  taskId: number | null;
  payload: Payload;
};

// Every outgoing message goes through here: an email in the recipient's
// language (SMTP_URL) and/or the webhook (WEBHOOK_URL) for other channels.
// With neither configured the message is logged (development mode). A bot
// gets JSON on its own webhook only.
export async function deliver(message: Message): Promise<void> {
  const { kind, ...data } = message.payload;
  const { webhook, ...to } = message.to;

  if (to.kind === 'bot') {
    if (webhook) await sendWebhook({ kind, to, taskId: message.taskId, data }, webhook);
    return;
  }

  if (mailEnabled && message.to.email !== null) {
    const mail = await renderMail(message);
    await sendMail(message.to.email, mail.subject, mail.text);
  }
  if (env.WEBHOOK_URL && !MAIL_ONLY.has(kind)) {
    await sendWebhook({ kind, to, taskId: message.taskId, data });
  }
  if (!mailEnabled && (!env.WEBHOOK_URL || MAIL_ONLY.has(kind))) {
    console.log(`[delivery] ${JSON.stringify({ kind, to: message.to.email, taskId: message.taskId, data })}`);
  }
}
