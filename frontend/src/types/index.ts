// ─── Phantom Wallet Types ─────────────────────
export interface PhantomPublicKey {
  toString: () => string;
}

export interface PhantomProvider {
  isPhantom: boolean;
  publicKey?: PhantomPublicKey | null;
  connect: (opts?: { onlyIfTrusted?: boolean }) => Promise<{ publicKey: PhantomPublicKey }>;
  disconnect: () => Promise<void>;
  signMessage: (message: Uint8Array, encoding: string) => Promise<{ signature: Uint8Array }>;
  on?: (event: 'accountChanged' | 'disconnect', handler: (arg?: PhantomPublicKey | null) => void) => void;
  off?: (event: 'accountChanged' | 'disconnect', handler: (arg?: PhantomPublicKey | null) => void) => void;
  removeListener?: (event: 'accountChanged' | 'disconnect', handler: (arg?: PhantomPublicKey | null) => void) => void;
}

// ─── API Types ────────────────────────────────
export interface NonceResponse {
  wallet: string;
  nonce: string;
  /** Human-readable sign-in message to be signed by the wallet. */
  message: string;
}

export interface VerifyResponse {
  status: string;
  message: string;
  token: string;
  wallet_address: string;
  expires_at: string;
}

export interface MeResponse {
  wallet_address: string;
  expires_at: string;
}

export interface DocumentResponse {
  id: number;
  public_id: string;
  file_name: string;
  file_size: number;
  uploader_wallet: string;
  required_nft_address: string;
  uploaded_at: string;
}

export interface SharedDocument {
  public_id: string;
  file_name: string;
  file_size: number;
  uploader_wallet: string;
  required_nft_address: string;
  uploaded_at: string;
  is_owner: boolean;
}

// ─── App State Types ──────────────────────────
export interface AuthState {
  walletAddress: string | null;
  isConnected: boolean;
  token: string | null;
  /** True while a stored session is being validated on startup. */
  isRestoring: boolean;
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
