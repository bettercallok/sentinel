import { useCallback, useState } from 'react';

interface KeyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (key: string) => void;
}

export function KeyModal({ isOpen, onClose, onConfirm }: KeyModalProps) {
  const [keyValue, setKeyValue] = useState('');

  const handleConfirm = useCallback(() => {
    const trimmed = keyValue.trim();
    if (!trimmed) return;
    onConfirm(trimmed);
    setKeyValue('');
  }, [keyValue, onConfirm]);

  const handleClose = useCallback(() => {
    setKeyValue('');
    onClose();
  }, [onClose]);

  return (
    <div
      className={`modal-overlay${isOpen ? ' active' : ''}`}
      id="keyPromptModal"
    >
      <div className="modal-content">
        <h3 className="upload-section-title" style={{ marginBottom: '0.5rem' }}>
          Unlock Document
        </h3>
        <p className="form-hint" style={{ marginBottom: '1.5rem' }}>
          Enter the AES-256 base64 key generated during upload.
        </p>

        <input
          type="text"
          className="form-input"
          id="decryptionKeyInput"
          placeholder="Paste encryption key here..."
          autoComplete="off"
          value={keyValue}
          onChange={(e) => setKeyValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleConfirm(); }}
        />

        <div className="form-actions" style={{ marginTop: '1.5rem', justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost" onClick={handleClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            id="decryptBtn"
            onClick={handleConfirm}
          >
            Decrypt &amp; Download
          </button>
        </div>
      </div>
    </div>
  );
}
