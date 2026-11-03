/**
 * Share links look like `https://app/?doc=<public_id>` and may optionally
 * carry the key in the fragment: `#key=<base64>`. Browsers never send the
 * fragment to any server, so the key stays client-side.
 */

export interface ShareParams {
  docId: string | null;
  key: string | null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function buildShareLink(publicId: string, key?: string): string {
  const url = new URL(window.location.origin + window.location.pathname);
  url.searchParams.set('doc', publicId);
  if (key) url.hash = 'key=' + encodeURIComponent(key);
  return url.toString();
}

export function readShareParams(): ShareParams {
  const params = new URLSearchParams(window.location.search);
  const docId = params.get('doc');
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  return {
    docId: docId && UUID_RE.test(docId) ? docId : null,
    key: hash.get('key'),
  };
}

/** Remove share params (especially the key) from the address bar. */
export function clearShareParams(): void {
  window.history.replaceState(null, '', window.location.pathname);
}
