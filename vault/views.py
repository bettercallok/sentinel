from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.parsers import MultiPartParser, FormParser
from django.http import FileResponse
from .models import EncryptedDocument
from .serializers import EncryptedDocumentSerializer


class FileUploadView(APIView):
    # This allows the view to handle file uploads (multipart data)
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request, *args, **kwargs):
        serializer = EncryptedDocumentSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class FileListView(APIView):
    """List all encrypted documents uploaded by a specific wallet."""

    def get(self, request):
        wallet = request.query_params.get('wallet')
        if not wallet:
            return Response(
                {'error': 'wallet query parameter is required'},
                status=status.HTTP_400_BAD_REQUEST
            )

        documents = EncryptedDocument.objects.filter(
            uploader_wallet=wallet
        ).order_by('-uploaded_at')

        serializer = EncryptedDocumentSerializer(documents, many=True)
        return Response(serializer.data)


class FileDownloadView(APIView):
    """Serve an encrypted file blob by document ID."""

    def get(self, request, pk):
        try:
            document = EncryptedDocument.objects.get(pk=pk)
        except EncryptedDocument.DoesNotExist:
            return Response(
                {'error': 'Document not found'},
                status=status.HTTP_404_NOT_FOUND
            )

        file = document.encrypted_file
        response = FileResponse(
            file.open('rb'),
            content_type='application/octet-stream'
        )
        response['Content-Disposition'] = (
            f'attachment; filename="{document.file_name}.enc"'
        )
        return response