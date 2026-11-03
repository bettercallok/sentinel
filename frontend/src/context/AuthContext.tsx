import { createContext, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { AuthState } from '../types';
import { connectPhantom, disconnectPhantom, onAccountChanged, signMessage } from '../lib/wallet';
import { isTokenExpired } from '../lib/jwt';
import * as api from '../lib/api';

interface AuthContextValue extends AuthState {
  connect: () => Promise<void>;
  disconnect: () => void;
}

// eslint-disable-next-line react-refresh/only-export-components
export const AuthContext = createContext<AuthContextValue | null>(null);

const TOKEN_KEY = 'sentinel_token';

function readStoredToken(): string | null {
  try {
    const stored = localStorage.getItem(TOKEN_KEY);
    if (stored && !isTokenExpired(stored)) return stored;
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage unavailable (private mode) */
  }
  return null;
}

function storeToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage unavailable */
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  // A stored token is only a candidate: it must be confirmed by /me before we
  // treat the user as connected, so an expired/revoked token can't get stuck.
  const [token, setToken] = useState<string | null>(readStoredToken);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isRestoring, setIsRestoring] = useState(() => token !== null);

  const clearSession = useCallback(() => {
    storeToken(null);
    setToken(null);
    setWalletAddress(null);
    setIsConnected(false);
    setIsRestoring(false);
  }, []);

  // Restore a stored session once on startup.
  useEffect(() => {
    if (!isRestoring || !token) return;
    let cancelled = false;
    api
      .getMe(token)
      .then((me) => {
        if (cancelled) return;
        setWalletAddress(me.wallet_address);
        setIsConnected(true);
        setIsRestoring(false);
      })
      .catch(() => {
        if (!cancelled) clearSession();
      });
    return () => {
      cancelled = true;
    };
  }, [isRestoring, token, clearSession]);

  // Any 401 from an authenticated API call ends the session.
  useEffect(() => {
    api.setUnauthorizedHandler(clearSession);
    return () => api.setUnauthorizedHandler(null);
  }, [clearSession]);

  // If the user switches accounts in Phantom, the session no longer matches.
  useEffect(() => {
    if (!isConnected || !walletAddress) return;
    return onAccountChanged((next) => {
      if (next !== walletAddress) clearSession();
    });
  }, [isConnected, walletAddress, clearSession]);

  const connect = useCallback(async () => {
    const address = await connectPhantom();
    const challenge = await api.requestNonce(address);
    const signature = await signMessage(challenge.message);
    const verifyData = await api.verifySignature(address, Array.from(signature));

    storeToken(verifyData.token);
    setToken(verifyData.token);
    setWalletAddress(address);
    setIsConnected(true);
    setIsRestoring(false);
  }, []);

  const disconnect = useCallback(() => {
    disconnectPhantom();
    clearSession();
  }, [clearSession]);

  const value = useMemo<AuthContextValue>(
    () => ({ walletAddress, isConnected, token, isRestoring, connect, disconnect }),
    [walletAddress, isConnected, token, isRestoring, connect, disconnect],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
