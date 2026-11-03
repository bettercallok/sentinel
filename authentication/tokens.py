"""JWT issuing / decoding for wallet sessions."""

import datetime

import jwt
from django.conf import settings

ALGORITHM = 'HS256'


def _now():
    return datetime.datetime.now(datetime.timezone.utc)


def issue_token(wallet_address):
    issued_at = _now()
    expires_at = issued_at + datetime.timedelta(seconds=settings.JWT_LIFETIME_SECONDS)
    payload = {
        'wallet_address': wallet_address,
        'iss': settings.JWT_ISSUER,
        'aud': settings.JWT_AUDIENCE,
        'iat': issued_at,
        'exp': expires_at,
    }
    token = jwt.encode(payload, settings.JWT_SECRET, algorithm=ALGORITHM)
    return token, expires_at


def decode_token(token):
    """Decode and validate a session token. Raises jwt.InvalidTokenError subclasses."""
    return jwt.decode(
        token,
        settings.JWT_SECRET,
        algorithms=[ALGORITHM],
        issuer=settings.JWT_ISSUER,
        audience=settings.JWT_AUDIENCE,
        options={'require': ['exp', 'iat', 'iss', 'aud', 'wallet_address']},
    )
