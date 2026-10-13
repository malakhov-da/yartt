import type { Locale } from '#shared/employee.ts';
import type { NotificationPayload } from '#shared/notification.ts';
import env from './env.ts';
import { mailEnabled, sendMail } from './mail.ts';
import { renderMail } from './services/Mail.ts';
import { sendWebhook } from './webhook.ts';

export type Recipient = {
  employeeId: number;
  email: string;
  fullName: string;
  locale: Locale;
};

/** A notification from the queue, or a sign-in link that never touches the queue. */
export type Payload = NotificationPayload | { kind: 'login'; url: string };

export type Message = {
  to: Recipient;
  taskId: number | null;
  payload: Payload;
};

// Every outgoing message goes through here: an email in the recipient's
// language (SMTP_URL) and/or the webhook (WEBHOOK_URL) for other channels.
// With neither configured the message is logged (development mode).
export async function deliver(message: Message): Promise<void> {
  const { kind, ...data } = message.payload;

  if (mailEnabled) {
    const mail = await renderMail(message);
    await sendMail(message.to.email, mail.subject, mail.text);
  }
  if (env.WEBHOOK_URL) {
    await sendWebhook({ kind, to: message.to, taskId: message.taskId, data });
  }
  if (!mailEnabled && !env.WEBHOOK_URL) {
    console.log(`[delivery] ${JSON.stringify({ kind, to: message.to.email, taskId: message.taskId, data })}`);
  }
}
