/** Save a Blob to disk via a temporary object URL. */
export function saveBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoking synchronously can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
