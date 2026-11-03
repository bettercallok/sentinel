import { useCallback, useState } from 'react';
import { useCopy } from '../hooks/useCopy';
import { formatBytes, truncateAddress } from '../lib/format';
import { saveBlob } from '../lib/download';
import { buildShareLink } from '../lib/share';
import type { DocumentResponse } from '../types';

interface SuccessScreenProps {
  document: DocumentResponse;
  encryptionKey: string;
  onBack: () => void;
}

export function SuccessScreen({ document: doc, encryptionKey, onBack }: SuccessScreenProps) {
  const copy = useCopy();
  const [copied, setCopied] = useState(false);

  const copyKey = useCallback(async () => {
    if (await copy(encryptionKey, 'Encryption key copied to clipboard!')) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [copy, encryptionKey]);

  const downloadKey = useCallback(() => {
    const text = [
      'Sentinel decryption key',
      `File: ${doc.file_name}`,
      `Document ID: ${doc.public_id}`,
      `NFT gate: ${doc.required_nft_address}`,
      `Key: ${encryptionKey}`,
      '',
      'Anyone with this key and the required NFT can decrypt the file. Store it safely.',
      '',
    ].join('\n');
    saveBlob(new Blob([text], { type: 'text/plain' }), `${doc.file_name}.sentinel-key.txt`);
  }, [doc, encryptionKey]);

  return (
    <section className="screen active" id="screenSuccess">
      <div className="success-content">
        <div className="success-icon">🛡</div>
        <h2 className="success-title">Sealed &amp; Protected</h2>
        <p className="success-message">
          Your document has been encrypted and uploaded to the vault.
          Only holders of the specified NFT can unlock it.
        </p>

        <div className="success-details" id="successDetails">
          <div className="success-detail-row">
            <span className="success-detail-label">File</span>
            <span className="success-detail-value">{doc.file_name}</span>
          </div>
          <div className="success-detail-row">
            <span className="success-detail-label">Size</span>
            <span className="success-detail-value">{formatBytes(doc.file_size)}</span>
          </div>
          <div className="success-detail-row">
            <span className="success-detail-label">Uploader</span>
            <span className="success-detail-value">{truncateAddress(doc.uploader_wallet)}</span>
          </div>
          <div className="success-detail-row">
            <span className="success-detail-label">NFT Gate</span>
            <span className="success-detail-value">{truncateAddress(doc.required_nft_address)}</span>
          </div>
          <div className="success-detail-row">
            <span className="success-detail-label">Uploaded</span>
            <span className="success-detail-value">{new Date(doc.uploaded_at).toLocaleString()}</span>
          </div>
        </div>

        <div className="encryption-key-display" id="encryptionKeyDisplay">
          <div className="key-warning">⚠️ Save this key — it cannot be recovered!</div>
          <div className="key-row">
            <label className="key-label">Encryption Key</label>
            <div className="key-value-wrapper">
              <code className="key-value" id="encryptionKeyValue">{encryptionKey}</code>
              <button
                type="button"
                className="btn-copy"
                onClick={copyKey}
                title="Copy to clipboard"
                aria-label="Copy encryption key"
              >
                {copied ? '✅' : '📋'}
              </button>
            </div>
          </div>
          <div className="share-actions">
            <button type="button" className="btn-ghost" onClick={downloadKey}>
              Save key as .txt
            </button>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => copy(buildShareLink(doc.public_id), 'Share link copied (key not included)')}
            >
              Copy share link
            </button>
            <button
              type="button"
              className="btn-ghost"
              title="The key is placed in the URL fragment, which is never sent to the server"
              onClick={() =>
                copy(buildShareLink(doc.public_id, encryptionKey), 'Share link with key copied — share it privately')
              }
            >
              Copy link + key
            </button>
          </div>
          <p className="form-hint" style={{ marginTop: '0.75rem' }}>
            Share links only work for wallets holding the NFT. A link with the key embedded unlocks the file in one
            step — only send it over a private channel.
          </p>
        </div>

        <button className="btn btn-primary" onClick={onBack}>
          <span className="btn-shine" />
          Upload Another
        </button>
      </div>
    </section>
  );
}
