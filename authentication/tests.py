import datetime
from unittest import mock

import base58
import jwt
from django.conf import settings
from django.core.cache import cache
from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from nacl.signing import SigningKey
from rest_framework.test import APIClient

from .messages import build_sign_in_message
from .models import WalletNonce
from .tokens import decode_token, issue_token


def make_wallet():
    key = SigningKey.generate()
    return key, base58.b58encode(key.verify_key.encode()).decode()


class AuthFlowTests(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()
        self.key, self.wallet = make_wallet()

    def request_nonce(self, wallet=None):
        return self.client.post(reverse('generate-nonce'), {'wallet_address': wallet or self.wallet}, format='json')

    def sign(self, message, key=None):
        return list((key or self.key).sign(message.encode()).signature)

    def verify(self, signature, wallet=None):
        return self.client.post(
            reverse('verify-signature'),
            {'wallet_address': wallet or self.wallet, 'signature': signature},
            format='json',
        )

    # --- nonce -------------------------------------------------------------
    def test_nonce_returns_human_readable_message(self):
        resp = self.request_nonce()
        self.assertEqual(resp.status_code, 200)
        msg = resp.data['message']
        self.assertIn(self.wallet, msg)
        self.assertIn(resp.data['nonce'], msg)
        self.assertIn(settings.SIWS_DOMAIN, msg)
        self.assertIn('Issued At:', msg)

    def test_message_domain_is_a_host_phantom_accepts(self):
        # Phantom rejects SIWS messages whose first token isn't a host ("invalid formatting").
        first_line = self.request_nonce().data['message'].split('\n')[0]
        domain = first_line.split(' wants you to sign in')[0]
        self.assertRegex(domain, r'^[A-Za-z0-9.-]+(:\d+)?$')

    def test_nonce_is_alphanumeric(self):
        # SIWS/EIP-4361 grammar: nonce = 8*( ALPHA / DIGIT ). Phantom rejects hyphenated UUIDs.
        resp = self.request_nonce()
        self.assertRegex(resp.data['nonce'], r'^[A-Za-z0-9]{8,}$')
        self.assertIn(f"\nNonce: {resp.data['nonce']}\n", resp.data['message'])

    def test_issued_at_is_rfc3339_utc(self):
        msg = self.request_nonce().data['message']
        self.assertRegex(msg, r'Issued At: \d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$')

    @mock.patch.object(settings, 'CORS_ALLOWED_ORIGINS', ['https://app.example.com'])
    def test_trusted_origin_sets_domain_and_sign_in_works(self):
        origin = {'HTTP_ORIGIN': 'https://app.example.com'}
        resp = self.client.post(reverse('generate-nonce'), {'wallet_address': self.wallet}, format='json', **origin)
        msg = resp.data['message']
        self.assertTrue(msg.startswith('app.example.com wants you to sign in'))
        resp = self.client.post(
            reverse('verify-signature'),
            {'wallet_address': self.wallet, 'signature': self.sign(msg)},
            format='json',
            **origin,
        )
        self.assertEqual(resp.status_code, 200)
        self.assertIn('token', resp.data)

    @mock.patch.object(settings, 'CORS_ALLOWED_ORIGINS', ['https://app.example.com'])
    def test_untrusted_origin_falls_back_to_configured_domain(self):
        resp = self.client.post(
            reverse('generate-nonce'), {'wallet_address': self.wallet}, format='json',
            HTTP_ORIGIN='https://evil.example.net',
        )
        self.assertTrue(resp.data['message'].startswith(f'{settings.SIWS_DOMAIN} wants you'))

    def test_nonce_requires_wallet(self):
        self.assertEqual(self.client.post(reverse('generate-nonce'), {}, format='json').status_code, 400)

    def test_nonce_rejects_invalid_address(self):
        for bad in ['abc', '0' * 44, 'A' * 300, 'I' * 44]:
            self.assertEqual(self.request_nonce(bad).status_code, 400, bad)
        self.assertEqual(WalletNonce.objects.count(), 0)

    def test_new_nonce_replaces_old(self):
        first = self.request_nonce().data['nonce']
        second = self.request_nonce().data['nonce']
        self.assertNotEqual(first, second)
        self.assertEqual(WalletNonce.objects.filter(wallet_address=self.wallet).count(), 1)

    def test_expired_nonces_are_purged(self):
        _, other = make_wallet()
        stale = WalletNonce.objects.create(wallet_address=other)
        WalletNonce.objects.filter(pk=stale.pk).update(created_at=timezone.now() - datetime.timedelta(hours=1))
        self.request_nonce()
        self.assertFalse(WalletNonce.objects.filter(pk=stale.pk).exists())

    # --- verify ------------------------------------------------------------
    def test_full_login_flow(self):
        message = self.request_nonce().data['message']
        resp = self.verify(self.sign(message))
        self.assertEqual(resp.status_code, 200)
        payload = decode_token(resp.data['token'])
        self.assertEqual(payload['wallet_address'], self.wallet)
        self.assertEqual(resp.data['wallet_address'], self.wallet)
        self.assertFalse(WalletNonce.objects.exists())

    def test_base58_signature_accepted(self):
        message = self.request_nonce().data['message']
        sig = base58.b58encode(bytes(self.sign(message))).decode()
        self.assertEqual(self.verify(sig).status_code, 200)

    def test_signing_bare_nonce_is_rejected(self):
        """Signatures over the old bare-UUID challenge must no longer work."""
        nonce = self.request_nonce().data['nonce']
        self.assertEqual(self.verify(self.sign(nonce)).status_code, 401)

    def test_replay_is_rejected(self):
        message = self.request_nonce().data['message']
        sig = self.sign(message)
        self.assertEqual(self.verify(sig).status_code, 200)
        self.assertEqual(self.verify(sig).status_code, 404)

    def test_wrong_key_rejected(self):
        message = self.request_nonce().data['message']
        other_key, _ = make_wallet()
        self.assertEqual(self.verify(self.sign(message, other_key)).status_code, 401)
        # A failed attempt does not burn the challenge.
        self.assertTrue(WalletNonce.objects.filter(wallet_address=self.wallet).exists())

    def test_expired_nonce_rejected(self):
        message = self.request_nonce().data['message']
        WalletNonce.objects.update(created_at=timezone.now() - datetime.timedelta(minutes=10))
        self.assertEqual(self.verify(self.sign(message)).status_code, 401)
        self.assertFalse(WalletNonce.objects.exists())

    def test_no_challenge(self):
        self.assertEqual(self.verify([0] * 64).status_code, 404)

    def test_malformed_signatures_return_400(self):
        self.request_nonce()
        for bad in ['not-base58-0OIl', [1] * 10, [256] * 64, [-1] * 64, [[1]] * 64,
                    [True] * 64, {'a': 1}, 'abc', ['1'] * 64]:
            resp = self.verify(bad)
            self.assertEqual(resp.status_code, 400, bad)

    def test_concurrent_consumption_only_one_wins(self):
        """If the nonce vanishes between verify and consume, no token is issued."""
        message = self.request_nonce().data['message']
        sig = self.sign(message)
        original_filter = WalletNonce.objects.filter

        def racing_filter(*args, **kwargs):
            if 'nonce' in kwargs:
                original_filter(wallet_address=self.wallet).delete()  # the other request won
            return original_filter(*args, **kwargs)

        with mock.patch.object(WalletNonce.objects, 'filter', side_effect=racing_filter):
            resp = self.verify(sig)
        self.assertEqual(resp.status_code, 401)
        self.assertNotIn('token', resp.data)

    def test_message_is_deterministic(self):
        nonce = WalletNonce.objects.create(wallet_address=self.wallet)
        self.assertEqual(
            build_sign_in_message(self.wallet, nonce.nonce, nonce.created_at),
            build_sign_in_message(self.wallet, nonce.nonce, WalletNonce.objects.get().created_at),
        )


class SessionTests(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()
        _, self.wallet = make_wallet()

    def test_me_with_valid_token(self):
        token, _ = issue_token(self.wallet)
        resp = self.client.get(reverse('auth-me'), HTTP_AUTHORIZATION=f'Bearer {token}')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['wallet_address'], self.wallet)
        self.assertIn('expires_at', resp.data)

    def test_me_without_token(self):
        self.assertEqual(self.client.get(reverse('auth-me')).status_code, 401)

    def test_me_with_expired_token(self):
        now = datetime.datetime.now(datetime.timezone.utc)
        token = jwt.encode({
            'wallet_address': self.wallet, 'iss': settings.JWT_ISSUER, 'aud': settings.JWT_AUDIENCE,
            'iat': now - datetime.timedelta(days=2), 'exp': now - datetime.timedelta(days=1),
        }, settings.JWT_SECRET, algorithm='HS256')
        resp = self.client.get(reverse('auth-me'), HTTP_AUTHORIZATION=f'Bearer {token}')
        self.assertEqual(resp.status_code, 401)
        self.assertIn('expired', resp.data['detail'].lower())

    def test_tokens_without_issuer_or_audience_rejected(self):
        """Legacy-style tokens (no iss/aud) or tokens for another audience are refused."""
        now = datetime.datetime.now(datetime.timezone.utc)
        base = {'wallet_address': self.wallet, 'iat': now, 'exp': now + datetime.timedelta(hours=1)}
        for extra in ({}, {'iss': settings.JWT_ISSUER, 'aud': 'someone-else'}):
            token = jwt.encode({**base, **extra}, settings.JWT_SECRET, algorithm='HS256')
            resp = self.client.get(reverse('auth-me'), HTTP_AUTHORIZATION=f'Bearer {token}')
            self.assertEqual(resp.status_code, 401, extra)

    def test_token_signed_with_other_secret_rejected(self):
        now = datetime.datetime.now(datetime.timezone.utc)
        token = jwt.encode({
            'wallet_address': self.wallet, 'iss': settings.JWT_ISSUER, 'aud': settings.JWT_AUDIENCE,
            'iat': now, 'exp': now + datetime.timedelta(hours=1),
        }, 'not-the-secret', algorithm='HS256')
        resp = self.client.get(reverse('auth-me'), HTTP_AUTHORIZATION=f'Bearer {token}')
        self.assertEqual(resp.status_code, 401)

    def test_malformed_auth_header(self):
        for header in ['Bearer', 'Bearer a b', 'Bearer garbage']:
            resp = self.client.get(reverse('auth-me'), HTTP_AUTHORIZATION=header)
            self.assertEqual(resp.status_code, 401, header)
