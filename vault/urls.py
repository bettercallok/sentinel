from django.urls import path

from .views import DocumentDetailView, FileDownloadView, FileListView, FileUploadView

urlpatterns = [
    path('upload/', FileUploadView.as_view(), name='file-upload'),
    path('files/', FileListView.as_view(), name='file-list'),
    path('documents/<uuid:public_id>/', DocumentDetailView.as_view(), name='document-detail'),
    path('documents/<uuid:public_id>/download/', FileDownloadView.as_view(), name='document-download'),
    # Legacy route kept for older clients; same NFT gate applies.
    path('download/<int:pk>/', FileDownloadView.as_view(), name='file-download'),
]
