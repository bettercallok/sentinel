import { useCallback, useEffect, useRef, useState, createContext, useContext, type ReactNode } from 'react';

type ToastType = 'info' | 'success' | 'error';

interface Toast {
  id: number;
  message: string;
  type: ToastType;
  exiting: boolean;
}

interface ToastContextValue {
  showToast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

let toastId = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const showToast = useCallback((message: string, type: ToastType = 'info') => {
    const id = ++toastId;
    setToasts((prev) => [...prev, { id, message, type, exiting: false }]);

    // Start exit animation after 4 seconds
    const exitTimer = setTimeout(() => {
      setToasts((prev) =>
        prev.map((t) => (t.id === id ? { ...t, exiting: true } : t)),
      );
      // Remove after exit animation
      const removeTimer = setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
        timersRef.current.delete(id);
      }, 300);
      timersRef.current.set(id, removeTimer);
    }, 4000);
    timersRef.current.set(id, exitTimer);
  }, []);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      timersRef.current.forEach((timer) => clearTimeout(timer));
    };
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="toast-container" id="toastContainer">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`toast ${toast.type}${toast.exiting ? ' exiting' : ''}`}
            style={toast.exiting ? { animation: 'fadeOutToast 300ms var(--ease-out) forwards' } : undefined}
          >
            <span>{toast.type === 'error' ? '✕' : '✓'}</span> {toast.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
