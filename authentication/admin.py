from django.contrib import admin

from .models import WalletNonce


@admin.register(WalletNonce)
class WalletNonceAdmin(admin.ModelAdmin):
    list_display = ('wallet_address', 'created_at')
    search_fields = ('wallet_address',)
    readonly_fields = ('wallet_address', 'nonce', 'created_at')

    def has_add_permission(self, request):
        return False
