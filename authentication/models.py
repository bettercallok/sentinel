import datetime
import uuid

from django.conf import settings
from django.db import models
from django.utils import timezone


class WalletNonce(models.Model):
    wallet_address = models.CharField(max_length=255, unique=True)
    # uuid4 generates a cryptographically secure random string
    nonce = models.UUIDField(default=uuid.uuid4, editable=False)
    created_at = models.DateTimeField(auto_now_add=True)

    @classmethod
    def expiry_cutoff(cls):
        return timezone.now() - datetime.timedelta(seconds=settings.NONCE_TTL_SECONDS)

    @property
    def is_expired(self):
        return self.created_at < self.expiry_cutoff()

    def __str__(self):
        return f"{self.wallet_address[:8]}... - {self.nonce}"
