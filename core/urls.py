"""Root URL configuration for the Sentinel API."""
from django.conf import settings
from django.contrib import admin
from django.urls import include, path

from .views import HealthView, RootView

# Note: MEDIA_URL is deliberately *not* served. Encrypted blobs must only be
# reachable through the NFT-gated download endpoint.
urlpatterns = [
    path('', RootView.as_view(), name='root'),
    path(settings.ADMIN_URL, admin.site.urls),
    path('api/health/', HealthView.as_view(), name='health'),
    path('api/vault/', include('vault.urls')),
    path('api/auth/', include('authentication.urls')),
]
