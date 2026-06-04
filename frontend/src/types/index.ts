// ─── Phantom Wallet Types ─────────────────────
export interface PhantomProvider {
  isPhantom: boolean;
  connect: () => Promise<{ publicKey: { toString: () => string } }>;
  disconnect: () => Promise<void>;
  signMessage: (message: Uint8Array, encoding: string) => Promise<{ signature: Uint8Array }>;
}

// ─── API Types ────────────────────────────────
export interface NonceResponse {
  wallet: string;
  nonce: string;
}

export interface VerifyResponse {
  status: string;
  message: string;
  token: string;
}

export interface DocumentResponse {
  id: number;
  file_name: string;
  uploader_wallet: string;
  required_nft_address: string;
  uploaded_at: string;
}

// ─── App State Types ──────────────────────────
export interface AuthState {
  walletAddress: string | null;
  isConnected: boolean;
  token: string | null;
}

export interface EncryptionResult {
  encryptedBlob: Blob;
  exportedKey: string;
}

// ─── Window Extension ─────────────────────────
declare global {
  interface Window {
    phantom?: {
      solana?: PhantomProvider;
    };
    solana?: PhantomProvider;
  }
}
