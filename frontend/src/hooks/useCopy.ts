import { useCallback } from 'react';
import { useToast } from '../components/Toast';

export function useCopy() {
  const { showToast } = useToast();
  return useCallback(
    async (text: string, successMessage = 'Copied to clipboard') => {
      try {
        await navigator.clipboard.writeText(text);
        showToast(successMessage, 'success');
        return true;
      } catch {
        showToast('Failed to copy — please select and copy manually', 'error');
        return false;
      }
    },
    [showToast],
  );
}
