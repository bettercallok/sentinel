from rest_framework import serializers 
from .models import EncryptedDocument

class EncryptedDocumentSerializer(serializers.ModelSerializer):
    class Meta:
        model=EncryptedDocument
        fields=['id','uploader_wallet','file_name','encrypted_file','required_nft_address','uploaded_at']
        read_only_fields=['uploaded_at']
        
