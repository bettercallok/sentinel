# sentinel

sentinel is a web3-enabled application featuring a react + typescript frontend and a django rest api backend. the system supports solana wallet authentication and a token-gated encrypted file vault. users can authenticate using their solana wallets (like phantom) via a challenge-response signature mechanism. once authenticated, users can upload files and restrict downloads to holders of specific solana nfts.

## features

- **solana wallet authentication**: secure login without passwords. the backend generates a challenge nonce which is signed by the user's wallet. the signature is verified using PyNaCl and base58.
- **token-gated file vault**: upload encrypted documents and lock them behind NFT ownership.
- **on-chain verification**: queries the Solana mainnet RPC to check if a downloader's wallet holds the required NFT mint before serving the file.
- **jwt session management**: issues a secure, short-lived JSON Web Token after successful wallet verification.

## setup instructions

### using docker (recommended for backend and database)

1. clone the repository.
2. run the docker containers using docker-compose:
   ```bash
   docker-compose up --build
   ```
3. the backend api will be available at http://localhost:8000.

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

### authentication
- `POST /api/auth/nonce/`: generate a random login challenge for a wallet.
  - **body**: `{"wallet_address": "..."}`
- `POST /api/auth/verify/`: verify the signed nonce and return a JWT.
  - **body**: `{"wallet_address": "...", "signature": [...]}`

### vault
- `POST /api/vault/upload/`: upload an encrypted file and specify the required NFT mint address.
- `GET /api/vault/files/?wallet=<wallet_address>`: list files uploaded by a specific wallet.
- `GET /api/vault/download/<id>/`: download an encrypted file. this requires a valid JWT in the `Authorization: Bearer <token>` header. the backend queries the solana blockchain to ensure the user owns the necessary NFT (unless the downloader is the uploader).

## testing

a python simulator script `wallet_test.py` is included to test the backend authentication flow without needing a frontend or browser extension.

run the test script:
```bash
python wallet_test.py
```
to run django tests:
```bash
python manage.py test
```
