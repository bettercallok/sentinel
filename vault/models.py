import uuid

from django.db import models


def encrypted_blob_path(instance, filename):
    """Store blobs under random names so paths never leak or collide."""
    return f'secure_blobs/{uuid.uuid4().hex}.enc'


class EncryptedDocument(models.Model):
    # Non-guessable identifier used in share links and the public API.
    public_id = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)

    uploader_wallet = models.CharField(max_length=44, db_index=True)

    file_name = models.CharField(max_length=255)
    encrypted_file = models.FileField(upload_to=encrypted_blob_path)
    file_size = models.BigIntegerField(default=0, help_text='Size of the encrypted blob in bytes.')

    required_nft_address = models.CharField(max_length=44)
    uploaded_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.file_name}-Locked by {self.required_nft_address[:8]}"
