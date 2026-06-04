import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../components/Toast';
import { DropZone } from '../components/DropZone';
import { KeyModal } from '../components/KeyModal';
import * as apiClient from '../lib/api';
import * as crypto from '../lib/crypto';
import type { DocumentResponse } from '../types';

function truncateAddress(addr: string | null): string {
  if (!addr) return '—';
  return addr.slice(0, 4) + '...' + addr.slice(-4);
}

interface DashboardScreenProps {
  onUploadSuccess: (data: DocumentResponse, encryptionKey: string) => void;
}

export function DashboardScreen({ onUploadSuccess }: DashboardScreenProps) {
  const { walletAddress, token } = useAuth();
  const { showToast } = useToast();

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [nftAddress, setNftAddress] = useState('');
  const [uploading, setUploading] = useState(false);
  const [files, setFiles] = useState<DocumentResponse[]>([]);
  const [filesLoading, setFilesLoading] = useState(true);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [pendingDownload, setPendingDownload] = useState<{ fileId: number; fileName: string } | null>(null);

  // ─── Load vault files ──────────────────────
  const loadFiles = useCallback(async () => {
    if (!token) return;
    setFilesLoading(true);
    try {
      const data = await apiClient.listFiles(token);
      setFiles(data);
    } catch {
      showToast('Error loading vault files', 'error');
    } finally {
      setFilesLoading(false);
    }
  }, [token, showToast]);

  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  // ─── Upload ────────────────────────────────
  const handleUpload = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      if (!selectedFile) {
        showToast('Please select a file to upload', 'error');
        return;
      }
      if (!nftAddress.trim()) {
        showToast('Please enter an NFT address', 'error');
        return;
      }
      if (!token || !walletAddress) {
        showToast('Please connect your wallet first', 'error');
        return;
      }

      setUploading(true);
      try {
        // Client-side encryption
        showToast('Encrypting file...', 'info');
        const cryptoKey = await crypto.generateKey();
        const { encryptedBlob, exportedKey } = await crypto.encryptFile(selectedFile, cryptoKey);

        // Build FormData
        const formData = new FormData();
        formData.append('uploader_wallet', walletAddress);
        formData.append('file_name', selectedFile.name);
        formData.append('encrypted_file', encryptedBlob, selectedFile.name + '.enc');
        formData.append('required_nft_address', nftAddress.trim());

        const data = await apiClient.uploadFile(formData, token);

        showToast('Document encrypted & sealed!', 'success');
        onUploadSuccess(data, exportedKey);
      } catch (err) {
        console.error('Upload error:', err);
        showToast('Upload failed. Check the console for details.', 'error');
      } finally {
        setUploading(false);
      }
    },
    [selectedFile, nftAddress, token, walletAddress, showToast, onUploadSuccess],
  );

  const resetForm = useCallback(() => {
    setSelectedFile(null);
    setNftAddress('');
  }, []);

  // ─── Download flow ─────────────────────────
  const promptDownload = useCallback((fileId: number, fileName: string) => {
    setPendingDownload({ fileId, fileName });
    setModalOpen(true);
  }, []);

  const handleDecrypt = useCallback(
    async (keyInput: string) => {
      if (!pendingDownload || !token) return;
      setModalOpen(false);

      const { fileId, fileName } = pendingDownload;
      setPendingDownload(null);

      try {
        showToast('Retrieving encrypted blob...', 'info');
        const encryptedBlob = await apiClient.downloadFile(fileId, token);

        showToast('Decrypting document locally...', 'info');
        const decryptedBlob = await crypto.decryptFile(encryptedBlob, keyInput);

        // Trigger browser download
        const url = URL.createObjectURL(decryptedBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        showToast('Decryption successful!', 'success');
      } catch (err) {
        console.error('Decryption error:', err);
        const msg = err instanceof Error ? err.message : 'Unknown error';
        showToast(`Decryption failed: ${msg}`, 'error');
      }
    },
    [pendingDownload, token, showToast],
  );

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
            <div className="stat-value" id="sessionTime">{files.length}</div>
          </div>
        </div>

        {/* Upload Section */}
        <div className="upload-section">
          <h3 className="upload-section-title">Upload Document</h3>
          <p className="upload-section-desc">
            Select an encrypted file and specify the NFT address required for access.
          </p>

          <form id="uploadForm" onSubmit={handleUpload}>
            <DropZone
              onFileSelect={setSelectedFile}
              selectedFile={selectedFile}
              onFileRemove={() => setSelectedFile(null)}
            />

            <div className="form-group">
              <label className="form-label" htmlFor="nftAddress">
                Required NFT Address
              </label>
              <input
                className="form-input"
                type="text"
                id="nftAddress"
                name="required_nft_address"
                placeholder="e.g. AbC1dEf2GhI3jKl4MnO5pQr6StU7vWx8yZ..."
                value={nftAddress}
                onChange={(e) => setNftAddress(e.target.value)}
                required
              />
              <p className="form-hint">
                Only wallets holding this NFT will be able to access the file.
              </p>
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
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="17 8 12 3 7 8" />
                      <line x1="12" y1="3" x2="12" y2="15" />
                    </svg>
                    Upload to Vault
                  </>
                )}
              </button>
              <button type="button" className="btn btn-ghost" onClick={resetForm}>
                Clear
              </button>
            </div>
          </form>
        </div>

        {/* Vault Files Table */}
        <div className="upload-section" style={{ marginTop: '2rem' }}>
          <h3 className="upload-section-title">Your Vault</h3>
          <p className="upload-section-desc">
            Documents uploaded by your wallet address.
          </p>

          <div className="table-container">
            <table className="vault-table">
              <thead>
                <tr>
                  <th>File Name</th>
                  <th>NFT Gate</th>
                  <th>Date</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody id="vaultFilesBody">
                {filesLoading ? (
                  <tr>
                    <td colSpan={4} style={{ textAlign: 'center' }}>
                      Loading vault contents...
                    </td>
                  </tr>
                ) : files.length === 0 ? (
                  <tr>
                    <td
                      colSpan={4}
                      style={{ textAlign: 'center', color: 'var(--gray-3)' }}
                    >
                      No documents in your vault yet.
                    </td>
                  </tr>
                ) : (
                  files.map((file) => (
                    <tr key={file.id}>
                      <td>{file.file_name}</td>
                      <td className="mono-text">
                        {truncateAddress(file.required_nft_address)}
                      </td>
                      <td>{new Date(file.uploaded_at).toLocaleDateString()}</td>
                      <td>
                        <button
                          className="btn-ghost"
                          onClick={() => promptDownload(file.id, file.file_name)}
                        >
                          Download
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Decryption Key Modal */}
      <KeyModal
        isOpen={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setPendingDownload(null);
        }}
        onConfirm={handleDecrypt}
      />
    </section>
  );
}
