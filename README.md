# Quolle Node.js SDK

Official Node.js / TypeScript client for the [Quolle](https://quolle.com) email API.

## Install

```bash
npm install @quolle/sdk
```

Requires Node.js 18+. No third-party dependencies.

## Quick start

```typescript
import { Quolle } from "@quolle/sdk";

const quolle = new Quolle("qle_..."); // or set QUOLLE_API_KEY

const { id } = await quolle.emails.send({
  from: "hello@mail.yourdomain.com",
  to: "customer@example.com",
  subject: "Welcome!",
  html: "<h1>Thanks for signing up</h1>",
});

console.log("Queued:", id);
```

You can also configure the client with an object:

```typescript
const quolle = new Quolle({ apiKey: "qle_...", maxRetries: 5, timeout: 20000 });
```

## Sending

### Multiple recipients

```typescript
await quolle.emails.send({
  from: "hello@mail.yourdomain.com",
  to: ["a@example.com", "b@example.com"],
  subject: "Announcement",
  html: "<p>Hello everyone</p>",
});
```

### Templates

```typescript
await quolle.emails.send({
  from: "hello@mail.yourdomain.com",
  to: "customer@example.com",
  template: "welcome-email",
  variables: { firstName: "Amaka", planName: "Starter" },
});
```

### Scheduled send

```typescript
await quolle.emails.send({
  from: "hello@mail.yourdomain.com",
  to: "customer@example.com",
  subject: "Your weekly digest",
  html: "<p>Here's what happened this week.</p>",
  scheduledAt: "2026-12-25T09:00:00.000Z",
});
```

### Idempotency

Pass an idempotency key so retries never send twice:

```typescript
await quolle.emails.send(
  { from: "billing@mail.yourdomain.com", to: "customer@example.com",
    subject: "Invoice #1234", html: "<p>Your invoice is attached.</p>" },
  { idempotencyKey: "order_invoice_12345" }
);
```

### Batch

Up to 100 emails in one all-or-nothing request:

```typescript
const { queued, ids } = await quolle.emails.sendBatch([
  { from: "hello@mail.yourdomain.com", to: "a@example.com", subject: "Hi Alice", html: "<p>Hi Alice</p>" },
  { from: "hello@mail.yourdomain.com", to: "b@example.com", subject: "Hi Bob", html: "<p>Hi Bob</p>" },
]);
console.log(`Queued ${queued}:`, ids);
```

### Attachments

Attach files with `attachments`. Each item has a `filename` and **either** `content`
(base64 bytes) **or** `path` (a URL Quolle fetches at send time). The `attachment()`
helper reads and encodes a local file for you. Up to 20 files, 10 MB total.

```typescript
import { Quolle, attachment } from "@quolle/sdk";

await quolle.emails.send({
  from: "billing@mail.yourdomain.com",
  to: "customer@example.com",
  subject: "Your invoice",
  html: "<p>Invoice attached.</p>",
  attachments: [
    attachment("./invoice.pdf"),                       // local file → base64
    { filename: "terms.pdf", path: "https://files.acme.com/terms.pdf" }, // remote URL
  ],
});
```

Set `contentId` to embed an image inline: `attachment("./logo.png", { contentId: "logo" })`,
then reference it in your HTML with `<img src="cid:logo">`.

## Retrieve & cancel

```typescript
const email = await quolle.emails.get("a1b2c3d4-...");
console.log(email.status);      // queued | sending | sent | delivered | bounced | failed
console.log(email.opensCount);

await quolle.emails.cancel("a1b2c3d4-..."); // only while status === "scheduled"
```

## Error handling

```typescript
import { Quolle, QuolleError } from "@quolle/sdk";

try {
  await quolle.emails.send({ from: "hello@mail.yourdomain.com", to: "customer@example.com",
                             subject: "Welcome!", html: "<h1>Welcome</h1>" });
} catch (err) {
  if (err instanceof QuolleError) {
    console.log(err.statusCode); // e.g. 402
    console.log(err.code);       // e.g. "monthly_quota_exceeded" — branch on this
    console.log(err.message);    // e.g. "Monthly limit reached"
    console.log(err.data);       // extra fields, e.g. { limit: 3000 }
  }
}
```

## Testing your integration

Send to a reserved test address to simulate any outcome without touching your
sending reputation: `delivered@test.quolle.com`, `bounced@test.quolle.com`,
`complained@test.quolle.com`, `suppressed@test.quolle.com`.

## Verifying webhooks

Confirm an incoming webhook really came from Quolle. Pass the **raw** request body,
the `Quolle-Signature` header, and your signing secret (`whsec_…`):

```typescript
import { Quolle } from "@quolle/sdk";

// In your webhook route (use the RAW body — do not re-serialize):
try {
  const event = quolle.webhooks.verify(
    rawBody,                          // string or Buffer
    req.headers["quolle-signature"] as string,
    "whsec_your_signing_secret"
  );
  console.log(event.event);          // e.g. "email.delivered"
} catch (err) {
  res.status(400).end();             // reject
}
```

`verifyWebhook(...)` is also exported standalone. Verification checks the HMAC-SHA256
signature and rejects timestamps outside a 5-minute window (replay protection).

## Automatic retries

Transient failures — HTTP 429 (rate limit) and 5xx, plus network errors — are retried
automatically with exponential backoff, honoring the `Retry-After` header. To avoid
double-sending, a POST is only retried on a 5xx/network error when you pass an idempotency
key; a 429 is always safe to retry (the request was never processed). Tune with
`maxRetries` on the constructor (default 3).

Quota limits are the exception. `daily_quota_exceeded` and `warmup_limit_exceeded` (and
any `Retry-After` over 60 seconds) are thrown immediately, because they reset at a fixed
time, not in seconds. Check `err.code` and queue the send for later.

## License

MIT
