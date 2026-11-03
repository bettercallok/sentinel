import type { ReactNode } from 'react';
import { Modal } from './Modal';

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  onClose: () => void;
}

export function ConfirmModal({ isOpen, title, message, confirmLabel, onConfirm, onClose }: ConfirmModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} description={message}>
      <div className="form-actions" style={{ justifyContent: 'flex-end' }}>
        <button type="button" className="btn btn-ghost" onClick={onClose} data-autofocus>
          Cancel
        </button>
        <button type="button" className="btn btn-danger" onClick={onConfirm}>
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
