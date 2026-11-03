import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../components/Toast';
import { useCopy } from '../hooks/useCopy';
import { useDocumentDownload } from '../hooks/useDocumentDownload';
import { DropZone } from '../components/DropZone';
import { KeyModal } from '../components/KeyModal';
import { ConfirmModal } from '../components/ConfirmModal';
import * as apiClient from '../lib/api';
import * as crypto from '../lib/crypto';
import { isValidSolanaAddress } from '../lib/base58';
import { formatBytes, truncateAddress } from '../lib/format';
import { buildShareLink } from '../lib/share';
import { ENCRYPTION_OVERHEAD_BYTES, MAX_UPLOAD_BYTES } from '../config';
import type { DocumentResponse } from '../types';

interface DashboardScreenProps {
  onUploadSuccess: (data: DocumentResponse, encryptionKey: string) => void;
}

export function DashboardScreen({ onUploadSuccess }: DashboardScreenProps) {
  const { walletAddress, token } = useAuth();
  const { showToast } = useToast();
  const copy = useCopy();
  const { download } = useDocumentDownload();

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [nftAddress, setNftAddress] = useState('');
  const [nftTouched, setNftTouched] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [files, setFiles] = useState<DocumentResponse[]>([]);
  const [filesLoading, setFilesLoading] = useState(true);

  const [pendingDownload, setPendingDownload] = useState<DocumentResponse | null>(null);
  const [pendingDelete, setPendingDelete] = useState<DocumentResponse | null>(null);

  const trimmedNft = nftAddress.trim();
  const nftInvalid = trimmedNft.length > 0 && !isValidSolanaAddress(trimmedNft);

  // ─── Load vault files ──────────────────────
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    apiClient
      .listFiles(token)
      .then((data) => {
        if (!cancelled) setFiles(data);
      })
      .catch(() => {
        if (!cancelled) showToast('Error loading vault files', 'error');
      })
      .finally(() => {
        if (!cancelled) setFilesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token, showToast, reloadKey]);

  const refreshFiles = useCallback(() => {
    setFilesLoading(true);
    setReloadKey((k) => k + 1);
  }, []);

  // ─── Upload ────────────────────────────────
  const handleFileSelect = useCallback(
    (file: File) => {
      if (file.size + ENCRYPTION_OVERHEAD_BYTES > MAX_UPLOAD_BYTES) {
        showToast(`File too large. Maximum size is ${formatBytes(MAX_UPLOAD_BYTES)}.`, 'error');
        return;
      }
      if (file.size === 0) {
        showToast('That file is empty.', 'error');
        return;
      }
      setSelectedFile(file);
    },
    [showToast],
  );

  const handleUpload = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setNftTouched(true);

      if (!selectedFile) {
        showToast('Please select a file to upload', 'error');
        return;
      }
      if (!isValidSolanaAddress(trimmedNft)) {
        showToast('Please enter a valid Solana NFT mint address', 'error');
        return;
      }
      if (!token || !walletAddress) {
        showToast('Please connect your wallet first', 'error');
        return;
      }

      setUploading(true);
      try {
        showToast('Encrypting file in your browser...', 'info');
        const cryptoKey = await crypto.generateKey();
        const { encryptedBlob, exportedKey } = await crypto.encryptFile(selectedFile, cryptoKey);

        const formData = new FormData();
        formData.append('file_name', selectedFile.name);
        formData.append('encrypted_file', encryptedBlob, 'blob.enc');
        formData.append('required_nft_address', trimmedNft);

        const data = await apiClient.uploadFile(formData, token);

        showToast('Document encrypted & sealed!', 'success');
        onUploadSuccess(data, exportedKey);
      } catch (err) {
        console.error('Upload error:', err);
        showToast(err instanceof Error ? `Upload failed: ${err.message}` : 'Upload failed.', 'error');
      } finally {
        setUploading(false);
      }
    },
    [selectedFile, trimmedNft, token, walletAddress, showToast, onUploadSuccess],
  );

  const resetForm = useCallback(() => {
    setSelectedFile(null);
    setNftAddress('');
    setNftTouched(false);
  }, []);

  // ─── Download / delete ─────────────────────
  const handleDecrypt = useCallback(
    (key: string) => {
      if (!pendingDownload) return;
      const doc = pendingDownload;
      setPendingDownload(null);
      download(doc.public_id, doc.file_name, key);
    },
    [pendingDownload, download],
  );

  const handleDelete = useCallback(async () => {
    if (!pendingDelete || !token) return;
    const doc = pendingDelete;
    setPendingDelete(null);
    try {
      await apiClient.deleteDocument(doc.public_id, token);
      setFiles((prev) => prev.filter((f) => f.public_id !== doc.public_id));
      showToast(`Deleted ${doc.file_name}`, 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Delete failed', 'error');
    }
  }, [pendingDelete, token, showToast]);

  const closeKeyModal = useCallback(() => setPendingDownload(null), []);
  const closeDeleteModal = useCallback(() => setPendingDelete(null), []);

  return (
    <section className="screen active" id="screenDashboard">
      <div className="dashboard-content">
        <div className="dashboard-header">
          <h2 className="dashboard-greeting">Welcome to the Vault</h2>
          <p className="dashboard-subtext">
            Upload encrypted documents and gate access behind your NFT.
          </p>
        </div>

        {/* Stats Row */}
        <div className="stats-row">
          <div className="stat-card">
            <div className="stat-label">Status</div>
            <div className="stat-value">Verified ✓</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Network</div>
            <div className="stat-value">Solana</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Documents</div>
            <div className="stat-value">{filesLoading ? '—' : files.length}</div>
          </div>
        </div>

        {/* Upload Section */}
        <div className="upload-section">
          <h3 className="upload-section-title">Upload Document</h3>
          <p className="upload-section-desc">
            Your file is encrypted with AES-256 in this browser before upload. Choose the NFT a wallet must hold to download it.
          </p>

          <form id="uploadForm" onSubmit={handleUpload} noValidate>
            <DropZone
              onFileSelect={handleFileSelect}
              selectedFile={selectedFile}
              onFileRemove={() => setSelectedFile(null)}
            />

            <div className="form-group">
              <label className="form-label" htmlFor="nftAddress">
                Required NFT Mint Address
              </label>
              <input
                className={`form-input mono-input${nftTouched && nftInvalid ? ' has-error' : ''}`}
                type="text"
                id="nftAddress"
                name="required_nft_address"
                placeholder="e.g. AbC1dEf2GhI3jKl4MnO5pQr6StU7vWx8yZ..."
                value={nftAddress}
                spellCheck={false}
                autoComplete="off"
                aria-invalid={nftTouched && nftInvalid}
                aria-describedby="nftAddressHint"
                onChange={(e) => setNftAddress(e.target.value)}
                onBlur={() => setNftTouched(true)}
                required
              />
              {nftTouched && nftInvalid ? (
                <p className="form-error" id="nftAddressHint" role="alert">
                  That isn&apos;t a valid Solana address (base58, 32–44 characters).
                </p>
              ) : (
                <p className="form-hint" id="nftAddressHint">
                  Only wallets holding this NFT will be able to access the file.
                </p>
              )}
            </div>

            <div className="form-actions">
              <button
                type="submit"
                className={`btn btn-primary${uploading ? ' loading' : ''}`}
                id="uploadBtn"
                disabled={uploading}
              >
                {uploading ? (
                  <>
                    <span className="spinner" /> Processing...
                  </>
                ) : (
                  <>
                    <span className="btn-shine" />
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="17 8 12 3 7 8" />
                      <line x1="12" y1="3" x2="12" y2="15" />
                    </svg>
                    Upload to Vault
                  </>
                )}
              </button>
              <button type="button" className="btn btn-ghost" onClick={resetForm} disabled={uploading}>
                Clear
              </button>
            </div>
          </form>
        </div>

        {/* Vault Files Table */}
        <div className="upload-section" style={{ marginTop: '2rem' }}>
          <div className="section-header-row">
            <div>
              <h3 className="upload-section-title">Your Vault</h3>
              <p className="upload-section-desc">Documents uploaded by your wallet address.</p>
            </div>
            <button type="button" className="btn-ghost" onClick={refreshFiles} disabled={filesLoading}>
              Refresh
            </button>
          </div>

          <div className="table-container">
            <table className="vault-table">
              <thead>
                <tr>
                  <th>File Name</th>
                  <th>Size</th>
                  <th>NFT Gate</th>
                  <th>Date</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody id="vaultFilesBody">
                {filesLoading ? (
                  <tr>
                    <td colSpan={5} className="table-empty">Loading vault contents...</td>
                  </tr>
                ) : files.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="table-empty">No documents in your vault yet.</td>
                  </tr>
                ) : (
                  files.map((file) => (
                    <tr key={file.public_id}>
                      <td className="file-name-cell" title={file.file_name}>{file.file_name}</td>
                      <td className="mono-text">{formatBytes(file.file_size)}</td>
                      <td className="mono-text">
                        <button
                          type="button"
                          className="link-button"
                          title={`${file.required_nft_address} — click to copy`}
                          onClick={() => copy(file.required_nft_address, 'NFT address copied')}
                        >
                          {truncateAddress(file.required_nft_address)}
                        </button>
                      </td>
                      <td>{new Date(file.uploaded_at).toLocaleDateString()}</td>
                      <td>
                        <div className="row-actions">
                          <button type="button" className="btn-ghost" onClick={() => setPendingDownload(file)}>
                            Download
                          </button>
                          <button
                            type="button"
                            className="btn-ghost"
                            title="Copy a link NFT holders can use to download (key not included)"
                            onClick={() => copy(buildShareLink(file.public_id), 'Share link copied (key not included)')}
                          >
                            Share
                          </button>
                          <button
                            type="button"
                            className="btn-ghost btn-ghost-danger"
                            aria-label={`Delete ${file.file_name}`}
                            onClick={() => setPendingDelete(file)}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <KeyModal
        isOpen={pendingDownload !== null}
        fileName={pendingDownload?.file_name}
        onClose={closeKeyModal}
        onConfirm={handleDecrypt}
      />

      <ConfirmModal
        isOpen={pendingDelete !== null}
        title="Delete document?"
        message={
          <>
            <strong>{pendingDelete?.file_name}</strong> and its encrypted blob will be permanently removed.
            Anyone with a share link will lose access. This cannot be undone.
          </>
        }
        confirmLabel="Delete permanently"
        onConfirm={handleDelete}
        onClose={closeDeleteModal}
      />
    </section>
  );
}
