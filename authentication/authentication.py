"""DRF authentication backed by wallet-signed JWTs."""

import jwt
from rest_framework import authentication, exceptions, permissions

from core.solana import is_valid_solana_address

from .tokens import decode_token


class WalletUser:
    """Lightweight stand-in for a Django user, identified by wallet address."""

    is_authenticated = True
    is_anonymous = False
    is_active = True

    def __init__(self, wallet_address, token_payload):
        self.wallet_address = wallet_address
        self.token_payload = token_payload

    @property
    def pk(self):
        # Used by DRF's UserRateThrottle to key throttles per wallet.
        return self.wallet_address

    def __str__(self):
        return self.wallet_address


class WalletJWTAuthentication(authentication.BaseAuthentication):
    keyword = 'Bearer'

    def authenticate(self, request):
        header = authentication.get_authorization_header(request).decode('latin-1')
        if not header:
            return None
        parts = header.split()
        if parts[0] != self.keyword:
            return None
        if len(parts) != 2:
            raise exceptions.AuthenticationFailed('Invalid authorization header.')

        try:
            payload = decode_token(parts[1])
        except jwt.ExpiredSignatureError:
            raise exceptions.AuthenticationFailed('Session expired. Please reconnect wallet.')
        except jwt.InvalidTokenError:
            raise exceptions.AuthenticationFailed('Invalid token.')

        wallet = payload.get('wallet_address')
        if not is_valid_solana_address(wallet):
            raise exceptions.AuthenticationFailed('Invalid token.')
        return WalletUser(wallet, payload), payload

    def authenticate_header(self, request):
        # Makes DRF answer 401 (not 403) for unauthenticated requests.
        return self.keyword


class IsWalletAuthenticated(permissions.BasePermission):
    message = 'Unauthorized. Missing token.'

    def has_permission(self, request, view):
        return isinstance(request.user, WalletUser)
