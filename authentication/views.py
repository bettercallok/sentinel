import base58
import nacl.signing
import nacl.exceptions
import jwt
import datetime
from django.conf import settings
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from .models import WalletNonce

class GenerateNonceView(APIView):
    def post(self, request):
        wallet_address = request.data.get('wallet_address')
        if not wallet_address:
            return Response({'error': 'wallet_address is required'}, status=status.HTTP_400_BAD_REQUEST)

        # Delete old nonces to prevent replay attacks
        WalletNonce.objects.filter(wallet_address=wallet_address).delete()
        wallet_nonce = WalletNonce.objects.create(wallet_address=wallet_address)

        return Response({
            'wallet': wallet_nonce.wallet_address,
            'nonce': str(wallet_nonce.nonce)
        }, status=status.HTTP_200_OK)


class VerifySignatureView(APIView):
    def post(self, request):
        wallet_address = request.data.get('wallet_address')
        signature_list = request.data.get('signature') # Phantom sends an array of numbers

        if not wallet_address or not signature_list:
            return Response({'error': 'Missing wallet or signature'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            # 1. Fetch the exact challenge we issued to this wallet
            wallet_nonce = WalletNonce.objects.get(wallet_address=wallet_address)
            message = str(wallet_nonce.nonce).encode('utf-8')

            # 2. Decode the Solana Public Key
            pubkey_bytes = base58.b58decode(wallet_address)
            verify_key = nacl.signing.VerifyKey(pubkey_bytes)

            # 3. Convert the frontend signature array into bytes
            signature_bytes = bytes(signature_list)

            # 4. THE MATH: Does the signature match the key and the message?
            verify_key.verify(message, signature_bytes)

            # 5. Security: Destroy the nonce so it can never be used again
            wallet_nonce.delete()

            # 6. Generate JWT Session Token (Expires in 24 hours)
            payload = {
                'wallet_address': wallet_address,
                'exp': datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(hours=24),
                'iat': datetime.datetime.now(datetime.timezone.utc)
            }
            token = jwt.encode(payload, settings.SECRET_KEY, algorithm='HS256')

            # 7. Success! Return the token to the frontend
            return Response({
                'status': 'success', 
                'message': 'Authentication successful!',
                'token': token  
            })

        except WalletNonce.DoesNotExist:
            return Response({'error': 'No login challenge found. Request a new nonce.'}, status=status.HTTP_404_NOT_FOUND)
        except (nacl.exceptions.BadSignatureError, ValueError):
            return Response({'error': 'Invalid signature. Access Denied.'}, status=status.HTTP_401_UNAUTHORIZED)