# Sentinel — Project Audit & Improvement Plan

This document records a full audit of the Sentinel codebase (Django REST backend +
React/Vite frontend). For each finding it gives a severity, where the problem is, and what
was done about it. Every item marked **Fixed** or **Added** is implemented in the same
change as this document.

Severity scale: **Critical** (broken core flow or exploitable), **High**, **Medium**, **Low**.

---

## 1. Bugs found

| # | Severity | Finding | Location | Resolution |
|---|----------|---------|----------|------------|
| B1 | Critical | Any upload larger than ~2.5 MB returns **HTTP 500**. `request.data.copy()` deep-copies the multipart `QueryDict`, which fails on the `TemporaryUploadedFile` Django uses above `FILE_UPLOAD_MAX_MEMORY_SIZE` (`TypeError: cannot pickle 'BufferedRandom'`). Reproduced before the fix. | `vault/views.py` `FileUploadView` | **Fixed** — uploader wallet is injected with `serializer.save(uploader_wallet=…)`; no copy of request data. Regression test uploads a 3 MB file. |
| B2 | High | Token-gating could not be used from the UI. The vault only lists *your own* files and there was no way for an NFT holder to reach someone else's document. | frontend | **Added** — share links (see F1). |
| B3 | High | A page reload always logged the user out even with a valid JWT in `localStorage`, and an expired token could leave the app in a stuck state (two earlier commits tried to fix this and were reverted). | `frontend/src/context/AuthContext.tsx` | **Fixed** — on start-up the stored token is checked locally for expiry, then validated against the new `GET /api/auth/me/`; any 401 from the API clears the session. |
| B4 | Medium | A malformed `signature` (string, nested list, values > 255, wrong length) raised `TypeError` → 500 instead of 400/401. | `authentication/views.py` | **Fixed** — strict validation of the signature (64-byte list or base58 string). |
| B5 | Medium | RPC failures were silently treated as "wallet does not hold the NFT", returning a misleading 403. | `vault/views.py` `check_nft_ownership` | **Fixed** — RPC errors now return **503** with a retry message; errors are logged instead of `print`ed. |
| B6 | Medium | `Content-Disposition` was built by string interpolation from a user-controlled file name. A name containing `"` broke the header and a name with CR/LF produced a 500. | `vault/views.py` | **Fixed** — file names are sanitised on upload, and the download uses `FileResponse(as_attachment=True, filename=…)`, which RFC 5987-encodes the header. |
| B7 | Low | `URL.revokeObjectURL` was called synchronously after `a.click()`, which can cancel the download in some browsers. | `DashboardScreen.tsx` | **Fixed** — revocation is deferred. |
| B8 | Low | Info toasts showed a ✓ icon, so "Encrypting…" looked like success. | `Toast.tsx` | **Fixed**. |
| B9 | Low | Upload errors only said "check the console"; the server's error message was discarded. | `DashboardScreen.tsx`, `api.ts` | **Fixed** — API errors are parsed and shown in the toast. |

## 2. Security findings

| # | Severity | Finding | Resolution |
|---|----------|---------|------------|
| S1 | High | **The sign-in message was a bare UUID.** A signature over a meaningless string can be phished by any other site that shows the user a UUID to sign, and the user can't tell what they are approving. | **Fixed** — the backend issues a human-readable, domain-bound sign-in message (SIWS-style: domain, wallet, purpose, nonce, issued-at). It is rebuilt server-side from stored data at verification time, so the client cannot change it. |
| S2 | High | **Nonce replay race.** The nonce was read, verified, then deleted, so two concurrent verify requests could both succeed with one signature. | **Fixed** — the nonce is consumed atomically (`DELETE … WHERE id AND nonce`); only the request that actually deletes the row gets a token. |
| S3 | High | **Blobs exposed outside the gate.** In `DEBUG`, `/media/` served every blob publicly at a predictable path (`secure_blobs/<original-name>.enc`), bypassing the NFT check. The serializer also returned `encrypted_file` (a pre-signed S3 URL when S3 is on) in API responses. | **Fixed** — `/media/` is no longer routed; blobs are stored under random UUID names; `encrypted_file` is write-only in the API. |
| S4 | Medium | No input validation on wallet / mint addresses: any string up to 255 chars could create nonce rows (DB spam), and invalid mints were stored. | **Fixed** — addresses must base58-decode to 32 bytes. Expired nonces are purged when new ones are issued. |
| S5 | Medium | The JWT check was copy-pasted into three views, and DRF's `UserRateThrottle` never applied because `request.user` was always anonymous. | **Fixed** — one DRF authentication class (`WalletJWTAuthentication`) plus a permission class. Throttling is per wallet for authenticated calls, with a stricter `auth` scope (default `10/minute`) on nonce/verify. JWTs now carry `iss`/`aud`, which are checked on decode. A separate `JWT_SECRET` can be set. |
| S6 | Medium | Missing production hardening: no HSTS, secure-cookie flags, proxy SSL header or `CSRF_TRUSTED_ORIGINS`. `CORS_ALLOW_CREDENTIALS=True` was not needed (bearer tokens) and the browsable API was enabled in production. | **Fixed** — env-driven security settings (see `.env.example`), `CORS_ALLOW_CREDENTIALS=False`, JSON-only renderer when `DEBUG=False`, `Cache-Control: no-store` on downloads, `X-Frame-Options: DENY`. |
| S7 | Medium | Django admin was mounted at a guessable `/admin/` with no models registered. | **Fixed** — the path is configurable via `ADMIN_URL`, and models are registered (read-mostly) for operations. |
| S8 | Low | Upload size was only checked after the whole body had been received; the frontend didn't check size before encrypting. | **Fixed** — `VAULT_MAX_UPLOAD_BYTES` (default 50 MB) is enforced in the serializer, and the frontend rejects files over the limit before encrypting. |
| S9 | Low | The decryption-key input was a plain text field (shoulder-surfing, autofill). | **Fixed** — it is now a password field with a show/hide toggle, and the key format is validated before decrypting. |
| S10 | Low | The unused `solana` package (large dependency tree) was in `requirements.txt`. Stray `test.txt` was in the repo root. | **Fixed** — removed. |

### Known limitations / not changed
- **JWT in `localStorage`.** This is readable by any XSS. The app renders no user HTML and React escapes output, so the risk is limited. Moving to an HttpOnly cookie would also mean adding CSRF handling across origins (Vercel → API host). Left as a follow-up.
- **Content-Security-Policy** for the frontend belongs in the hosting config (e.g. `vercel.json`). The API origin is deployment-specific, so it was not added here.
- **NFT verification** checks "holds ≥1 token of this mint". It does not check collection membership; that would need the Metaplex metadata / DAS API.

## 3. New features

| # | Feature | Details |
|---|---------|---------|
| F1 | **Share links for token-gated access** | Every document gets a random `public_id` (UUID). The owner can copy a link `/?doc=<id>`, or optionally a link that embeds the key in the URL *fragment* (`#key=…`). Browsers never send the fragment to the server, so the server still never sees the key. Recipients connect their wallet, see the document details and NFT gate, and download/decrypt if they hold the NFT. New endpoint `GET /api/vault/documents/<uuid>/`. |
| F2 | **Delete documents** | `DELETE /api/vault/documents/<uuid>/` (owner only) removes the row and the stored blob. UI asks for confirmation. |
| F3 | **Session restore** | `GET /api/auth/me/` plus a startup check: a reload keeps you signed in until the JWT expires. The session also ends automatically if Phantom switches to a different account. |
| F4 | **File size tracking** | New `file_size` field, shown in the vault table and on the success/shared screens. |
| F5 | **Health check** | `GET /api/health/` checks the DB, for container/platform health checks. |
| F6 | **Key backup** | The success screen can download the key as a `.txt` file as well as copy it. |
| F7 | **Tests + CI** | 50 backend tests covering auth (happy path, replay, expiry, malformed input, wrong key) and the vault (auth, 3 MB upload regression, sanitisation, gating with mocked RPC, RPC outage → 503, delete, share metadata). A GitHub Actions workflow runs the backend tests and the frontend lint + build. |

## 4. Small design changes

- The key modal now closes on `Esc` or a click on the backdrop, autofocuses its input, uses `role="dialog"`/`aria-modal`, and has a show/hide toggle for the key.
- Toasts use `aria-live="polite"` and have a distinct info icon.
- The vault table has a **Size** column and an action group (Download · Share · Delete). Delete uses a subtle destructive style.
- Upload and decryption errors now read in plain language (e.g. "Wrong key, or the file is corrupted"), not raw WebCrypto errors.
- A "restoring session" state stops the landing page flashing on reload.
- The footer shows the version from one constant.

## 5. Implementation order

1. Backend auth: validation, SIWS message, atomic nonce, JWT helpers, DRF auth class, `/me`.
2. Backend vault: serializer validation, upload fix, UUID blobs, `public_id` + `file_size` migration, metadata/delete endpoints, safe download, RPC 503.
3. Settings hardening, health endpoint, admin, requirements, `.env.example`.
4. Backend test suite.
5. Frontend: API client, session restore, share links, delete, validation, UI polish.
6. CI workflow, README/API docs, `wallet_test.py` update.
7. Verification: `manage.py test`, `makemigrations --check`, `npm run lint`, `npm run build`, and an end-to-end browser run with a simulated Phantom wallet.
