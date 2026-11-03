/** Read the `exp` claim (seconds) from a JWT without verifying it. */
export function getTokenExpiry(token: string): number | null {
  try {
    const part = token.split('.')[1];
    const json = atob(part.replace(/-/g, '+').replace(/_/g, '/'));
    const exp = JSON.parse(json).exp;
    return typeof exp === 'number' ? exp : null;
  } catch {
    return null;
  }
}

export function isTokenExpired(token: string, skewSeconds = 30): boolean {
  const exp = getTokenExpiry(token);
  return exp === null || exp * 1000 <= Date.now() + skewSeconds * 1000;
}
