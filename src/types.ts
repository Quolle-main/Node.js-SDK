export interface QuolleConfig {
  /** Your Quolle API key (starts with `qle_`). Falls back to QUOLLE_API_KEY. */
  apiKey?: string;
  /** API base URL. Falls back to QUOLLE_BASE_URL, then https://api.quolle.com. */
  baseURL?: string;
  /** Per-request timeout in milliseconds. Default 30000. */
  timeout?: number;
  /** Retries for transient failures (429/5xx/network). Default 3. */
  maxRetries?: number;
}

/**
 * A file attached to an email. Provide either `content` (raw bytes base64-encoded)
 * or `path` (a URL Quolle fetches at send time). Set `contentId` to embed the
 * file inline via `<img src="cid:the-id">`. Up to 20 attachments, 10 MB total.
 */
export interface Attachment {
  filename: string;
  content?: string; // base64
  path?: string; // remote URL, fetched at send
  contentType?: string;
  contentId?: string;
}

/** Per-call options for send / sendBatch. */
export interface SendOptions {
  /** Idempotency key — safe retries never send twice. */
  idempotencyKey?: string;
}

interface SendEmailShared {
  from: string;
  to: string | string[];
  replyTo?: string;
  scheduledAt?: string;
  attachments?: Attachment[];
  metadata?: Record<string, unknown>;
  /**
   * Message stream. `transactional` (the default) or `marketing`. Marketing
   * mail gets one-click unsubscribe headers and a footer link, and honours
   * unsubscribes; transactional mail never does.
   */
  type?: "transactional" | "marketing";
}

/**
 * Either raw `html` (with a `subject`) or a `template` slug with `variables`.
 * With a template the subject is optional — the template supplies its own.
 */
export type SendEmailPayload = SendEmailShared &
  (
    | { html: string; subject: string; text?: string; template?: never; variables?: never }
    | {
        template: string;
        subject?: string;
        variables?: Record<string, unknown>;
        html?: never;
        text?: never;
      }
  );

/**
 * An email triggered from a USSD session. Address it by `to`, or by
 * `phoneNumber` for a subscriber whose email Quolle resolves. Raw HTML only.
 */
export interface USSDEmailPayload {
  from: string;
  to?: string;
  phoneNumber?: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
  metadata?: Record<string, unknown>;
}

export interface Email {
  id: string;
  from: string;
  to: string;
  subject: string;
  status:
    | "queued"
    | "scheduled"
    | "sending"
    | "sent"
    | "delivered"
    | "bounced"
    | "complained"
    | "suppressed"
    | "failed"
    | "cancelled";
  provider?: string;
  messageId?: string;
  opensCount: number;
  clicksCount: number;
  openedAt?: string;
  clickedAt?: string;
  sentAt?: string;
  scheduledAt?: string;
  createdAt: string;
}

export interface WebhookEvent {
  event: string;
  /** Stable per event; the same id arrives on every retry (also the Quolle-Event-Id header). Use it to dedupe. */
  eventId: string;
  emailId?: string;
  to?: string[];
  subject?: string;
  status?: string;
  timestamp?: string;
  messageId?: string;
  [key: string]: unknown;
}

export class QuolleError extends Error {
  /**
   * The API's stable, machine-readable error code (e.g. `validation_error`,
   * `rate_limit_exceeded`, `warmup_limit_exceeded`). Branch on this, not on
   * the message. Undefined for network failures.
   */
  public code?: string;

  constructor(
    message: string,
    public statusCode: number,
    public data?: Record<string, unknown>,
    code?: string
  ) {
    super(message);
    this.name = "QuolleError";
    this.code = code;
  }

  get status(): number {
    return this.statusCode;
  }
}
