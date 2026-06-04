/**
 * CryptoUtils — AES-256-GCM client-side encryption/decryption.
 *
 * Encrypted blob format: [12-byte IV][ciphertext + GCM auth tag]
 */

import type { EncryptionResult } from '../types';

export async function generateKey(): Promise<CryptoKey> {
  return window.crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true, // extractable — so we can export it for the user
    ['encrypt', 'decrypt'],
  );
}

export async function exportKeyToBase64(key: CryptoKey): Promise<string> {
  const raw = await window.crypto.subtle.exportKey('raw', key);
  const bytes = new Uint8Array(raw);
  let binary = '';
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary);
}

export async function importKeyFromBase64(base64Key: string): Promise<CryptoKey> {
  const binary = atob(base64Key);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return window.crypto.subtle.importKey(
    'raw',
    bytes.buffer,
    'AES-GCM',
    true,
    ['encrypt', 'decrypt'],
  );
}

export async function encryptFile(file: File, key: CryptoKey): Promise<EncryptionResult> {
  const fileBuffer = await file.arrayBuffer();
  const iv = window.crypto.getRandomValues(new Uint8Array(12));

  const ciphertext = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    fileBuffer,
  );

  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.length);

  const encryptedBlob = new Blob([combined], { type: 'application/octet-stream' });
  const exportedKey = await exportKeyToBase64(key);

  return { encryptedBlob, exportedKey };
}

export async function decryptFile(encryptedBlob: Blob, base64Key: string): Promise<Blob> {
  const key = await importKeyFromBase64(base64Key);
  const buffer = await encryptedBlob.arrayBuffer();

  const iv = buffer.slice(0, 12);
  const ciphertext = buffer.slice(12);

  const decryptedBuffer = await window.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: new Uint8Array(iv) },
    key,
    ciphertext,
  );

  return new Blob([decryptedBuffer]);
}
