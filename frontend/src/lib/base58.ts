const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const INDEX = new Map([...ALPHABET].map((c, i) => [c, i]));

/** Decode a base58 string to bytes, or return null if it isn't valid base58. */
export function base58Decode(value: string): Uint8Array | null {
  const bytes: number[] = []; // little-endian accumulator
  for (const char of value) {
    const digit = INDEX.get(char);
    if (digit === undefined) return null;
    let carry = digit;
    for (let i = 0; i < bytes.length; i++) {
      carry += bytes[i] * 58;
      bytes[i] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  // Each leading '1' encodes a leading zero byte.
  for (const char of value) {
    if (char !== '1') break;
    bytes.push(0);
  }
  return new Uint8Array(bytes.reverse());
}

/** True if `value` is a base58 string that decodes to a 32-byte public key. */
export function isValidSolanaAddress(value: string): boolean {
  if (value.length < 32 || value.length > 44) return false;
  return base58Decode(value)?.length === 32;
}
