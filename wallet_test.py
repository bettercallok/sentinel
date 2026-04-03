import requests
import base58
from nacl.signing import SigningKey

print("---  Sentinel Wallet Simulator  ---")

# 1. Generate a fake Phantom Wallet keypair
print("\n1. Generating fake Solana Keypair...")
private_key = SigningKey.generate()
public_key_bytes = private_key.verify_key.encode()
wallet_address = base58.b58encode(public_key_bytes).decode('utf-8')

print(f"   => Wallet Address: {wallet_address}")

# 2. Ask Django for a Nonce (The Challenge)
print("\n2. Asking Django for a login challenge...")
nonce_response = requests.post(
    'http://localhost:8000/api/auth/nonce/',
    json={'wallet_address': wallet_address}
)
nonce_data = nonce_response.json()
nonce_str = nonce_data.get('nonce')
print(f"   => Received Nonce: {nonce_str}")

# 3. Sign the Nonce (What Phantom Wallet does when you click 'Approve')
print("\n3. Phantom Wallet is signing the nonce with the Private Key...")
message_bytes = nonce_str.encode('utf-8')
signed_message = private_key.sign(message_bytes)

# Extract just the signature part and convert to a normal list of numbers 
# (This is exactly how a Next.js frontend sends it!)
signature_list = list(signed_message.signature)

# 4. Send the signature to Django for verification
print("\n4. Sending the signature to Django to verify the math...")
verify_response = requests.post(
    'http://localhost:8000/api/auth/verify/',
    json={
        'wallet_address': wallet_address,
        'signature': signature_list
    }
)

print("\n--- 🏁 Django Response 🏁 ---")
print(f"Status Code: {verify_response.status_code}")
print(verify_response.json())