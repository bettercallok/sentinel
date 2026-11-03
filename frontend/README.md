# Sentinel frontend

React 19 + TypeScript + Vite single-page app for the Sentinel NFT-gated vault.

```bash
npm install
npm run dev     # http://localhost:5173, proxies /api to http://localhost:8000
npm run lint
npm run build
```

## Environment

| Variable | Purpose |
|----------|---------|
| `VITE_API_URL` | Base URL of the Django API in production (e.g. `https://sentinel-api.koyeb.app`). Leave empty in dev to use the Vite proxy. |
| `VITE_MAX_UPLOAD_BYTES` | Optional. Must match the backend `VAULT_MAX_UPLOAD_BYTES` (default 50 MB). |

## Layout

- `src/lib/` — API client, AES-GCM crypto, Phantom wallet, share-link and formatting helpers
- `src/context/AuthContext.tsx` — wallet sign-in, session restore and auto sign-out
- `src/screens/` — landing, dashboard, upload success and shared-document screens
- `src/components/` — modal, toast, drop zone, navbar
