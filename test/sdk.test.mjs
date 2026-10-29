import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Quolle, QuolleError, verifyWebhook, attachment } from "../dist/index.js";

// ── Webhook verification ──────────────────────────────────────────────────────
function sign(body, secret, t = Math.floor(Date.now() / 1000)) {
  const v1 = createHmac("sha256", secret).update(`${t}.${body}`).digest("hex");
  return `t=${t},v1=${v1}`;
}

test("verifyWebhook accepts a valid signature and returns the event", () => {
  const body = JSON.stringify({ event: "email.delivered", emailId: "em_1" });
  const evt = verifyWebhook(body, sign(body, "whsec_test"), "whsec_test");
  assert.equal(evt.event, "email.delivered");
});

test("verifyWebhook rejects a tampered body", () => {
  const body = JSON.stringify({ event: "email.delivered" });
  const header = sign(body, "whsec_test");
  assert.throws(() => verifyWebhook('{"event":"hacked"}', header, "whsec_test"), QuolleError);
});

test("verifyWebhook rejects a stale timestamp (replay)", () => {
  const body = "{}";
  const old = Math.floor(Date.now() / 1000) - 10 * 60;
  assert.throws(() => verifyWebhook(body, sign(body, "whsec_test", old), "whsec_test"), /replay/);
});

test("verifyWebhook rejects a wrong secret", () => {
  const body = "{}";
  assert.throws(() => verifyWebhook(body, sign(body, "whsec_a"), "whsec_b"), QuolleError);
});

// ── attachment() helper ───────────────────────────────────────────────────────
test("attachment reads a file and base64-encodes it", () => {
  const p = join(tmpdir(), `quolle-test-${Date.now()}.txt`);
  writeFileSync(p, "hello world");
  try {
    const a = attachment(p, { contentId: "cid1" });
    assert.equal(Buffer.from(a.content, "base64").toString(), "hello world");
    assert.equal(a.contentType, "text/plain");
    assert.equal(a.contentId, "cid1");
    assert.ok(a.filename.endsWith(".txt"));
  } finally {
    unlinkSync(p);
  }
});

// ── Retry semantics (mock fetch) ──────────────────────────────────────────────
function mockFetch(sequence) {
  let i = 0;
  const calls = [];
  global.fetch = async (url, opts) => {
    calls.push({ url, opts });
    const step = sequence[Math.min(i, sequence.length - 1)];
    i++;
    if (step.throw) throw new Error("network down");
    return new Response(JSON.stringify(step.body ?? {}), {
      status: step.status,
      headers: { "content-type": "application/json", ...(step.headers ?? {}) },
    });
  };
  return { calls: () => calls };
}

test("429 is retried then succeeds", async () => {
  const m = mockFetch([{ status: 429 }, { status: 200, body: { id: "em_ok" } }]);
  const q = new Quolle({ apiKey: "qle_test", maxRetries: 3, timeout: 2000 });
  const r = await q.emails.send({ from: "a@b.com", to: "x@y.com", subject: "Hi", html: "<p>x</p>" });
  assert.equal(r.id, "em_ok");
  assert.equal(m.calls().length, 2);
});

test("POST 500 is NOT retried without an idempotency key", async () => {
  const m = mockFetch([{ status: 500, body: { error: "boom" } }]);
  const q = new Quolle({ apiKey: "qle_test", maxRetries: 3, timeout: 2000 });
  await assert.rejects(
    q.emails.send({ from: "a@b.com", to: "x@y.com", subject: "Hi", html: "<p>x</p>" }),
    QuolleError
  );
  assert.equal(m.calls().length, 1);
});

test("POST 500 IS retried with an idempotency key", async () => {
  const m = mockFetch([{ status: 500 }, { status: 200, body: { id: "em_ok" } }]);
  const q = new Quolle({ apiKey: "qle_test", maxRetries: 3, timeout: 2000 });
  const r = await q.emails.send(
    { from: "a@b.com", to: "x@y.com", subject: "Hi", html: "<p>x</p>" },
    { idempotencyKey: "k1" }
  );
  assert.equal(r.id, "em_ok");
  assert.equal(m.calls().length, 2);
  assert.equal(m.calls()[0].opts.headers["Idempotency-Key"], "k1");
});

test("GET 500 is retried (idempotent method)", async () => {
  const m = mockFetch([{ status: 500 }, { status: 200, body: { email: { id: "em_1" } } }]);
  const q = new Quolle({ apiKey: "qle_test", maxRetries: 3, timeout: 2000 });
  const email = await q.emails.get("em_1");
  assert.equal(email.id, "em_1");
  assert.equal(m.calls().length, 2);
});

test("env var fallback + missing key throws", () => {
  process.env.QUOLLE_API_KEY = "qle_from_env";
  assert.doesNotThrow(() => new Quolle());
  delete process.env.QUOLLE_API_KEY;
  assert.throws(() => new Quolle(), /API key is required/);
});

// ── Alignment with the API ────────────────────────────────────────────────────
test("errors expose the API's code, separately from the message", async () => {
  mockFetch([{ status: 429, body: { code: "warmup_limit_exceeded", error: "Warm-up cap reached" } }]);
  const q = new Quolle({ apiKey: "qle_test", maxRetries: 0, timeout: 2000 });
  await assert.rejects(
    q.emails.send({ from: "a@b.com", to: "x@y.com", subject: "Hi", html: "<p>x</p>" }),
    (e) => e instanceof QuolleError && e.code === "warmup_limit_exceeded" && e.message === "Warm-up cap reached" && !("code" in (e.data ?? {}))
  );
});

test("type: marketing is sent as-is", async () => {
  const m = mockFetch([{ status: 200, body: { id: "em_m" } }]);
  const q = new Quolle({ apiKey: "qle_test", timeout: 2000 });
  await q.emails.send({ from: "a@b.com", to: "x@y.com", subject: "Hi", html: "<p>x</p>", type: "marketing" });
  assert.equal(JSON.parse(m.calls()[0].opts.body).type, "marketing");
});

test("a non-JSON 2xx is an error, not an empty success", async () => {
  global.fetch = async () => new Response("<html>proxy</html>", { status: 200 });
  const q = new Quolle({ apiKey: "qle_test", timeout: 2000 });
  await assert.rejects(q.emails.get("em_1"), /non-JSON/);
});

test("sendUSSD sends the API's USSD shape and is never retried on 5xx", async () => {
  const m = mockFetch([{ status: 502 }, { status: 200, body: { queued: true, ref: "em_u" } }]);
  const q = new Quolle({ apiKey: "qle_test", maxRetries: 3, timeout: 2000 });
  await assert.rejects(
    q.emails.sendUSSD({ from: "a@b.com", phoneNumber: "+2348000000000", subject: "Receipt", html: "<p>x</p>" }),
    QuolleError
  );
  assert.equal(m.calls().length, 1);
  assert.equal(JSON.parse(m.calls()[0].opts.body).phoneNumber, "+2348000000000");
});

// ── Quota 429s are not retried (they reset at a fixed time, not in seconds) ───
for (const code of ["daily_quota_exceeded", "warmup_limit_exceeded"]) {
  test(`429 ${code} is thrown at once, not retried`, async () => {
    const m = mockFetch([{ status: 429, body: { code, error: "cap reached" } }, { status: 200, body: { id: "em_ok" } }]);
    const q = new Quolle({ apiKey: "qle_test", maxRetries: 3, timeout: 2000 });
    await assert.rejects(
      q.emails.send({ from: "a@b.com", to: "x@y.com", subject: "Hi", html: "<p>x</p>" }),
      (e) => e instanceof QuolleError && e.code === code
    );
    assert.equal(m.calls().length, 1);
  });
}

test("a 429 with a long Retry-After is thrown, not slept through", async () => {
  const m = mockFetch([
    { status: 429, body: { code: "rate_limit_exceeded", error: "slow down" }, headers: { "retry-after": "3600" } },
    { status: 200, body: { id: "em_ok" } },
  ]);
  const q = new Quolle({ apiKey: "qle_test", maxRetries: 3, timeout: 2000 });
  await assert.rejects(q.emails.send({ from: "a@b.com", to: "x@y.com", subject: "Hi", html: "<p>x</p>" }), QuolleError);
  assert.equal(m.calls().length, 1);
});

// ── Domains, API keys, webhook endpoints (K8) ────────────────────────────────
test("domains: list, create, get, records, verify, remove hit the right routes", async () => {
  const m = mockFetch([
    { status: 200, body: { domains: [{ id: "d1", domain: "mail.acme.com" }] } },
    { status: 201, body: { domain: { id: "d2" }, dnsRecords: [], isCloudflare: false, message: "ok" } },
    { status: 200, body: { domain: { id: "d1" } } },
    { status: 200, body: { records: [] } },
    { status: 200, body: { status: "verified" } },
    { status: 200, body: { message: "Domain removed" } },
  ]);
  const q = new Quolle({ apiKey: "qle_test", timeout: 2000 });
  assert.equal((await q.domains.list())[0].domain, "mail.acme.com");
  assert.equal((await q.domains.create("mail.acme.com")).domain.id, "d2");
  assert.equal((await q.domains.get("d1")).id, "d1");
  await q.domains.records("d1");
  await q.domains.verify("d1");
  await q.domains.remove("d1");
  const calls = m.calls().map((c) => `${c.opts.method} ${new URL(c.url).pathname}`);
  assert.deepEqual(calls, [
    "GET /v1/domains", "POST /v1/domains", "GET /v1/domains/d1",
    "GET /v1/domains/d1/records", "POST /v1/domains/d1/recheck", "DELETE /v1/domains/d1",
  ]);
  assert.deepEqual(JSON.parse(m.calls()[1].opts.body), { domain: "mail.acme.com" });
});

test("apiKeys: list, create, remove", async () => {
  const m = mockFetch([
    { status: 200, body: { keys: [{ id: "k1", scope: "full" }] } },
    { status: 201, body: { key: "qle_new", id: "k2", name: "ci", scope: "sending", domains: [], expiresAt: null } },
    { status: 200, body: { message: "API key deleted" } },
  ]);
  const q = new Quolle({ apiKey: "qle_test", timeout: 2000 });
  assert.equal((await q.apiKeys.list())[0].id, "k1");
  assert.equal((await q.apiKeys.create({ name: "ci", scope: "sending" })).key, "qle_new");
  await q.apiKeys.remove("k2");
  assert.deepEqual(m.calls().map((c) => `${c.opts.method} ${new URL(c.url).pathname}`), [
    "GET /v1/keys", "POST /v1/keys", "DELETE /v1/keys/k2",
  ]);
  assert.deepEqual(JSON.parse(m.calls()[1].opts.body), { name: "ci", scope: "sending" });
});

test("webhooks: endpoint management routes", async () => {
  const m = mockFetch([{ status: 200, body: { webhooks: [], deliveries: [], events: [] } }]);
  const q = new Quolle({ apiKey: "qle_test", timeout: 2000 });
  await q.webhooks.events();
  await q.webhooks.list();
  await q.webhooks.create({ url: "https://x.io/h", events: ["email.delivered"] });
  await q.webhooks.get("w1");
  await q.webhooks.update("w1", { events: ["email.bounced"] });
  await q.webhooks.test("w1");
  await q.webhooks.deliveries("w1", { status: "failed", limit: 10 });
  await q.webhooks.redeliver("w1", "dl1");
  await q.webhooks.rotateSecret("w1");
  await q.webhooks.remove("w1");
  assert.deepEqual(m.calls().map((c) => `${c.opts.method} ${new URL(c.url).pathname}${new URL(c.url).search}`), [
    "GET /v1/webhooks/events", "GET /v1/webhooks", "POST /v1/webhooks", "GET /v1/webhooks/w1",
    "PATCH /v1/webhooks/w1", "POST /v1/webhooks/w1/test", "GET /v1/webhooks/w1/deliveries?status=failed&limit=10",
    "POST /v1/webhooks/w1/deliveries/dl1/redeliver", "POST /v1/webhooks/w1/rotate-secret", "DELETE /v1/webhooks/w1",
  ]);
});

test("a sending-only key on a management call surfaces restricted_api_key", async () => {
  mockFetch([{ status: 403, body: { code: "restricted_api_key", error: "This API key can only send email." } }]);
  const q = new Quolle({ apiKey: "qle_test", maxRetries: 3, timeout: 2000 });
  await assert.rejects(q.apiKeys.list(), (e) => e instanceof QuolleError && e.code === "restricted_api_key" && e.statusCode === 403);
});
