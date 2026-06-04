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
  if (provider) {
    provider.disconnect();
  }
}
