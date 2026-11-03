import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useCopy } from '../hooks/useCopy';
import { useDocumentDownload } from '../hooks/useDocumentDownload';
import { KeyModal } from '../components/KeyModal';
import * as apiClient from '../lib/api';
import { formatBytes, truncateAddress } from '../lib/format';
import type { SharedDocument } from '../types';

interface SharedDocumentScreenProps {
  docId: string;
  initialKey: string | null;
  onDone: () => void;
}

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; doc: SharedDocument };

export function SharedDocumentScreen({ docId, initialKey, onDone }: SharedDocumentScreenProps) {
  const { token } = useAuth();
  const copy = useCopy();
  const { download, busy } = useDocumentDownload();
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    apiClient
      .getDocument(docId, token)
      .then((doc) => !cancelled && setState({ status: 'ready', doc }))
      .catch((err: unknown) => {
        if (cancelled) return;
        const message =
          err instanceof apiClient.ApiError && err.status === 404
            ? 'This document does not exist or was deleted by its owner.'
            : err instanceof Error
              ? err.message
              : 'Could not load document';
        setState({ status: 'error', message });
      });
    return () => {
      cancelled = true;
    };
  }, [docId, token]);

  const handleConfirm = useCallback(
    (key: string) => {
      if (state.status !== 'ready') return;
      setModalOpen(false);
      download(state.doc.public_id, state.doc.file_name, key);
    },
    [state, download],
  );

  const closeModal = useCallback(() => setModalOpen(false), []);

  return (
    <section className="screen active" id="screenShared">
      <div className="success-content">
        <div className="success-icon">🔐</div>
        <h2 className="success-title">Shared Document</h2>

        {state.status === 'loading' && <p className="success-message">Loading document details...</p>}

        {state.status === 'error' && (
          <>
            <p className="success-message">{state.message}</p>
            <button className="btn btn-primary" onClick={onDone}>Go to my vault</button>
          </>
        )}

        {state.status === 'ready' && (
          <>
            <p className="success-message">
              {state.doc.is_owner
                ? 'You uploaded this document, so you can always download it.'
                : 'Access requires holding the NFT below. Ownership is checked on-chain when you download.'}
            </p>

            <div className="success-details">
              <div className="success-detail-row">
                <span className="success-detail-label">File</span>
                <span className="success-detail-value">{state.doc.file_name}</span>
              </div>
              <div className="success-detail-row">
                <span className="success-detail-label">Size</span>
                <span className="success-detail-value">{formatBytes(state.doc.file_size)}</span>
              </div>
              <div className="success-detail-row">
                <span className="success-detail-label">Shared by</span>
                <span className="success-detail-value">{truncateAddress(state.doc.uploader_wallet)}</span>
              </div>
              <div className="success-detail-row">
                <span className="success-detail-label">NFT Gate</span>
                <button
                  type="button"
                  className="link-button success-detail-value"
                  title={`${state.doc.required_nft_address} — click to copy`}
                  onClick={() => copy(state.doc.required_nft_address, 'NFT address copied')}
                >
                  {truncateAddress(state.doc.required_nft_address)}
                </button>
              </div>
              <div className="success-detail-row">
                <span className="success-detail-label">Uploaded</span>
                <span className="success-detail-value">{new Date(state.doc.uploaded_at).toLocaleString()}</span>
              </div>
            </div>

            <div className="form-actions" style={{ justifyContent: 'center' }}>
              <button
                className={`btn btn-primary${busy ? ' loading' : ''}`}
                onClick={() => setModalOpen(true)}
                disabled={busy}
              >
                {busy ? <><span className="spinner" /> Working...</> : <><span className="btn-shine" />Unlock &amp; Download</>}
              </button>
              <button className="btn btn-ghost" onClick={onDone}>My vault</button>
            </div>

            <KeyModal
              isOpen={modalOpen}
              fileName={state.doc.file_name}
              initialKey={initialKey ?? undefined}
              onClose={closeModal}
              onConfirm={handleConfirm}
            />
          </>
        )}
      </div>
    </section>
  );
}
