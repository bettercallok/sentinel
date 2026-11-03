import shutil
import tempfile
import uuid
from unittest import mock

import base58
import requests
from django.core.cache import cache
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from django.urls import reverse
from nacl.signing import SigningKey
from rest_framework.test import APIClient

from authentication.tokens import issue_token

from .models import EncryptedDocument
from .serializers import sanitize_file_name
from .views import RPCUnavailable, check_nft_ownership


def new_address():
    return base58.b58encode(SigningKey.generate().verify_key.encode()).decode()


TEMP_MEDIA = tempfile.mkdtemp(prefix='sentinel-test-media-')


@override_settings(MEDIA_ROOT=TEMP_MEDIA, VAULT_MAX_UPLOAD_BYTES=5 * 1024 * 1024)
class VaultTestCase(TestCase):
    @classmethod
    def tearDownClass(cls):
        super().tearDownClass()
        shutil.rmtree(TEMP_MEDIA, ignore_errors=True)

    def setUp(self):
        cache.clear()
        self.owner = new_address()
        self.other = new_address()
        self.mint = new_address()
        self.client = APIClient()

    def auth(self, wallet):
        token, _ = issue_token(wallet)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')

    def upload(self, wallet=None, content=b'ciphertext', name='report.pdf', mint=None, **extra):
        self.auth(wallet or self.owner)
        data = {
            'file_name': name,
            'encrypted_file': SimpleUploadedFile('blob.enc', content),
            'required_nft_address': mint or self.mint,
            **extra,
        }
        return self.client.post(reverse('file-upload'), data, format='multipart')


class UploadTests(VaultTestCase):
    def test_requires_auth(self):
        resp = self.client.post(reverse('file-upload'), {}, format='multipart')
        self.assertEqual(resp.status_code, 401)

    def test_upload_success(self):
        resp = self.upload()
        self.assertEqual(resp.status_code, 201, resp.data)
        self.assertEqual(resp.data['uploader_wallet'], self.owner)
        self.assertEqual(resp.data['file_size'], len(b'ciphertext'))
        self.assertIn('public_id', resp.data)
        self.assertNotIn('encrypted_file', resp.data)  # storage URL never exposed

    def test_large_upload_regression(self):
        """>2.5MB uploads go to a temp file; this used to crash with a 500."""
        resp = self.upload(content=b'0' * (3 * 1024 * 1024))
        self.assertEqual(resp.status_code, 201, resp.data)

    def test_upload_over_limit(self):
        resp = self.upload(content=b'0' * (5 * 1024 * 1024 + 1))
        self.assertEqual(resp.status_code, 400)
        self.assertIn('encrypted_file', resp.data)

    def test_missing_or_empty_file(self):
        self.auth(self.owner)
        resp = self.client.post(reverse('file-upload'), {'file_name': 'a', 'required_nft_address': self.mint},
                                format='multipart')
        self.assertEqual(resp.status_code, 400)
        self.assertEqual(self.upload(content=b'').status_code, 400)

    def test_uploader_cannot_be_spoofed(self):
        resp = self.upload(uploader_wallet=self.other)
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(EncryptedDocument.objects.get().uploader_wallet, self.owner)

    def test_invalid_mint_rejected(self):
        resp = self.upload(mint='not-a-mint')
        self.assertEqual(resp.status_code, 400)
        self.assertIn('required_nft_address', resp.data)

    def test_blob_stored_under_random_name(self):
        self.upload(name='secret-plans.pdf')
        path = EncryptedDocument.objects.get().encrypted_file.name
        self.assertTrue(path.startswith('secure_blobs/'))
        self.assertNotIn('secret', path)

    def test_file_name_sanitized(self):
        resp = self.upload(name='../../etc/pa"ss\r\nwd.txt')
        self.assertEqual(resp.status_code, 201, resp.data)
        self.assertEqual(resp.data['file_name'], 'pa"sswd.txt')

    def test_sanitize_helper(self):
        self.assertEqual(sanitize_file_name('C:\\Users\\x\\doc.pdf'), 'doc.pdf')
        self.assertEqual(sanitize_file_name('\u202eevil.txt'), 'evil.txt')
        self.assertEqual(sanitize_file_name('...'), '')
        long = sanitize_file_name('a' * 300 + '.pdf')
        self.assertEqual(len(long), 255)
        self.assertTrue(long.endswith('.pdf'))


class ListTests(VaultTestCase):
    def test_lists_only_own_files(self):
        self.upload(wallet=self.owner, name='mine.txt')
        self.upload(wallet=self.other, name='theirs.txt')
        self.auth(self.owner)
        resp = self.client.get(reverse('file-list'))
        self.assertEqual(resp.status_code, 200)
        self.assertEqual([d['file_name'] for d in resp.data], ['mine.txt'])

    def test_requires_auth(self):
        self.assertEqual(self.client.get(reverse('file-list')).status_code, 401)


class DownloadTests(VaultTestCase):
    def setUp(self):
        super().setUp()
        self.doc = EncryptedDocument.objects.get(public_id=self.upload(content=b'secret-bytes').data['public_id'])
        self.client.credentials()

    def download(self, wallet, legacy=False):
        self.auth(wallet)
        url = (reverse('file-download', args=[self.doc.pk]) if legacy
               else reverse('document-download', args=[self.doc.public_id]))
        return self.client.get(url)

    def test_requires_auth(self):
        resp = self.client.get(reverse('document-download', args=[self.doc.public_id]))
        self.assertEqual(resp.status_code, 401)

    @mock.patch('vault.views.check_nft_ownership')
    def test_owner_bypasses_gate(self, check):
        for legacy in (False, True):
            resp = self.download(self.owner, legacy=legacy)
            self.assertEqual(resp.status_code, 200)
            self.assertEqual(b''.join(resp.streaming_content), b'secret-bytes')
            self.assertEqual(resp['Cache-Control'], 'no-store')
        check.assert_not_called()

    @mock.patch('vault.views.check_nft_ownership', return_value=False)
    def test_non_holder_denied(self, _):
        self.assertEqual(self.download(self.other).status_code, 403)

    @mock.patch('vault.views.check_nft_ownership', return_value=True)
    def test_holder_allowed(self, check):
        resp = self.download(self.other)
        self.assertEqual(resp.status_code, 200)
        check.assert_called_once_with(self.other, self.mint)

    @mock.patch('vault.views.check_nft_ownership', side_effect=RPCUnavailable)
    def test_rpc_outage_returns_503(self, _):
        self.assertEqual(self.download(self.other).status_code, 503)

    def test_not_found(self):
        self.auth(self.owner)
        self.assertEqual(self.client.get(reverse('document-download', args=[uuid.uuid4()])).status_code, 404)

    def test_content_disposition_is_safe(self):
        EncryptedDocument.objects.filter(pk=self.doc.pk).update(file_name='ré"port.pdf')
        resp = self.download(self.owner)
        self.assertEqual(resp.status_code, 200)
        header = resp['Content-Disposition']
        self.assertTrue(header.startswith('attachment;'))
        self.assertIn("filename*=utf-8''", header)


class DocumentDetailTests(VaultTestCase):
    def setUp(self):
        super().setUp()
        self.public_id = self.upload().data['public_id']
        self.url = reverse('document-detail', args=[self.public_id])

    def test_metadata_for_link_holder(self):
        self.auth(self.other)
        resp = self.client.get(self.url)
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['required_nft_address'], self.mint)
        self.assertFalse(resp.data['is_owner'])
        self.assertNotIn('encrypted_file', resp.data)

    def test_metadata_for_owner(self):
        self.auth(self.owner)
        self.assertTrue(self.client.get(self.url).data['is_owner'])

    def test_metadata_requires_auth(self):
        self.client.credentials()
        self.assertEqual(self.client.get(self.url).status_code, 401)

    def test_only_owner_can_delete(self):
        self.auth(self.other)
        self.assertEqual(self.client.delete(self.url).status_code, 403)
        self.assertTrue(EncryptedDocument.objects.exists())

    def test_delete_removes_row_and_blob(self):
        doc = EncryptedDocument.objects.get()
        storage, name = doc.encrypted_file.storage, doc.encrypted_file.name
        self.assertTrue(storage.exists(name))
        self.auth(self.owner)
        self.assertEqual(self.client.delete(self.url).status_code, 204)
        self.assertFalse(EncryptedDocument.objects.exists())
        self.assertFalse(storage.exists(name))
        self.assertEqual(self.client.delete(self.url).status_code, 404)


class NFTOwnershipTests(TestCase):
    def setUp(self):
        cache.clear()

    def rpc_response(self, amounts=None, error=None):
        resp = mock.Mock()
        resp.raise_for_status.return_value = None
        if error:
            resp.json.return_value = {'jsonrpc': '2.0', 'error': error}
        else:
            resp.json.return_value = {'result': {'value': [
                {'account': {'data': {'parsed': {'info': {'tokenAmount': {'amount': str(a)}}}}}}
                for a in amounts or []
            ]}}
        return resp

    @mock.patch('vault.views.requests.post')
    def test_holder(self, post):
        post.return_value = self.rpc_response([0, 1])
        self.assertTrue(check_nft_ownership('w', 'm'))
        # Positive result is cached.
        self.assertTrue(check_nft_ownership('w', 'm'))
        self.assertEqual(post.call_count, 1)

    @mock.patch('vault.views.requests.post')
    def test_non_holder(self, post):
        post.return_value = self.rpc_response([0])
        self.assertFalse(check_nft_ownership('w', 'm'))

    @mock.patch('vault.views.requests.post')
    def test_rpc_error_raises(self, post):
        post.return_value = self.rpc_response(error={'code': -32005, 'message': 'rate limited'})
        with self.assertRaises(RPCUnavailable):
            check_nft_ownership('w', 'm')

    @mock.patch('vault.views.requests.post', side_effect=requests.Timeout)
    def test_timeout_raises(self, _):
        with self.assertRaises(RPCUnavailable):
            check_nft_ownership('w', 'm')


class HealthTests(TestCase):
    def test_health(self):
        resp = APIClient().get(reverse('health'))
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['status'], 'ok')
