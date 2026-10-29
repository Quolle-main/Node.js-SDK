import { createHmac, timingSafeEqual } from "crypto";
import type { Quolle } from "./client";
import {
  QuolleError,
  type WebhookEvent,
  type Webhook,
  type CreatedWebhook,
  type WebhookTestResult,
  type WebhookDelivery,
} from "./types";

const enc = encodeURIComponent;

const DEFAULT_TOLERANCE = 300; // seconds

/**
 * Verify that an incoming webhook really came from Quolle, and return the parsed
 * event. Pass the RAW request body, the value of the `Quolle-Signature` header,
 * and your webhook signing secret (`whsec_…`, shown once when you created the
 * webhook).
 *
 * @throws QuolleError if the header is malformed, the timestamp is outside the
 *   tolerance window (replay protection), or the signature doesn't match.
 */
export function verifyWebhook(
  payload: string | Buffer,
  signatureHeader: string,
  secret: string,
  toleranceSeconds: number = DEFAULT_TOLERANCE
): WebhookEvent {
  const body = typeof payload === "string" ? payload : payload.toString("utf8");

  const parts = new Map<string, string>();
  for (const seg of (signatureHeader ?? "").split(",")) {
    const i = seg.indexOf("=");
    if (i > 0) parts.set(seg.slice(0, i).trim(), seg.slice(i + 1).trim());
  }
  const t = parts.get("t");
  const v1 = parts.get("v1");
  if (!t || !v1) throw new QuolleError("Invalid Quolle-Signature header", 0);

  const ts = Number(t);
  if (!Number.isFinite(ts)) throw new QuolleError("Invalid timestamp in Quolle-Signature header", 0);
  if (Math.abs(Date.now() / 1000 - ts) > toleranceSeconds) {
    throw new QuolleError("Webhook timestamp outside the tolerance window (possible replay)", 0);
  }

  const expected = createHmac("sha256", secret).update(`${ts}.${body}`).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(v1);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new QuolleError("Webhook signature verification failed", 0);
  }

  return JSON.parse(body) as WebhookEvent;
}

/**
 * Webhook endpoints and signature verification, exposed as `client.webhooks`.
 * `verify` works with any client; the management methods need a full-access key.
 */
export class WebhooksResource {
  constructor(private readonly client: Quolle) {}

  /** See {@link verifyWebhook}. */
  verify(
    payload: string | Buffer,
    signatureHeader: string,
    secret: string,
    toleranceSeconds?: number
  ): WebhookEvent {
    return verifyWebhook(payload, signatureHeader, secret, toleranceSeconds);
  }

  /** The event names a webhook can subscribe to. */
  async events(): Promise<{ event: string; group: string }[]> {
    return this.client
      .request<{ events: { event: string; group: string }[] }>("GET", "/v1/webhooks/events")
      .then((r) => r.events);
  }

  async list(): Promise<Webhook[]> {
    return this.client.request<{ webhooks: Webhook[] }>("GET", "/v1/webhooks").then((r) => r.webhooks);
  }

  /** Add an endpoint. The returned `secret` is shown once; store it to verify deliveries. */
  async create(params: { url: string; events: string[] }): Promise<CreatedWebhook> {
    return this.client.request("POST", "/v1/webhooks", params);
  }

  async get(id: string): Promise<Webhook> {
    return this.client.request("GET", `/v1/webhooks/${enc(id)}`);
  }

  /** Change the URL or events. The signing secret stays the same. */
  async update(id: string, params: { url?: string; events?: string[] }): Promise<Webhook> {
    return this.client.request("PATCH", `/v1/webhooks/${enc(id)}`, params);
  }

  async remove(id: string): Promise<{ message: string }> {
    return this.client.request("DELETE", `/v1/webhooks/${enc(id)}`);
  }

  /** Send a signed `webhook.test` event now and report how your endpoint answered. */
  async test(id: string): Promise<WebhookTestResult> {
    return this.client.request("POST", `/v1/webhooks/${enc(id)}/test`);
  }

  /** Deliveries from the last 30 days, newest first. */
  async deliveries(
    id: string,
    options: { status?: "succeeded" | "pending" | "failed"; limit?: number } = {}
  ): Promise<WebhookDelivery[]> {
    const q = new URLSearchParams();
    if (options.status) q.set("status", options.status);
    if (options.limit) q.set("limit", String(options.limit));
    const qs = q.toString();
    return this.client
      .request<{ deliveries: WebhookDelivery[] }>("GET", `/v1/webhooks/${enc(id)}/deliveries${qs ? `?${qs}` : ""}`)
      .then((r) => r.deliveries);
  }

  /** Send a delivery again, with the same body and `eventId`. */
  async redeliver(id: string, deliveryId: string): Promise<{ message: string; eventId: string }> {
    return this.client.request("POST", `/v1/webhooks/${enc(id)}/deliveries/${enc(deliveryId)}/redeliver`);
  }

  /** Replace the signing secret. Takes effect immediately; the new secret is returned once. */
  async rotateSecret(id: string): Promise<{ secret: string; [key: string]: unknown }> {
    return this.client.request("POST", `/v1/webhooks/${enc(id)}/rotate-secret`);
  }
}
