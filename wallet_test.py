"""
Sentinel wallet simulator: exercises the sign-in flow without a browser wallet.

Usage:
    python wallet_test.py                      # against http://localhost:8000
    SENTINEL_API=https://api.example.com python wallet_test.py
"""
import os

import base58
import requests
from nacl.signing import SigningKey

API = os.environ.get('SENTINEL_API', 'http://localhost:8000').rstrip('/')

print("---  Sentinel Wallet Simulator  ---")

# 1. Generate a throwaway Solana keypair
print("\n1. Generating fake Solana keypair...")
private_key = SigningKey.generate()
wallet_address = base58.b58encode(private_key.verify_key.encode()).decode('utf-8')
print(f"   => Wallet Address: {wallet_address}")

# 2. Ask the API for a sign-in challenge
print("\n2. Requesting a login challenge...")
nonce_response = requests.post(f'{API}/api/auth/nonce/', json={'wallet_address': wallet_address}, timeout=10)
nonce_response.raise_for_status()
challenge = nonce_response.json()
message = challenge['message']
print("   => Message to sign:\n" + "\n".join(f"      | {line}" for line in message.splitlines()))

# 3. Sign the message (what Phantom does when you click 'Approve')
print("\n3. Signing the message with the private key...")
signature_list = list(private_key.sign(message.encode('utf-8')).signature)

# 4. Exchange the signature for a session token
print("\n4. Sending the signature for verification...")
verify_response = requests.post(
    f'{API}/api/auth/verify/',
    json={'wallet_address': wallet_address, 'signature': signature_list},
    timeout=10,
)
print(f"   => Status Code: {verify_response.status_code}")
data = verify_response.json()
print(f"   => {data}")

# 5. Use the token
if verify_response.ok:
    me = requests.get(f'{API}/api/auth/me/', headers={'Authorization': f"Bearer {data['token']}"}, timeout=10)
    print(f"\n5. /api/auth/me/ -> {me.status_code} {me.json()}")
