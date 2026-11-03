from django.urls import path

from .views import GenerateNonceView, MeView, VerifySignatureView

urlpatterns = [
    path('nonce/', GenerateNonceView.as_view(), name='generate-nonce'),
    path('verify/', VerifySignatureView.as_view(), name='verify-signature'),
    path('me/', MeView.as_view(), name='auth-me'),
]
