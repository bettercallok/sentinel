---
title: Sentinel API
emoji: 🛡️
colorFrom: blue
colorTo: indigo
sdk: docker
pinned: false
---

> **Note:** The configuration table above is required for deploying this backend to Hugging Face Spaces.

# sentinel

sentinel is a web3-enabled application featuring a react + typescript frontend and a django rest api backend. the system supports solana wallet authentication and a token-gated encrypted file vault. users can authenticate using their solana wallets (like phantom) via a challenge-response signature mechanism. once authenticated, users can upload files and restrict downloads to holders of specific solana nfts.

## features

- **solana wallet authentication**: secure login without passwords. the backend issues a human-readable, domain-bound sign-in message (nonce + timestamp) which the wallet signs. the signature is verified with PyNaCl, and each challenge can only be used once.
- **client-side encryption**: files are encrypted with AES-256-GCM in the browser. the server only ever stores ciphertext and never sees the key.
- **token-gated file vault**: upload encrypted documents and lock them behind NFT ownership.
- **share links**: send `/?doc=<id>` to NFT holders so they can download and decrypt. you can also embed the key in the URL fragment (`#key=…`), which browsers never send to the server.
- **on-chain verification**: queries a Solana RPC to check that the downloader's wallet holds the required NFT mint before serving the file. RPC outages return `503` instead of a misleading "access denied".
- **jwt session management**: issues a short-lived JWT (with `iss`/`aud` claims) after wallet verification. sessions survive page reloads and end automatically on expiry or when you switch accounts in Phantom.

see [`docs/AUDIT.md`](docs/AUDIT.md) for the security audit and the reasoning behind these design choices.

## setup instructions

### using docker (recommended for backend and database)

1. clone the repository.
2. run the docker containers using docker-compose:
   ```bash
   docker-compose up --build
   ```
3. the backend api will be available at http://localhost:8000.

> **note on production databases**: the default `docker-compose.yml` uses a dockerized postgresql instance. for a production token-gated vault, we highly recommend using a managed postgres database (e.g. aws rds, supabase) by overriding the `DATABASE_URL` in your `.env`. if using the provided docker setup in production, ensure you have automated volume backups configured for `postgres_data`.

### frontend setup (react + typescript + vite)

1. navigate to the frontend directory:
   ```bash
   cd frontend
   ```
2. install the dependencies:
   ```bash
   npm install
   ```
3. start the vite dev server:
   ```bash
   npm run dev
   ```
4. the frontend will be available at http://localhost:5173. it automatically proxies api requests to the django backend on port 8000.

### local backend development (without docker)

1. navigate to the root directory.
2. create and activate a virtual environment:
   ```bash
   python -m venv venv
   source venv/bin/activate  # on windows use: venv\Scripts\activate
   ```
3. install the dependencies:
   ```bash
   pip install -r requirements.txt
   ```
4. run database migrations:
   ```bash
   python manage.py migrate
   ```
5. start the django development server:
   ```bash
   python manage.py runserver
   ```

## project structure

- `core/`: django project settings, configuration, and root URL routing.
- `authentication/`: django app managing wallet login, nonces, signature verification, and JWT generation.
- `vault/`: django app handling file uploads, retrieving lists of files, and verifying NFT ownership for token-gated downloads.
- `frontend/`: react + typescript single-page application built with vite, featuring tailwindcss-like modern vanilla styling.

## api endpoints

all authenticated endpoints expect `Authorization: Bearer <token>`.

### authentication
- `POST /api/auth/nonce/`: create a login challenge for a wallet.
  - **body**: `{"wallet_address": "..."}`
  - **returns**: `{"wallet", "nonce", "message"}`. the wallet must sign `message` exactly as returned.
- `POST /api/auth/verify/`: verify the signature over `message` and return a JWT.
  - **body**: `{"wallet_address": "...", "signature": [64 bytes] | "<base58>"}`
  - **returns**: `{"token", "wallet_address", "expires_at", ...}`
- `GET /api/auth/me/`: validate the current token and return `{"wallet_address", "expires_at"}`.

### vault
- `POST /api/vault/upload/` (multipart): `encrypted_file`, `file_name`, `required_nft_address`. the uploader is always taken from the JWT.
- `GET /api/vault/files/`: list documents uploaded by the authenticated wallet.
- `GET /api/vault/documents/<public_id>/`: metadata for a share link (file name, size, NFT gate, `is_owner`).
- `DELETE /api/vault/documents/<public_id>/`: delete a document and its blob (uploader only).
- `GET /api/vault/documents/<public_id>/download/`: download the encrypted blob. the uploader always has access; anyone else must hold the required NFT, which is checked on-chain. (`GET /api/vault/download/<id>/` is kept for older clients.)

### operations
- `GET /api/health/`: health probe (checks the database).

## configuration

all settings come from environment variables. see [`.env.example`](.env.example) for the full list, including:
`JWT_SECRET`, `SIWS_DOMAIN`, `ADMIN_URL`, `CSRF_TRUSTED_ORIGINS`, `SECURE_SSL_REDIRECT`, `SECURE_HSTS_SECONDS`, `THROTTLE_*`, `VAULT_MAX_UPLOAD_BYTES` and `SOLANA_RPC_URL`.

## testing

run the backend test suite:
```bash
DEBUG=True python manage.py test
```

lint and type-check the frontend:
```bash
cd frontend && npm run lint && npm run build
```

both run in CI on every pull request (`.github/workflows/ci.yml`).

a python simulator script, `wallet_test.py`, exercises the sign-in flow against a running server without needing a browser wallet:
```bash
python wallet_test.py                                   # http://localhost:8000
SENTINEL_API=https://your-api.example.com python wallet_test.py
```
to run django tests:
```bash
python manage.py test
```
