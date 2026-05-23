# Sentinel

Sentinel is a Web3-enabled Django application featuring Solana wallet authentication and a token-gated file vault. Users can authenticate using their Solana wallets (like Phantom) via a challenge-response signature mechanism. Once authenticated, users can upload files and restrict downloads to holders of specific Solana NFTs.

## Features

- **Solana Wallet Authentication**: Secure login without passwords. The backend generates a challenge nonce which is signed by the user's wallet. The signature is verified using PyNaCl and base58.
- **Token-Gated File Vault**: Upload encrypted documents and lock them behind NFT ownership.
- **On-Chain Verification**: Queries the Solana mainnet RPC to check if a downloader's wallet holds the required NFT mint before serving the file.
- **JWT Session Management**: Issues a secure, short-lived JSON Web Token after successful wallet verification.

## Prerequisites

- Docker and Docker Compose (recommended)
- OR Python 3.11+, PostgreSQL

## Setup Instructions

### Using Docker (Recommended)

1. Clone the repository.
2. Build and run the containers using Docker Compose:
   ```bash
   docker-compose up --build
   ```
3. The application will be available at http://localhost:8000.

### Local Development (Without Docker)

1. Clone the repository and navigate into it.
2. Create and activate a virtual environment:
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows use: venv\Scripts\activate
   ```
3. Install the dependencies:
   ```bash
   pip install -r requirements.txt
   ```
4. Run database migrations:
   ```bash
   python manage.py migrate
   ```
5. Start the Django development server:
   ```bash
   python manage.py runserver
   ```

## Project Structure

- `core/`: Django project settings, configuration, and root URL routing.
- `authentication/`: Django app managing wallet login, nonces, signature verification, and JWT generation.
- `vault/`: Django app handling file uploads, retrieving lists of files, and verifying NFT ownership for token-gated downloads.
- `frontend/`: Vanilla HTML, CSS, and JavaScript interface demonstrating integration with the Phantom Wallet provider.

## API Endpoints

### Authentication
- `POST /api/auth/nonce/`: Generate a random login challenge for a wallet.
  - **Body**: `{"wallet_address": "..."}`
- `POST /api/auth/verify/`: Verify the signed nonce and return a JWT.
  - **Body**: `{"wallet_address": "...", "signature": [...]}`

### Vault
- `POST /api/vault/upload/`: Upload an encrypted file and specify the required NFT mint address.
- `GET /api/vault/files/?wallet=<wallet_address>`: List files uploaded by a specific wallet.
- `GET /api/vault/download/<id>/`: Download an encrypted file. Requires a valid JWT in the `Authorization: Bearer <token>` header. The backend queries the Solana blockchain to ensure the user owns the necessary NFT (unless the downloader is the uploader).

## Testing

A python simulator script `wallet_test.py` is included to test the backend authentication flow without needing a frontend or browser extension.

Run the test script:
```bash
python wallet_test.py
```
To run Django tests:
```bash
python manage.py test
```
