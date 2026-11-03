import { useCallback, useState } from 'react';
import { useAuth } from './useAuth';
import { useToast } from '../components/Toast';
import * as apiClient from '../lib/api';
import * as crypto from '../lib/crypto';
import { saveBlob } from '../lib/download';

/** Fetches an encrypted blob through the NFT gate, decrypts it locally and saves it. */
export function useDocumentDownload() {
  const { token } = useAuth();
  const { showToast } = useToast();
  const [busy, setBusy] = useState(false);

  const download = useCallback(
    async (publicId: string, fileName: string, key: string): Promise<boolean> => {
      if (!token) {
        showToast('Please connect your wallet first', 'error');
        return false;
      }
      setBusy(true);
      try {
        showToast('Verifying access & retrieving encrypted blob...', 'info');
        const encryptedBlob = await apiClient.downloadFile(publicId, token);

        showToast('Decrypting document locally...', 'info');
        const decryptedBlob = await crypto.decryptFile(encryptedBlob, key);
        saveBlob(decryptedBlob, fileName);

        showToast('Decryption successful!', 'success');
        return true;
      } catch (err) {
        console.error('Download error:', err);
        const msg = err instanceof Error ? err.message : 'Unknown error';
        showToast(msg, 'error');
        return false;
      } finally {
        setBusy(false);
      }
    },
    [token, showToast],
  );

  return { download, busy };
}
