"""Builds the human-readable sign-in message the wallet signs (Sign In With Solana format).

Phantom parses any message that starts with "<domain> wants you to sign in with your
Solana account:" as a SIWS message and rejects it ("invalid formatting") unless the
first token is a real host. It also warns when that host differs from the site asking
for the signature, so the domain should be the frontend's own host.
"""

import datetime
from urllib.parse import urlsplit

from django.conf import settings


def sign_in_domain(request):
    """Host shown in the wallet prompt: the caller's origin if trusted, else SIWS_DOMAIN."""
    origin = (request.headers.get('Origin') or '').rstrip('/')
    if origin and origin in settings.CORS_ALLOWED_ORIGINS:
        host = urlsplit(origin).netloc
        if host:
            return host
    return settings.SIWS_DOMAIN


def format_issued_at(issued_at):
    """RFC 3339 UTC timestamp with millisecond precision, e.g. 2026-11-10T08:00:00.000Z."""
    utc = issued_at.astimezone(datetime.timezone.utc)
    return utc.isoformat(timespec='milliseconds').replace('+00:00', 'Z')


def format_nonce(nonce):
    """SIWS/EIP-4361 nonces must be alphanumeric (8+ chars); a hyphenated UUID is rejected."""
    return str(nonce).replace('-', '')


def build_sign_in_message(wallet_address, nonce, issued_at, domain=None):
    return (
        f'{domain or settings.SIWS_DOMAIN} wants you to sign in with your Solana account:\n'
        f'{wallet_address}\n'
        '\n'
        f'{settings.SIWS_STATEMENT}\n'
        '\n'
        f'Nonce: {format_nonce(nonce)}\n'
        f'Issued At: {format_issued_at(issued_at)}'
    )
