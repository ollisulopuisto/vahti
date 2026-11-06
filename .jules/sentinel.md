## 2026-11-06 - Rate limiting gap in a well-secured codebase

**Vulnerability:** The daemon's HTTP server had no rate limiting on any API endpoint, despite extensive other security controls (HMAC auth, timing-safe comparison, replay protection, SQL parameterization, SSRF protection, path validation, CSP headers, child-process sandboxing).

**Learning:** Even a very security-conscious codebase can miss basic DoS protection. Every endpoint was individually well-guarded, but there was no global request throttle. A runaway local script could repeatedly call /api/refresh (spawns child processes), /api/ask (uses AI model resources), or /api/ingest (writes to the vault).

**Prevention:** When reviewing a codebase with strong per-endpoint controls, check for missing global protections (rate limiting, connection limits, request size aggregation) that operate across all endpoints rather than per-route.
