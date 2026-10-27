import type { Quolle } from "./client";
import type { SendEmailPayload, USSDEmailPayload, Email, SendOptions } from "./types";

function idemHeaders(options?: SendOptions): Record<string, string> | undefined {
  return options?.idempotencyKey ? { "Idempotency-Key": options.idempotencyKey } : undefined;
}

export class EmailsResource {
  constructor(private readonly client: Quolle) {}

  /**
   * Queue an email for immediate or scheduled delivery. Provide either `html`
   * (with `subject`) or a `template` slug (with optional `variables`). Pass
   * `{ idempotencyKey }` to make retries safe.
   */
  async send(payload: SendEmailPayload, options?: SendOptions): Promise<{ id: string }> {
    return this.client.request("POST", "/v1/emails/send", payload, idemHeaders(options));
  }

  /** Send up to 100 emails in one all-or-nothing request. */
  async sendBatch(
    emails: SendEmailPayload[],
    options?: SendOptions
  ): Promise<{ queued: number; ids: string[] }> {
    return this.client.request("POST", "/v1/emails/batch", { emails }, idemHeaders(options));
  }

  /** Retrieve a single email by ID (status, open/click counts, timestamps). */
  async get(id: string): Promise<Email> {
    return this.client
      .request<{ email: Email }>("GET", `/v1/emails/${encodeURIComponent(id)}`)
      .then((r) => r.email);
  }

  /** Cancel a scheduled email that has not yet been sent. */
  async cancel(id: string): Promise<{ message: string }> {
    return this.client.request("DELETE", `/v1/emails/${encodeURIComponent(id)}/cancel`);
  }

  /**
   * Send an email triggered by a USSD session, to `to` or to the email Quolle
   * resolves for `phoneNumber`. This endpoint doesn't take an idempotency key,
   * so a failed call is not retried automatically (a retry could send twice).
   */
  async sendUSSD(payload: USSDEmailPayload): Promise<{ queued: boolean; ref: string }> {
    return this.client.request("POST", "/v1/emails/ussd", payload);
  }

  /** Legacy: set an idempotency key for the next request. Prefer the per-call option. */
  setIdempotencyKey(key: string): this {
    this.client.setIdempotencyKey(key);
    return this;
  }
}
