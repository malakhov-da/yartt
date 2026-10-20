import { createHmac } from 'node:crypto';
import env from './env.ts';

export type WebhookMessage = {
  kind: string;
  to: {
    employeeId: number;
    email: string | null;
    fullName: string;
    locale: string;
    timeZone: string;
  };
  taskId?: number | null;
  data: Record<string, unknown>;
};

// Every outgoing message goes here. The delivery channel (email, Telegram, ...)
// and the text in the recipient's language are up to the webhook receiver.
// Without WEBHOOK_URL the message is logged (development mode).
export async function sendWebhook(message: WebhookMessage): Promise<void> {
  const body = JSON.stringify(message);

  if (!env.WEBHOOK_URL) {
    console.log(`[webhook] ${body}`);
    return;
  }

  const signature = createHmac('sha256', env.WEBHOOK_SECRET ?? '').update(body).digest('hex');
  const response = await fetch(env.WEBHOOK_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-yartt-signature': `sha256=${signature}`,
    },
    body,
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    throw new Error(`Webhook responded with ${response.status}`);
  }
}
