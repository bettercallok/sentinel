import hashlib
import logging

import requests
from django.conf import settings
from django.core.cache import cache
from django.http import FileResponse
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from authentication.authentication import IsWalletAuthenticated

from .models import EncryptedDocument
from .serializers import EncryptedDocumentSerializer, SharedDocumentSerializer

logger = logging.getLogger(__name__)


class RPCUnavailable(Exception):
    """The Solana RPC could not be reached or returned an unusable response."""


def check_nft_ownership(wallet_address, nft_mint_address):
    """
    Return True if `wallet_address` holds at least one token of `nft_mint_address`.

    Raises RPCUnavailable when the RPC fails, so callers can tell "doesn't own
    it" apart from "couldn't check". Positive results are cached briefly to
    spare the RPC on repeated downloads.
    """
    cache_key = 'nft-owner:' + hashlib.sha256(
        f'{wallet_address}:{nft_mint_address}'.encode()
    ).hexdigest()
    if cache.get(cache_key):
        return True

    payload = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "getTokenAccountsByOwner",
        "params": [
            wallet_address,
            {"mint": nft_mint_address},
            {"encoding": "jsonParsed"},
        ],
    }

    try:
        resp = requests.post(settings.SOLANA_RPC_URL, json=payload, timeout=settings.SOLANA_RPC_TIMEOUT)
        resp.raise_for_status()
        body = resp.json()
    except (requests.RequestException, ValueError) as exc:
        logger.warning('Solana RPC request failed: %s', exc)
        raise RPCUnavailable from exc

    if 'error' in body:
        logger.warning('Solana RPC returned an error: %s', body['error'])
        raise RPCUnavailable

    try:
        accounts = body['result']['value']
        owns = any(
            int(acc['account']['data']['parsed']['info']['tokenAmount']['amount']) > 0
            for acc in accounts
        )
    except (KeyError, TypeError, ValueError) as exc:
        logger.warning('Unexpected Solana RPC response shape: %s', exc)
        raise RPCUnavailable from exc

    if owns:
        cache.set(cache_key, True, settings.NFT_OWNERSHIP_CACHE_SECONDS)
    return owns


class FileUploadView(APIView):
    permission_classes = [IsWalletAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request, *args, **kwargs):
        if 'encrypted_file' not in request.FILES:
            return Response({'error': 'encrypted_file is required.'}, status=status.HTTP_400_BAD_REQUEST)

        serializer = EncryptedDocumentSerializer(data=request.data)
        if serializer.is_valid():
            # The uploader always comes from the verified JWT, never the form.
            serializer.save(uploader_wallet=request.user.wallet_address)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class FileListView(APIView):
    """List the encrypted documents uploaded by the authenticated wallet."""

    permission_classes = [IsWalletAuthenticated]

    def get(self, request):
        documents = EncryptedDocument.objects.filter(
            uploader_wallet=request.user.wallet_address
        ).order_by('-uploaded_at')
        return Response(EncryptedDocumentSerializer(documents, many=True).data)


class DocumentDetailView(APIView):
    """
    GET: metadata for a share link (any signed-in wallet with the link).
    DELETE: remove the document and its blob (uploader only).
    """

    permission_classes = [IsWalletAuthenticated]

    def get(self, request, public_id):
        document = get_object_or_404(EncryptedDocument, public_id=public_id)
        return Response(SharedDocumentSerializer(document, context={'request': request}).data)

    def delete(self, request, public_id):
        document = get_object_or_404(EncryptedDocument, public_id=public_id)
        if document.uploader_wallet != request.user.wallet_address:
            return Response(
                {'error': 'Only the uploader can delete this document.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        try:
            document.encrypted_file.delete(save=False)
        except Exception:  # storage errors must not leave the row orphaned
            logger.exception('Failed to delete blob for document %s', document.pk)
        document.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class FileDownloadView(APIView):
    """Serve an encrypted blob only if the caller is the uploader or holds the NFT."""

    permission_classes = [IsWalletAuthenticated]

    def get(self, request, pk=None, public_id=None):
        if public_id is not None:
            document = EncryptedDocument.objects.filter(public_id=public_id).first()
        else:
            document = EncryptedDocument.objects.filter(pk=pk).first()
        if document is None:
            return Response({'error': 'Document not found'}, status=status.HTTP_404_NOT_FOUND)

        downloader_wallet = request.user.wallet_address

        # The uploader always has access to their own documents.
        if document.uploader_wallet != downloader_wallet:
            try:
                owns_nft = check_nft_ownership(downloader_wallet, document.required_nft_address)
            except RPCUnavailable:
                return Response(
                    {'error': 'Could not verify NFT ownership right now. Please try again shortly.'},
                    status=status.HTTP_503_SERVICE_UNAVAILABLE,
                )
            if not owns_nft:
                return Response(
                    {'error': f'Access Denied. Wallet {downloader_wallet[:4]}... does not hold the required NFT.'},
                    status=status.HTTP_403_FORBIDDEN,
                )

        # FileResponse streams the blob and RFC 5987-encodes the filename.
        response = FileResponse(
            document.encrypted_file.open('rb'),
            as_attachment=True,
            filename=f'{document.file_name}.enc',
            content_type='application/octet-stream',
        )
        response['Cache-Control'] = 'no-store'
        return response
