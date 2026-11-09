from django.db import connection
from rest_framework.response import Response
from rest_framework.views import APIView


class HealthView(APIView):
    """Liveness/readiness probe: checks that the database answers."""

    authentication_classes = []
    throttle_classes = []

    def get(self, request):
        try:
            with connection.cursor() as cursor:
                cursor.execute('SELECT 1')
        except Exception:
            return Response({'status': 'error', 'database': 'unavailable'}, status=503)
        return Response({'status': 'ok', 'database': 'ok'})


class RootView(APIView):
    """Landing response for `/` so hosts (e.g. the Hugging Face Space page) show a status, not a 404.

    Only this read-only endpoint may be framed, and only by huggingface.co; every
    other response keeps `X-Frame-Options: DENY`.
    """

    authentication_classes = []
    throttle_classes = []

    def get(self, request):
        response = Response({
            'service': 'sentinel-api',
            'status': 'ok',
            'health': '/api/health/',
        })
        response.xframe_options_exempt = True
        response['Content-Security-Policy'] = "frame-ancestors 'self' https://huggingface.co"
        return response
