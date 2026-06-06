import { createContext, useCallback, useMemo, useState, type ReactNode } from 'react';
import type { AuthState } from '../types';
import { connectPhantom, disconnectPhantom, signMessage } from '../lib/wallet';
import * as api from '../lib/api';

interface AuthContextValue extends AuthState {
  connect: () => Promise<void>;
  disconnect: () => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

const TOKEN_KEY = 'sentinel_token';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [isConnected, setIsConnected] = useState(false);

  const connect = useCallback(async () => {
    // 1. Connect to Phantom
    const address = await connectPhantom();

    // 2. Request nonce from backend
    const nonceData = await api.requestNonce(address);

    // 3. Sign the nonce
    const signature = await signMessage(nonceData.nonce);

    // 4. Verify signature on backend
    const verifyData = await api.verifySignature(address, Array.from(signature));

    // 5. Store JWT
    localStorage.setItem(TOKEN_KEY, verifyData.token);
    setToken(verifyData.token);
    setWalletAddress(address);
    setIsConnected(true);
  }, []);

  const disconnect = useCallback(() => {
    disconnectPhantom();
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setWalletAddress(null);
    setIsConnected(false);
  }, []);



  const value = useMemo<AuthContextValue>(
    () => ({ walletAddress, isConnected, token, connect, disconnect }),
    [walletAddress, isConnected, token, connect, disconnect],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
