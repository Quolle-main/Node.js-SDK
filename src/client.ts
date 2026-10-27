import { QuolleError, type QuolleConfig } from "./types";
import { EmailsResource } from "./emails";
import { WebhooksResource } from "./webhooks";

export const VERSION = "0.3.0";

export class Quolle {
  private readonly apiKey: string;
  private readonly timeout: number;
  private readonly maxRetries: number;
  readonly baseURL: string;
  private _idempotencyKey?: string;

  readonly emails: EmailsResource;
  readonly webhooks: WebhooksResource;

  /**
   * @param apiKeyOrConfig  An API key string, or a config object. If omitted,
   *   the key falls back to the QUOLLE_API_KEY environment variable.
   *
   *   new Quolle("qle_...")
   *   new Quolle({ apiKey: "qle_...", maxRetries: 5 })
   *   new Quolle()                       // uses QUOLLE_API_KEY
   */
  constructor(apiKeyOrConfig?: string | QuolleConfig) {
    const config: QuolleConfig =
      typeof apiKeyOrConfig === "string" ? { apiKey: apiKeyOrConfig } : apiKeyOrConfig ?? {};

    const key = config.apiKey ?? process.env.QUOLLE_API_KEY;
    if (!key) {
      throw new Error(
        "A Quolle API key is required. Pass it to new Quolle(...) or set QUOLLE_API_KEY."
      );
    }
    if (!key.startsWith("qle_")) {
      console.warn("Quolle: API key should start with qle_");
    }

    this.apiKey = key;
    this.baseURL = (config.baseURL ?? process.env.QUOLLE_BASE_URL ?? "https://api.quolle.com").replace(
      /\/+$/,
      ""
    );
    this.timeout = config.timeout ?? 30000;
    this.maxRetries = config.maxRetries ?? 3;

    this.emails = new EmailsResource(this);
    this.webhooks = new WebhooksResource();
  }

  /** Set an idempotency key for the NEXT request (legacy; prefer the per-call option). */
  setIdempotencyKey(key: string): this {
    this._idempotencyKey = key;
    return this;
  }

  async request<T>(
    method: string,
    path: string,
    body?: unknown,
    extraHeaders?: Record<string, string>
  ): Promise<T> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      "User-Agent": `quolle-node/${VERSION}`,
      ...extraHeaders,
    };

    // Consume a stateful idempotency key set via setIdempotencyKey().
    if (this._idempotencyKey && !("Idempotency-Key" in headers)) {
      headers["Idempotency-Key"] = this._idempotencyKey;
      this._idempotencyKey = undefined;
    }

    // Retry safety: a 429 (rate limited — never processed) is always safe to
    // retry. A 5xx/network error is only retried for idempotent methods
    // (GET/DELETE) or when an Idempotency-Key is present, so a POST can't double-send.
    const upper = method.toUpperCase();
    const idempotent = upper === "GET" || upper === "DELETE" || "Idempotency-Key" in headers;
    const payload = body !== undefined ? JSON.stringify(body) : undefined;

    let lastError: unknown;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);
      let res: Response;
      try {
        res = await fetch(`${this.baseURL}${path}`, {
          method: upper,
          headers,
          body: payload,
          signal: controller.signal,
        });
      } catch (err) {
        clearTimeout(timeoutId);
        lastError = new QuolleError(`Network error: ${(err as Error).message}`, 0);
        if (attempt < this.maxRetries && idempotent) {
          await sleep(backoffMs(attempt));
          continue;
        }
        throw lastError;
      }
      clearTimeout(timeoutId);

      const text = await res.text();
      let data: Record<string, unknown> = {};
      let isJson = true;
      try {
        data = text ? (JSON.parse(text) as Record<string, unknown>) : {};
      } catch {
        isJson = false;
        data = { raw: text.slice(0, 500) };
      }

      if (res.ok) {
        // A 2xx that isn't JSON (a proxy page, a truncated body) is an error,
        // not a success with no fields.
        if (!isJson) throw new QuolleError("Unexpected non-JSON response from the Quolle API", res.status, data);
        return data as T;
      }

      const message = (data.error as string) || (data.message as string) || `HTTP ${res.status}`;
      const { error: _e, code, ...rest } = data;
      lastError = new QuolleError(message, res.status, rest, typeof code === "string" ? code : undefined);

      const retryable = res.status === 429 || (res.status >= 500 && res.status <= 504 && idempotent);
      if (attempt < this.maxRetries && retryable) {
        await sleep(parseRetryAfter(res.headers.get("retry-after")) ?? backoffMs(attempt));
        continue;
      }
      throw lastError;
    }
    throw lastError ?? new QuolleError("Request failed", 0);
  }
}

// Exponential backoff: 0.5s, 1s, 2s, … capped at 8s, with jitter.
function backoffMs(attempt: number): number {
  return Math.min(500 * 2 ** attempt, 8000) + Math.floor(Math.random() * 250);
}

function parseRetryAfter(header: string | null): number | null {
  if (!header) return null;
  const secs = Number(header);
  if (!Number.isNaN(secs)) return Math.min(secs * 1000, 30000);
  const when = Date.parse(header);
  if (!Number.isNaN(when)) return Math.max(0, Math.min(when - Date.now(), 30000));
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
