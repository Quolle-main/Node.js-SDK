# Changelog

All notable changes to this package. Versions follow [Semantic Versioning](https://semver.org).

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
