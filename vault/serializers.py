import os
import unicodedata

from django.conf import settings
from rest_framework import serializers

from core.solana import is_valid_solana_address

from .models import EncryptedDocument


def sanitize_file_name(value):
    """Keep only the base name and drop control / format characters."""
    name = os.path.basename(str(value).replace('\\', '/'))
    name = ''.join(ch for ch in name if unicodedata.category(ch)[0] != 'C')
    name = name.strip().strip('.')
    if len(name) > 255:
        stem, ext = os.path.splitext(name)
        ext = ext[:16]
        name = stem[: 255 - len(ext)] + ext
    return name


class EncryptedDocumentSerializer(serializers.ModelSerializer):
    # The blob itself is only reachable through the NFT-gated download
    # endpoint; never expose its storage URL (a pre-signed S3 URL in prod).
    encrypted_file = serializers.FileField(write_only=True)

    class Meta:
        model = EncryptedDocument
        fields = [
            'id', 'public_id', 'uploader_wallet', 'file_name', 'encrypted_file',
            'file_size', 'required_nft_address', 'uploaded_at',
        ]
        read_only_fields = ['id', 'public_id', 'uploader_wallet', 'file_size', 'uploaded_at']

    def validate_file_name(self, value):
        name = sanitize_file_name(value)
        if not name:
            raise serializers.ValidationError('Invalid file name.')
        return name

    def validate_required_nft_address(self, value):
        value = value.strip()
        if not is_valid_solana_address(value):
            raise serializers.ValidationError('Enter a valid Solana mint address.')
        return value

    def validate_encrypted_file(self, value):
        max_bytes = settings.VAULT_MAX_UPLOAD_BYTES
        if value.size > max_bytes:
            raise serializers.ValidationError(
                f'File too large. Maximum size is {max_bytes // (1024 * 1024)}MB.'
            )
        if value.size == 0:
            raise serializers.ValidationError('The submitted file is empty.')
        return value

    def create(self, validated_data):
        validated_data['file_size'] = validated_data['encrypted_file'].size
        return super().create(validated_data)


class SharedDocumentSerializer(serializers.ModelSerializer):
    """Metadata shown to anyone holding a share link."""

    is_owner = serializers.SerializerMethodField()

    class Meta:
        model = EncryptedDocument
        fields = [
            'public_id', 'file_name', 'file_size', 'required_nft_address',
            'uploader_wallet', 'uploaded_at', 'is_owner',
        ]

    def get_is_owner(self, obj):
        request = self.context.get('request')
        return bool(request and getattr(request.user, 'wallet_address', None) == obj.uploader_wallet)
