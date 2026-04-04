import type { VercelRequest, VercelResponse } from '@vercel/node';
import DodoPayments from 'dodopayments';
import type { Payment } from 'dodopayments/resources/payments';
import type { Subscription } from 'dodopayments/resources/subscriptions';
import type { UnwrapWebhookEvent } from 'dodopayments/resources/webhooks';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/** Disable Vercel body helpers so the raw JSON string matches Dodo signature verification. */
export const config = {
  helpers: false as const,
};

const MAX_BODY_BYTES = 1024 * 1024;

const PAYMENT_EVENT_TYPES = new Set([
  'payment.succeeded',
  'payment.processing',
  'payment.failed',
  'payment.cancelled',
]);

const SUBSCRIPTION_EVENT_TYPES = new Set([
  'subscription.updated',
  'subscription.active',
  'subscription.cancelled',
  'subscription.expired',
  'subscription.failed',
  'subscription.on_hold',
  'subscription.plan_changed',
  'subscription.renewed',
]);

function normalizeWebhookHeaders(headers: VercelRequest['headers']): Record<string, string> {
  const lower = new Map<string, string>();
  for (const [k, v] of Object.entries(headers || {})) {
    if (v === undefined) continue;
    const val = Array.isArray(v) ? v[0] : v;
    if (val) lower.set(k.toLowerCase(), val);
  }
  const id = lower.get('webhook-id');
  const sig = lower.get('webhook-signature');
  const ts = lower.get('webhook-timestamp');
  if (!id || !sig || !ts) {
    throw new Error('Missing webhook-id, webhook-signature, or webhook-timestamp');
  }
  return {
    'webhook-id': id,
    'webhook-signature': sig,
    'webhook-timestamp': ts,
  };
}

async function readRawBody(req: VercelRequest): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buf.length;
    if (size > MAX_BODY_BYTES) {
      throw new Error('Request body too large');
    }
    chunks.push(buf);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function dodoEnvironment(): 'live_mode' | 'test_mode' {
  const raw = (process.env.DODO_PAYMENTS_ENVIRONMENT || '').trim().toLowerCase();
  return raw === 'live_mode' || raw === 'live' ? 'live_mode' : 'test_mode';
}

function getSupabaseServiceClient(): SupabaseClient {
  const url = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim();
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!url || !serviceKey) {
    throw new Error('Missing SUPABASE_URL (or VITE_SUPABASE_URL) or SUPABASE_SERVICE_ROLE_KEY');
  }
  return createClient(url, serviceKey);
}

function parseIsoTimestamptz(value: string | null | undefined): string | null {
  if (!value) return null;
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) return null;
  return new Date(ms).toISOString();
}

function paymentRowFromPayload(payment: Payment, rawEvent: Record<string, unknown>) {
  return {
    dodo_payment_id: payment.payment_id,
    total_amount_minor: payment.total_amount,
    currency: String(payment.currency),
    status: payment.status ?? null,
    customer_id: payment.customer?.customer_id ?? null,
    dodo_subscription_id: payment.subscription_id ?? null,
    dodo_created_at: parseIsoTimestamptz(payment.created_at),
    dodo_updated_at: parseIsoTimestamptz(payment.updated_at ?? null),
    raw_event: rawEvent,
  };
}

function subscriptionRowFromPayload(sub: Subscription, rawEvent: Record<string, unknown>) {
  return {
    dodo_subscription_id: sub.subscription_id,
    customer_id: sub.customer.customer_id,
    status: String(sub.status),
    product_id: sub.product_id,
    currency: String(sub.currency),
    recurring_pre_tax_amount: sub.recurring_pre_tax_amount,
    cancel_at_next_billing_date: sub.cancel_at_next_billing_date,
    previous_billing_date: parseIsoTimestamptz(sub.previous_billing_date),
    next_billing_date: parseIsoTimestamptz(sub.next_billing_date),
    payment_frequency_count: sub.payment_frequency_count,
    payment_frequency_interval: String(sub.payment_frequency_interval),
    subscription_period_count: sub.subscription_period_count,
    subscription_period_interval: String(sub.subscription_period_interval),
    quantity: sub.quantity,
    raw_event: rawEvent,
  };
}

async function upsertPayment(supabase: SupabaseClient, payment: Payment) {
  const rawEvent = payment as unknown as Record<string, unknown>;
  const row = paymentRowFromPayload(payment, rawEvent);
  const { error } = await supabase.from('payments').upsert(row, { onConflict: 'dodo_payment_id' });
  if (error) console.error('payments upsert', error);
}

async function upsertSubscription(supabase: SupabaseClient, sub: Subscription) {
  const rawEvent = sub as unknown as Record<string, unknown>;
  const row = subscriptionRowFromPayload(sub, rawEvent);
  const { error } = await supabase.from('subscriptions').upsert(row, { onConflict: 'dodo_subscription_id' });
  if (error) console.error('subscriptions upsert', error);
}

async function processWebhookEvent(supabase: SupabaseClient, event: UnwrapWebhookEvent) {
  console.log('Dodo webhook event:', event.type);

  if (PAYMENT_EVENT_TYPES.has(event.type)) {
    await upsertPayment(supabase, event.data as Payment);
    return;
  }
  if (SUBSCRIPTION_EVENT_TYPES.has(event.type)) {
    await upsertSubscription(supabase, event.data as Subscription);
    return;
  }
  console.warn(`Unhandled Dodo webhook type: ${event.type}`);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const webhookKey = (process.env.DODO_PAYMENTS_WEBHOOK_KEY || '').trim();
  if (!webhookKey) {
    console.error('DODO_PAYMENTS_WEBHOOK_KEY is not set');
    res.status(500).json({ error: 'Server misconfiguration' });
    return;
  }

  let rawBody: string;
  try {
    rawBody = await readRawBody(req);
  } catch (e) {
    console.error('Read body', e);
    res.status(400).json({ error: 'Invalid body' });
    return;
  }

  if (!rawBody) {
    res.status(400).json({ error: 'Empty body' });
    return;
  }

  const client = new DodoPayments({
    bearerToken: (process.env.DODO_PAYMENTS_API_KEY || '').trim() || undefined,
    environment: dodoEnvironment(),
    webhookKey,
  });

  let event: UnwrapWebhookEvent;
  try {
    const headers = normalizeWebhookHeaders(req.headers);
    event = client.webhooks.unwrap(rawBody, { headers, key: webhookKey });
  } catch (e) {
    console.error('Webhook verification failed', e);
    res.status(401).json({ error: 'Invalid signature' });
    return;
  }

  let supabase: SupabaseClient;
  try {
    supabase = getSupabaseServiceClient();
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server misconfiguration' });
    return;
  }

  // Acknowledge after verification so Dodo does not retry on slow DB work; failures are logged.
  res.status(200).json({ received: true });
  processWebhookEvent(supabase, event).catch((err) => console.error('processWebhookEvent', err));
}
