# Changelog

All notable changes to this package. Versions follow [Semantic Versioning](https://semver.org).

## 0.4.0 — 2026-10-29

### Added
- `quolle.domains`: `list`, `create`, `get`, `records`, `verify`, `remove`. Add a sending domain, get its DNS records, check DNS on demand, and see verification and warm-up state.
- `quolle.apiKeys`: `list`, `create`, `remove`. Create keys (full access or sending-only, optionally limited to some domains, optionally expiring) and revoke them.
- `quolle.webhooks` manages endpoints as well as verifying deliveries: `list`, `create`, `get`, `update`, `remove`, `test`, `deliveries`, `redeliver`, `rotateSecret`, `events`.

These need a full-access API key; a sending-only key gets `restricted_api_key`. Requires Quolle API support for API-key access to `/v1/keys` and `/v1/webhooks` (live from 29 Oct 2026).

## 0.3.1 — 2026-10-29

- Published from GitHub Actions through npm Trusted Publishing, with a provenance attestation linking this version to the commit and workflow that built it. No code changes.
- `package.json` points at the repository's current home, `github.com/Quolle-main/Node.js-SDK`.

## 0.3.0 — 2026-10-29

### Added
- `verifyWebhook()` for `Quolle-Signature`, `attachment()` helper, retries with backoff.
- `QuolleError.code`: the API's machine-readable error code.
- `type: "transactional" | "marketing"` on send; `WebhookEvent.eventId`; `complained` / `suppressed` statuses.

### Changed
- Quota limits are no longer retried. `daily_quota_exceeded` and `warmup_limit_exceeded` (and any 429 whose `Retry-After` is over 60 seconds) are thrown at once with their code, instead of the client waiting, possibly for hours, before failing. Ordinary rate limits are still retried.
- **Requires Node.js 20+** (was 18, which is past end of life).
- **Breaking:** `sendUSSD` takes the API's real shape (`to` or `phoneNumber`, `html`, `subject`) and no longer accepts an idempotency key, which the endpoint ignored.
- A 2xx response that isn't JSON now throws instead of returning `{ raw }`.

## 0.2.1

Earlier release.
