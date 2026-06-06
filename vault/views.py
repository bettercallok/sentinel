import jwt
import requests
from django.conf import settings
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.parsers import MultiPartParser, FormParser
from django.http import FileResponse, StreamingHttpResponse
from .models import EncryptedDocument
from .serializers import EncryptedDocumentSerializer

def check_nft_ownership(wallet_address, nft_mint_address):
    """
    Queries the Solana blockchain to verify if a wallet holds a specific token/NFT.
    Uses SOLANA_RPC_URL env var for a dedicated RPC (e.g. Helius, Alchemy free tier)
    to avoid rate limits on the public shared endpoint.
    """
    import os
    url = os.environ.get('SOLANA_RPC_URL', 'https://api.mainnet-beta.solana.com')
    headers = {"Content-Type": "application/json"}
    payload = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "getTokenAccountsByOwner",
        "params": [
            wallet_address,
            {"mint": nft_mint_address},
            {"encoding": "jsonParsed"}
        ]
    }
    
    try:
        resp = requests.post(url, json=payload, headers=headers, timeout=5).json()
        accounts = resp.get('result', {}).get('value', [])
        
        # Check if any account holding this mint has a balance > 0
        for acc in accounts:
            amount = int(acc['account']['data']['parsed']['info']['tokenAmount']['amount'])
            if amount > 0:
                return True
        return False
    except Exception as e:
        print(f"RPC Error: {e}")
        return False


class FileUploadView(APIView):
    # This allows the view to handle file uploads (multipart data)
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request, *args, **kwargs):
        # JWT Authentication
        auth_header = request.headers.get('Authorization')
        if not auth_header or not auth_header.startswith('Bearer '):
            return Response({'error': 'Unauthorized. Missing token.'}, status=status.HTTP_401_UNAUTHORIZED)
        token = auth_header.split(' ')[1]
        try:
            payload = jwt.decode(token, settings.SECRET_KEY, algorithms=['HS256'])
            uploader_wallet = payload['wallet_address']
        except jwt.ExpiredSignatureError:
            return Response({'error': 'Session expired. Please reconnect wallet.'}, status=status.HTTP_401_UNAUTHORIZED)
        except jwt.InvalidTokenError:
            return Response({'error': 'Invalid token.'}, status=status.HTTP_401_UNAUTHORIZED)

        file_obj = request.FILES.get('encrypted_file')
        if file_obj and file_obj.size > 50 * 1024 * 1024:
            return Response({'error': 'File too large. Maximum size is 50MB.'}, status=status.HTTP_400_BAD_REQUEST)

        # Override uploader_wallet with trusted value from JWT
        data = request.data.copy()
        data['uploader_wallet'] = uploader_wallet
        serializer = EncryptedDocumentSerializer(data=data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class FileListView(APIView):
    """List all encrypted documents uploaded by a specific wallet."""

    def get(self, request):
        # JWT Authentication
        auth_header = request.headers.get('Authorization')
        if not auth_header or not auth_header.startswith('Bearer '):
            return Response({'error': 'Unauthorized. Missing token.'}, status=status.HTTP_401_UNAUTHORIZED)
        token = auth_header.split(' ')[1]
        try:
            payload = jwt.decode(token, settings.SECRET_KEY, algorithms=['HS256'])
            wallet = payload['wallet_address']
        except jwt.ExpiredSignatureError:
            return Response({'error': 'Session expired. Please reconnect wallet.'}, status=status.HTTP_401_UNAUTHORIZED)
        except jwt.InvalidTokenError:
            return Response({'error': 'Invalid token.'}, status=status.HTTP_401_UNAUTHORIZED)

        documents = EncryptedDocument.objects.filter(
            uploader_wallet=wallet
        ).order_by('-uploaded_at')

        serializer = EncryptedDocumentSerializer(documents, many=True)
        return Response(serializer.data)


class FileDownloadView(APIView):
    """Serve an encrypted file blob ONLY if the user owns the required NFT."""

    def get(self, request, pk):
        # 1. JWT Authentication Check
        auth_header = request.headers.get('Authorization')
        if not auth_header or not auth_header.startswith('Bearer '):
            return Response({'error': 'Unauthorized. Missing token.'}, status=status.HTTP_401_UNAUTHORIZED)

        token = auth_header.split(' ')[1]
        try:
            payload = jwt.decode(token, settings.SECRET_KEY, algorithms=['HS256'])
            downloader_wallet = payload['wallet_address']
        except jwt.ExpiredSignatureError:
            return Response({'error': 'Session expired. Please reconnect wallet.'}, status=status.HTTP_401_UNAUTHORIZED)
        except jwt.InvalidTokenError:
            return Response({'error': 'Invalid token.'}, status=status.HTTP_401_UNAUTHORIZED)

        # 2. Fetch Document
        try:
            document = EncryptedDocument.objects.get(pk=pk)
        except EncryptedDocument.DoesNotExist:
            return Response({'error': 'Document not found'}, status=status.HTTP_404_NOT_FOUND)

        # 3. The Gatekeeper: Check Solana Blockchain
        # Note: We automatically bypass the check for the person who uploaded the file.
        # IF YOU WANT TO TEST THE REJECTION ON YOURSELF, temporarily comment out the 'if' line below!
        if document.uploader_wallet != downloader_wallet:
            owns_nft = check_nft_ownership(downloader_wallet, document.required_nft_address)
            if not owns_nft:
                return Response(
                    {'error': f'Access Denied. Wallet {downloader_wallet[:4]}... does not hold the required NFT.'}, 
                    status=status.HTTP_403_FORBIDDEN
                )

        # 4. Serve File (works with both local filesystem and R2/S3 storage)
        file_field = document.encrypted_file
        file_handle = file_field.open('rb')

        def file_iterator(f, chunk_size=8192):
            while True:
                chunk = f.read(chunk_size)
                if not chunk:
                    break
                yield chunk
            f.close()

        response = StreamingHttpResponse(
            file_iterator(file_handle),
            content_type='application/octet-stream',
        )
        response['Content-Disposition'] = f'attachment; filename="{document.file_name}.enc"'
        return response