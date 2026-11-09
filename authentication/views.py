import datetime

import base58
import nacl.exceptions
import nacl.signing
from django.db import transaction
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from core.solana import decode_solana_address

from .authentication import IsWalletAuthenticated
from .messages import build_sign_in_message, sign_in_domain
from .models import WalletNonce
from .tokens import issue_token

SIGNATURE_LENGTH = 64


def parse_signature(value):
    """Accept a 64-byte signature as a list of ints (Phantom) or a base58 string."""
    if isinstance(value, str):
        try:
            raw = base58.b58decode(value)
        except ValueError:
            return None
    elif isinstance(value, list) and all(
        isinstance(b, int) and not isinstance(b, bool) and 0 <= b <= 255 for b in value
    ):
        raw = bytes(value)
    else:
        return None
    return raw if len(raw) == SIGNATURE_LENGTH else None


class GenerateNonceView(APIView):
    authentication_classes = []
    throttle_scope = 'auth'

    def post(self, request):
        wallet_address = request.data.get('wallet_address')
        if not wallet_address:
            return Response({'error': 'wallet_address is required'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            decode_solana_address(wallet_address)
        except ValueError:
            return Response({'error': 'Invalid Solana wallet address.'}, status=status.HTTP_400_BAD_REQUEST)

        # Housekeeping: drop stale challenges so the table can't grow without bound.
        WalletNonce.objects.filter(created_at__lt=WalletNonce.expiry_cutoff()).delete()

        # Issuing a new challenge invalidates any previous one for this wallet.
        WalletNonce.objects.filter(wallet_address=wallet_address).delete()
        wallet_nonce = WalletNonce.objects.create(wallet_address=wallet_address)

        return Response({
            'wallet': wallet_nonce.wallet_address,
            'nonce': str(wallet_nonce.nonce),
            'message': build_sign_in_message(
                wallet_nonce.wallet_address, wallet_nonce.nonce, wallet_nonce.created_at,
                domain=sign_in_domain(request),
            ),
        }, status=status.HTTP_200_OK)


class VerifySignatureView(APIView):
    authentication_classes = []
    throttle_scope = 'auth'

    def post(self, request):
        wallet_address = request.data.get('wallet_address')
        signature_raw = request.data.get('signature')

        if not wallet_address or not signature_raw:
            return Response({'error': 'Missing wallet or signature'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            pubkey_bytes = decode_solana_address(wallet_address)
        except ValueError:
            return Response({'error': 'Invalid Solana wallet address.'}, status=status.HTTP_400_BAD_REQUEST)

        signature = parse_signature(signature_raw)
        if signature is None:
            return Response({'error': 'Malformed signature.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            wallet_nonce = WalletNonce.objects.get(wallet_address=wallet_address)
        except WalletNonce.DoesNotExist:
            return Response(
                {'error': 'No login challenge found. Request a new nonce.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        if wallet_nonce.is_expired:
            wallet_nonce.delete()
            return Response({'error': 'Nonce expired. Request a new one.'}, status=status.HTTP_401_UNAUTHORIZED)

        # The message is rebuilt from server-side state, never taken from the client.
        message = build_sign_in_message(
            wallet_nonce.wallet_address, wallet_nonce.nonce, wallet_nonce.created_at,
            domain=sign_in_domain(request),
        ).encode('utf-8')

        try:
            nacl.signing.VerifyKey(pubkey_bytes).verify(message, signature)
        except (nacl.exceptions.BadSignatureError, nacl.exceptions.CryptoError, ValueError):
            return Response({'error': 'Invalid signature. Access Denied.'}, status=status.HTTP_401_UNAUTHORIZED)

        # Consume the challenge atomically: if two requests race with the same
        # signature, only the one that actually deletes the row gets a token.
        with transaction.atomic():
            deleted, _ = WalletNonce.objects.filter(
                pk=wallet_nonce.pk, nonce=wallet_nonce.nonce
            ).delete()
        if not deleted:
            return Response(
                {'error': 'Login challenge already used. Request a new nonce.'},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        token, expires_at = issue_token(wallet_address)
        return Response({
            'status': 'success',
            'message': 'Authentication successful!',
            'token': token,
            'wallet_address': wallet_address,
            'expires_at': expires_at.isoformat(),
        })


class MeView(APIView):
    """Validate the current session token and return who it belongs to."""

    permission_classes = [IsWalletAuthenticated]

    def get(self, request):
        exp = request.user.token_payload['exp']
        return Response({
            'wallet_address': request.user.wallet_address,
            'expires_at': datetime.datetime.fromtimestamp(exp, tz=datetime.timezone.utc).isoformat(),
        })
