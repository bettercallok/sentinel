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

/** Decode a base64 AES-256 key, or return null if it isn't one. */
function decodeKey(base64Key: string): Uint8Array<ArrayBuffer> | null {
  try {
    const binary = atob(base64Key.trim());
    if (binary.length !== 32) return null;
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  } catch {
    return null;
  }
}

export function isValidKey(base64Key: string): boolean {
  return decodeKey(base64Key) !== null;
}

export async function importKeyFromBase64(base64Key: string): Promise<CryptoKey> {
  const bytes = decodeKey(base64Key);
  if (!bytes) {
    throw new Error('That does not look like a Sentinel key (expected a 44-character base64 string).');
  }
  return window.crypto.subtle.importKey(
    'raw',
    bytes,
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

  let decryptedBuffer: ArrayBuffer;
  try {
    decryptedBuffer = await window.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: new Uint8Array(iv) },
      key,
      ciphertext,
    );
  } catch {
    // AES-GCM authentication failed: the key is wrong or the blob was altered.
    throw new Error('Wrong key, or the file is corrupted.');
  }

  return new Blob([decryptedBuffer]);
}
