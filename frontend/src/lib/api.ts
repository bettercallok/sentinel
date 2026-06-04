import type { NonceResponse, VerifyResponse, DocumentResponse } from '../types';

const BASE_URL = import.meta.env.VITE_API_URL || '';

const API = {
  nonce: `${BASE_URL}/api/auth/nonce/`,
  verify: `${BASE_URL}/api/auth/verify/`,
  upload: `${BASE_URL}/api/vault/upload/`,
  files: `${BASE_URL}/api/vault/files/`,
  download: `${BASE_URL}/api/vault/download/`,
};

function authHeaders(token: string): HeadersInit {
  return { Authorization: `Bearer ${token}` };
}

export async function requestNonce(walletAddress: string): Promise<NonceResponse> {
  const resp = await fetch(API.nonce, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ wallet_address: walletAddress }),
  });
  if (!resp.ok) throw new Error('Failed to get nonce');
  return resp.json();
}

export async function verifySignature(
  walletAddress: string,
  signature: number[],
): Promise<VerifyResponse> {
  const resp = await fetch(API.verify, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ wallet_address: walletAddress, signature }),
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(data.error || 'Signature verification failed');
  return data;
}

export async function uploadFile(
  formData: FormData,
  token: string,
): Promise<DocumentResponse> {
  const resp = await fetch(API.upload, {
    method: 'POST',
    headers: authHeaders(token),
    body: formData,
  });
  if (!resp.ok) {
    const errData = await resp.json();
    throw new Error(JSON.stringify(errData));
  }
  return resp.json();
}

export async function listFiles(
  token: string,
): Promise<DocumentResponse[]> {
  const resp = await fetch(API.files, {
    headers: authHeaders(token),
  });
  if (!resp.ok) throw new Error('Failed to load files');
  return resp.json();
}

export async function downloadFile(
  fileId: number,
  token: string,
): Promise<Blob> {
  const resp = await fetch(`${API.download}${fileId}/`, {
    headers: authHeaders(token),
  });
  if (!resp.ok) {
    const errData = await resp.json().catch(() => ({}));
    throw new Error(
      (errData as { error?: string }).error || 'Failed to download document. Unauthorized.',
    );
  }
  return resp.blob();
}
