import { useCallback, useState } from 'react';
import { useToast } from '../components/Toast';
import type { DocumentResponse } from '../types';

function truncateAddress(addr: string | null): string {
  if (!addr) return '—';
  return addr.slice(0, 4) + '...' + addr.slice(-4);
}

interface SuccessScreenProps {
  document: DocumentResponse;
  encryptionKey: string;
  onBack: () => void;
}

export function SuccessScreen({ document: doc, encryptionKey, onBack }: SuccessScreenProps) {
  const { showToast } = useToast();
  const [copied, setCopied] = useState(false);

  const copyKey = useCallback(() => {
    navigator.clipboard
      .writeText(encryptionKey)
      .then(() => {
        showToast('Encryption key copied to clipboard!', 'success');
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {
        showToast('Failed to copy — please select and copy manually', 'info');
      });
  }, [encryptionKey, showToast]);

  return (
    <section className="screen active" id="screenSuccess">
      <div className="success-content">
        <div className="success-icon">🛡</div>
        <h2 className="success-title">Sealed &amp; Protected</h2>
        <p className="success-message">
          Your document has been encrypted and uploaded to the vault.
          Only holders of the specified NFT can unlock it.
        </p>

        {/* Upload Details */}
        <div className="success-details" id="successDetails">
          <div className="success-detail-row">
            <span className="success-detail-label">File</span>
            <span className="success-detail-value">{doc.file_name}</span>
          </div>
          <div className="success-detail-row">
            <span className="success-detail-label">Uploader</span>
            <span className="success-detail-value">
              {truncateAddress(doc.uploader_wallet)}
            </span>
          </div>
          <div className="success-detail-row">
            <span className="success-detail-label">NFT Gate</span>
            <span className="success-detail-value">
              {truncateAddress(doc.required_nft_address)}
            </span>
          </div>
          <div className="success-detail-row">
            <span className="success-detail-label">Uploaded</span>
            <span className="success-detail-value">
              {new Date(doc.uploaded_at).toLocaleString()}
            </span>
          </div>
        </div>

        {/* Encryption Key Display */}
        <div className="encryption-key-display" id="encryptionKeyDisplay">
          <div className="key-warning">⚠️ Save this key — it cannot be recovered!</div>
          <div className="key-row">
            <label className="key-label">Encryption Key</label>
            <div className="key-value-wrapper">
              <code className="key-value" id="encryptionKeyValue">
                {encryptionKey}
              </code>
              <button
                type="button"
                className="btn-copy"
                onClick={copyKey}
                title="Copy to clipboard"
              >
                {copied ? '✅' : '📋'}
              </button>
            </div>
          </div>
        </div>

        <button className="btn btn-primary" onClick={onBack}>
          <span className="btn-shine" />
          Upload Another
        </button>
      </div>
    </section>
  );
}
