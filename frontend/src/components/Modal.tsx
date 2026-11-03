import { useEffect, useId, useRef, type ReactNode } from 'react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
}

/** Accessible modal shell: Esc / backdrop click closes, focus moves inside. */
export function Modal({ isOpen, onClose, title, description, children }: ModalProps) {
  const titleId = useId();
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    // Focus the first focusable element (or the dialog) once visible.
    const focusTimer = setTimeout(() => {
      const target = contentRef.current?.querySelector<HTMLElement>('[data-autofocus], input, button');
      (target ?? contentRef.current)?.focus();
    }, 50);
    return () => {
      clearTimeout(focusTimer);
      document.removeEventListener('keydown', onKey);
      previouslyFocused?.focus?.();
    };
  }, [isOpen, onClose]);

  return (
    <div
      className={`modal-overlay${isOpen ? ' active' : ''}`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      aria-hidden={!isOpen}
    >
      <div
        className="modal-content"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        ref={contentRef}
      >
        <h3 className="upload-section-title" id={titleId} style={{ marginBottom: '0.5rem' }}>
          {title}
        </h3>
        {description && (
          <p className="form-hint" style={{ marginBottom: '1.5rem' }}>
            {description}
          </p>
        )}
        {isOpen && children}
      </div>
    </div>
  );
}
