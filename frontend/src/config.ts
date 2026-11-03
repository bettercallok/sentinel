export const APP_VERSION = '2.1';

/** Must match VAULT_MAX_UPLOAD_BYTES on the backend (default 50 MB). */
export const MAX_UPLOAD_BYTES = Number(import.meta.env.VITE_MAX_UPLOAD_BYTES) || 50 * 1024 * 1024;

/** AES-GCM adds a 12-byte IV and a 16-byte tag to every encrypted file. */
export const ENCRYPTION_OVERHEAD_BYTES = 28;
