import type {
  DocumentResponse,
  MeResponse,
  NonceResponse,
  SharedDocument,
  VerifyResponse,
} from '../types';

const BASE_URL = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

const API = {
  nonce: `${BASE_URL}/api/auth/nonce/`,
  verify: `${BASE_URL}/api/auth/verify/`,
  me: `${BASE_URL}/api/auth/me/`,
  upload: `${BASE_URL}/api/vault/upload/`,
  files: `${BASE_URL}/api/vault/files/`,
  document: (id: string) => `${BASE_URL}/api/vault/documents/${id}/`,
  download: (id: string) => `${BASE_URL}/api/vault/documents/${id}/download/`,
};

export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

// Called whenever an authenticated request comes back 401 (expired/invalid session).
let unauthorizedHandler: (() => void) | null = null;
export function setUnauthorizedHandler(handler: (() => void) | null): void {
  unauthorizedHandler = handler;
}

/** Turn DRF error bodies ({error}, {detail} or {field: [msgs]}) into one sentence. */
function extractMessage(body: unknown, fallback: string): string {
  if (!body || typeof body !== 'object') return fallback;
  const data = body as Record<string, unknown>;
  if (typeof data.error === 'string') return data.error;
  if (typeof data.detail === 'string') return data.detail;
  for (const value of Object.values(data)) {
    if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
    if (typeof value === 'string') return value;
  }
  return fallback;
}

async function request(
  url: string,
  init: RequestInit & { token?: string | null } = {},
  fallbackError = 'Request failed',
): Promise<Response> {
  const { token, headers, ...rest } = init;
  const finalHeaders = new Headers(headers);
  if (token) finalHeaders.set('Authorization', `Bearer ${token}`);

  let resp: Response;
  try {
    resp = await fetch(url, { ...rest, headers: finalHeaders });
  } catch {
    throw new ApiError('Network error — is the Sentinel API reachable?', 0);
  }

  if (!resp.ok) {
    const body = await resp.json().catch(() => null);
    if (resp.status === 401 && token) unauthorizedHandler?.();
    throw new ApiError(extractMessage(body, fallbackError), resp.status);
  }
  return resp;
}

function jsonBody(data: unknown): RequestInit {
  return {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  };
}

export async function requestNonce(walletAddress: string): Promise<NonceResponse> {
  const resp = await request(API.nonce, jsonBody({ wallet_address: walletAddress }), 'Failed to get login challenge');
  return resp.json();
}

export async function verifySignature(walletAddress: string, signature: number[]): Promise<VerifyResponse> {
  const resp = await request(
    API.verify,
    jsonBody({ wallet_address: walletAddress, signature }),
    'Signature verification failed',
  );
  return resp.json();
}

export async function getMe(token: string): Promise<MeResponse> {
  const resp = await request(API.me, { token }, 'Session check failed');
  return resp.json();
}

export async function uploadFile(formData: FormData, token: string): Promise<DocumentResponse> {
  const resp = await request(API.upload, { method: 'POST', body: formData, token }, 'Upload failed');
  return resp.json();
}

export async function listFiles(token: string): Promise<DocumentResponse[]> {
  const resp = await request(API.files, { token }, 'Failed to load files');
  return resp.json();
}

export async function getDocument(publicId: string, token: string): Promise<SharedDocument> {
  const resp = await request(API.document(publicId), { token }, 'Document not found');
  return resp.json();
}

export async function deleteDocument(publicId: string, token: string): Promise<void> {
  await request(API.document(publicId), { method: 'DELETE', token }, 'Failed to delete document');
}

export async function downloadFile(publicId: string, token: string): Promise<Blob> {
  const resp = await request(
    API.download(publicId),
    { token },
    'Failed to download document. Unauthorized.',
  );
  return resp.blob();
}
