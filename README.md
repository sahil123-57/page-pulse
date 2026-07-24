# Page Pulse

A production-grade URL audit service — built for the Digital Heroes SDE task.

Given a URL, it fetches the page and returns key diagnostics: status code, response time, HTTPS usage, page size, title, and meta description.

**Live URL:** https://page-pulse-mekv.onrender.com

> Note: hosted on Render's free tier, which spins down after inactivity. The first request after idling may take 30-50 seconds to respond while the instance wakes up.

## Features

- Input validation (Zod)
- Per-request timeout (10s) on outbound fetches, with distinct error codes for timeout vs unreachable vs bad upstream status
- In-memory TTL cache (configurable), keyed on a normalized URL
- Concurrency limiting on outbound audits
- Per-IP rate limiting (60 req/min)
- Structured JSON logging (pino) with a request ID on every request/response
- Centralized error handling with a consistent error shape
- Unit + integration tests (Vitest + Supertest)
- CI on every push (GitHub Actions)

## Running locally

```bash
npm install
npm run dev
```

Server starts on `http://localhost:3000` (configurable via `PORT` env var).

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | Port the server listens on |
| `CACHE_TTL_SECONDS` | `300` | How long audit results are cached |
| `MAX_CONCURRENT_AUDITS` | `20` | Max simultaneous outbound audit requests |

Copy `.env.example` to `.env` and adjust as needed.

## API Contract

### `GET /health`

Returns `{ "status": "ok" }` — used for uptime checks.

### `POST /audit`

**Request body:**
```json
{ "url": "https://example.com" }
```

**Success response — `200 OK`:**
```json
{
  "url": "https://example.com",
  "statusCode": 200,
  "isHttps": true,
  "responseTimeMs": 342,
  "pageSizeBytes": 1256,
  "title": "Example Domain",
  "metaDescription": null,
  "cached": false,
  "cachedAt": null
}
```

If served from cache, `cached: true`.

**Error responses** — all errors follow this shape:
```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable explanation",
    "requestId": "uuid-for-support-reference"
  }
}
```

| Status | Code | When it happens |
|---|---|---|
| 400 | `INVALID_INPUT` | Request body is missing `url` or it's not a valid URL |
| 429 | `RATE_LIMITED` | More than 60 requests/min from the same IP |
| 429 | `TOO_MANY_CONCURRENT_AUDITS` | Server is at its concurrency cap |
| 502 | `UPSTREAM_UNREACHABLE` | DNS failure / connection refused on the target URL |
| 502 | `UPSTREAM_ERROR_STATUS` | Target URL responded with a non-2xx status |
| 504 | `UPSTREAM_TIMEOUT` | Target URL did not respond within 10 seconds |
| 500 | `INTERNAL_ERROR` | Unexpected server error |

Every response (success or error) includes an `X-Request-Id` header for tracing.

## Testing

```bash
npm test
```

6 tests covering input validation, successful audits, cache hits, and all upstream failure modes.

## Assumptions made

- "Audit" is interpreted as: HTTP status, response time, HTTPS check, page size, title, and meta description — not a full SEO/Lighthouse-style audit, to keep scope focused on the production-hardening requirements the task emphasizes.
- Caching uses in-memory storage rather than Redis, since this is a single-instance deployment; the code is structured so swapping in Redis would only require changing `TTLCache`'s implementation, not its call sites.

## AI usage disclosure

I used Claude to scaffold the initial project structure and get working implementations of the validation, caching, and error-handling layers, since I hadn't built a production-hardened Express service like this before. Along the way I hit and personally debugged several real issues: a zod version mismatch that was silently causing 500s instead of 400s (traced by adding debug logging), a broken GitHub Actions workflow with no trigger defined, and a TypeScript `moduleResolution` deprecation that broke the CI build under a newer TS version but not locally. I wrote the README's assumptions section and made the scope call on what "audit" means for this service myself.
