from django.db import models
import uuid

class WalletNonce(models.Model):
    wallet_address = models.CharField(max_length=255, unique=True)
    # uuid4 generates a cryptographically secure random string
    nonce = models.UUIDField(default=uuid.uuid4, editable=False) 
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.wallet_address[:8]}... - {self.nonce}"