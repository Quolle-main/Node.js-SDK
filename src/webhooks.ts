import { createHmac, timingSafeEqual } from "crypto";
import { QuolleError, type WebhookEvent } from "./types";

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

/** Webhook helpers, exposed as `client.webhooks`. */
export class WebhooksResource {
  /** See {@link verifyWebhook}. */
  verify(
    payload: string | Buffer,
    signatureHeader: string,
    secret: string,
    toleranceSeconds?: number
  ): WebhookEvent {
    return verifyWebhook(payload, signatureHeader, secret, toleranceSeconds);
  }
}
