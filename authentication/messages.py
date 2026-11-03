"""Builds the human-readable sign-in message the wallet signs (SIWS-style)."""

from django.conf import settings


def build_sign_in_message(wallet_address, nonce, issued_at):
    return (
        f'{settings.SIWS_DOMAIN} wants you to sign in with your Solana account:\n'
        f'{wallet_address}\n'
        '\n'
        f'{settings.SIWS_STATEMENT}\n'
        '\n'
        f'Nonce: {nonce}\n'
        f'Issued At: {issued_at.isoformat()}'
    )
