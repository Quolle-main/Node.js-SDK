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

// ── Domains ──────────────────────────────────────────────────────────────────

export interface Domain {
  id: string;
  domain: string;
  /** `pending`, `verified` or `failed`. */
  status: string;
  dnsProvider: string | null;
  dnsPublished: boolean;
  verificationError: string | null;
  trackingEnabled: boolean;
  trackingDomain: string | null;
  trackingDomainVerified: boolean;
  createdAt: string;
  /** Present once verified: the 14-day warm-up, with today's caps while it runs. */
  warmup?: {
    capped: boolean;
    day: number;
    dailyLimits: { transactional: number; marketing: number } | null;
    graduatesAt: string | null;
    sentToday?: { transactional: number; marketing: number };
    resetsAt?: string;
  };
  [key: string]: unknown;
}

export interface CreateDomainResult {
  domain: Domain;
  /** The DNS records to publish at your DNS provider. */
  dnsRecords: Record<string, unknown>[];
  isCloudflare: boolean;
  message: string;
  [key: string]: unknown;
}

// ── API keys ─────────────────────────────────────────────────────────────────

export interface ApiKey {
  id: string;
  name: string;
  /** Last characters of the key, for recognising it. */
  preview: string | null;
  /** `full` (everything) or `sending` (send email and read its status). */
  scope: "full" | "sending";
  /** Sending domains the key is limited to; empty means any. */
  domains: string[];
  expiresAt: string | null;
  expired: boolean;
  createdBy: string | null;
  lastUsedAt: string | null;
  createdAt: string;
}

export interface CreateApiKeyParams {
  name: string;
  /** Default `full`. A `sending` key can only send email and read its status. */
  scope?: "full" | "sending";
  /** Limit the key to these verified sending domains. */
  domains?: string[];
  /** Days until the key stops working. Omit for no expiry. */
  expiresInDays?: number;
}

export interface CreatedApiKey {
  /** The key itself (`qle_…`). Shown once; store it now. */
  key: string;
  id: string;
  name: string;
  scope: "full" | "sending";
  domains: string[];
  expiresAt: string | null;
}

// ── Webhook endpoints ────────────────────────────────────────────────────────

export interface Webhook {
  id: string;
  url: string;
  events: string[];
  /** Always masked when read back; the real secret is returned only by create and rotateSecret. */
  secret: string | null;
  createdAt: string;
}

export interface CreatedWebhook {
  id: string;
  url: string;
  events: string[];
  /** The signing secret (`whsec_…`). Shown once; store it now. */
  secret: string;
}

export interface WebhookTestResult {
  eventId: string;
  ok: boolean;
  /** Your endpoint's HTTP status, when it answered. */
  status: number | null;
  ms: number | null;
  error: string | null;
}

export interface WebhookDelivery {
  id: string;
  eventId: string;
  event: string;
  status: "succeeded" | "pending" | "failed";
  attempts: number;
  responseStatus: number | null;
  responseMs: number | null;
  lastError: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
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
