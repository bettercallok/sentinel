from django.db import models

# Create your models here.
class EncryptedDocument(models.Model):

    uploader_wallet=models.CharField(max_length=44)

    file_name=models.CharField(max_length=255)
    encrypted_file=models.FileField(upload_to='secure_blobs/')

    required_nft_address=models.CharField(max_length=44)
    uploaded_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.file_name}-Locked by {self.required_nft_address[:8]}"