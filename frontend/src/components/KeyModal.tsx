import { useCallback, useState } from 'react';
import { Modal } from './Modal';
import { isValidKey } from '../lib/crypto';

interface KeyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (key: string) => void;
  fileName?: string;
  initialKey?: string;
}

function KeyForm({ onClose, onConfirm, initialKey = '' }: Omit<KeyModalProps, 'isOpen' | 'fileName'>) {
  const [keyValue, setKeyValue] = useState(initialKey);
  const [revealed, setRevealed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = useCallback(() => {
    const trimmed = keyValue.trim();
    if (!trimmed) {
      setError('Paste the key you saved when the file was uploaded.');
      return;
    }
    if (!isValidKey(trimmed)) {
      setError('That does not look like a Sentinel key (44-character base64 string).');
      return;
    }
    onConfirm(trimmed);
  }, [keyValue, onConfirm]);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        handleConfirm();
      }}
    >
      <div className="key-input-wrapper">
        <input
          type={revealed ? 'text' : 'password'}
          className={`form-input${error ? ' has-error' : ''}`}
          id="decryptionKeyInput"
          placeholder="Paste encryption key here..."
          autoComplete="off"
          spellCheck={false}
          data-autofocus
          value={keyValue}
          aria-invalid={!!error}
          aria-describedby={error ? 'decryptionKeyError' : undefined}
          onChange={(e) => {
            setKeyValue(e.target.value);
            setError(null);
          }}
        />
        <button
          type="button"
          className="key-reveal"
          onClick={() => setRevealed((v) => !v)}
          aria-label={revealed ? 'Hide key' : 'Show key'}
        >
          {revealed ? 'Hide' : 'Show'}
        </button>
      </div>
      {error && (
        <p className="form-error" id="decryptionKeyError" role="alert">
          {error}
        </p>
      )}

      <div className="form-actions" style={{ marginTop: '1.5rem', justifyContent: 'flex-end' }}>
        <button type="button" className="btn btn-ghost" onClick={onClose}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" id="decryptBtn">
          Decrypt &amp; Download
        </button>
      </div>
    </form>
  );
}

export function KeyModal({ isOpen, onClose, onConfirm, fileName, initialKey }: KeyModalProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Unlock Document"
      description={
        <>
          Enter the AES-256 key generated during upload
          {fileName ? <> for <strong>{fileName}</strong></> : null}. It never leaves your browser.
        </>
      }
    >
      <KeyForm onClose={onClose} onConfirm={onConfirm} initialKey={initialKey} />
    </Modal>
  );
}
