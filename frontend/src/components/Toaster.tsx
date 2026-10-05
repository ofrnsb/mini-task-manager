import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { Icon } from '../lib/icons';

type Kind = 'success' | 'info' | 'error';
interface Toast {
  id: number;
  kind: Kind;
  text: string;
}

const ToastContext = createContext<(kind: Kind, text: string) => void>(() => {});

export const useToast = () => useContext(ToastContext);

let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const dismiss = useCallback((id: number) => setToasts((ts) => ts.filter((t) => t.id !== id)), []);

  const push = useCallback(
    (kind: Kind, text: string) => {
      const id = nextId++;
      setToasts((ts) => [...ts.slice(-3), { id, kind, text }]);
      setTimeout(() => dismiss(id), kind === 'error' ? 8000 : 4000);
    },
    [dismiss],
  );

  const value = useMemo(() => push, [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toaster">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`} role={t.kind === 'error' ? 'alert' : 'status'}>
            <span className="toast-icon">
              {t.kind === 'error' ? <Icon.alert /> : t.kind === 'success' ? <Icon.check /> : <Icon.info />}
            </span>
            <span className="toast-text">{t.text}</span>
            <button className="icon-btn" aria-label="Dismiss" onClick={() => dismiss(t.id)}>
              <Icon.close />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
