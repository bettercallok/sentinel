from django.urls import path
from .views import GenerateNonceView, VerifySignatureView

urlpatterns = [
    path('nonce/', GenerateNonceView.as_view(), name='generate-nonce'),
    path('verify/', VerifySignatureView.as_view(), name='verify-signature'),
]