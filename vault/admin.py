from django.contrib import admin

from .models import EncryptedDocument


@admin.register(EncryptedDocument)
class EncryptedDocumentAdmin(admin.ModelAdmin):
    list_display = ('file_name', 'uploader_wallet', 'required_nft_address', 'file_size', 'uploaded_at')
    list_filter = ('uploaded_at',)
    search_fields = ('file_name', 'uploader_wallet', 'required_nft_address', 'public_id')
    readonly_fields = ('public_id', 'uploader_wallet', 'encrypted_file', 'file_size', 'uploaded_at')
