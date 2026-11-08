import { useCallback, useRef, useState, type ReactNode } from 'react';
import { ToastContext } from './toastContext';
import s from './Toast.module.css';

export function ToastProvider({ children }: { children: ReactNode }) {
  const [text, setText] = useState<string | null>(null);
  const timer = useRef<number>(0);
  const show = useCallback((t: string) => {
    setText(t);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setText(null), 3200);
  }, []);
  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className={s.toast} role="status" aria-live="polite" hidden={!text}>
        {text}
      </div>
    </ToastContext.Provider>
  );
}
