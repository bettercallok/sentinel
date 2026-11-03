import type { PhantomProvider } from '../types';

export function getPhantomProvider(): PhantomProvider | null {
  const provider = window.phantom?.solana || window.solana;
  if (provider?.isPhantom) return provider;
  return null;
}

export async function connectPhantom(): Promise<string> {
  const provider = getPhantomProvider();
  if (!provider) {
    throw new Error('Phantom wallet not found. Please install Phantom.');
  }
  const resp = await provider.connect();
  return resp.publicKey.toString();
}

export async function signMessage(message: string): Promise<Uint8Array> {
  const provider = getPhantomProvider();
  if (!provider) {
    throw new Error('Phantom wallet not found.');
  }
  const encoded = new TextEncoder().encode(message);
  const signed = await provider.signMessage(encoded, 'utf8');
  return signed.signature;
}

export function disconnectPhantom(): void {
  const provider = getPhantomProvider();
  provider?.disconnect().catch(() => {
    /* already disconnected */
  });
}

/**
 * Subscribe to Phantom account switches. The handler receives the new address,
 * or null when the wallet no longer exposes one. Returns an unsubscribe function.
 */
export function onAccountChanged(handler: (address: string | null) => void): () => void {
  const provider = getPhantomProvider();
  if (!provider?.on) return () => {};
  const listener = (publicKey?: { toString: () => string } | null) => {
    handler(publicKey ? publicKey.toString() : null);
  };
  provider.on('accountChanged', listener);
  return () => {
    if (provider.off) provider.off('accountChanged', listener);
    else provider.removeListener?.('accountChanged', listener);
  };
}
