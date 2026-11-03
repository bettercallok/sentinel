"""Small helpers for working with Solana addresses."""

import base58

SOLANA_PUBKEY_LENGTH = 32


def decode_solana_address(value):
    """Return the 32 raw bytes of a base58 Solana address, or raise ValueError."""
    if not isinstance(value, str) or not 32 <= len(value) <= 44:
        raise ValueError('Invalid Solana address.')
    try:
        raw = base58.b58decode(value)
    except ValueError as exc:
        raise ValueError('Invalid Solana address.') from exc
    if len(raw) != SOLANA_PUBKEY_LENGTH:
        raise ValueError('Invalid Solana address.')
    return raw


def is_valid_solana_address(value):
    try:
        decode_solana_address(value)
    except ValueError:
        return False
    return True
