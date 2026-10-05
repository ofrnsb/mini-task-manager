import { useEffect, useRef, type ReactNode } from 'react';

interface Props {
  onClose: () => void;
  className?: string;
  labelledBy?: string;
  role?: 'dialog' | 'alertdialog';
  /** Modal dialogs trap focus and block the page. Non-modal ones (an inspector) leave it usable. */
  modal?: boolean;
  children: ReactNode;
}

/**
 * Native <dialog>: the browser handles the top layer, focus trapping (modal),
 * Escape, and returning focus to the element that opened it.
 */
export function Dialog({ onClose, className, labelledBy, role = 'dialog', modal = true, children }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    const el = ref.current!;
    const opener = document.activeElement as HTMLElement | null;
    // jsdom (tests) has no showModal; the content still renders.
    if (typeof el.showModal === 'function') {
      if (modal) el.showModal();
      else el.show();
    } else {
      el.setAttribute('open', '');
    }
    // showModal() focuses the first focusable element; prefer the one the content marks.
    el.querySelector<HTMLElement>('[data-autofocus]')?.focus();
    // Non-modal dialogs get no native Escape handling.
    const onKey = (e: KeyboardEvent) => !modal && e.key === 'Escape' && onCloseRef.current();
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      if (el.open && typeof el.close === 'function') el.close();
      opener?.focus?.();
    };
  }, [modal]);

  return (
    <dialog
      ref={ref}
      className={className}
      aria-labelledby={labelledBy}
      role={role}
      onCancel={(e) => {
        e.preventDefault(); // we unmount instead, so React stays the source of truth
        onClose();
      }}
      onClick={(e) => {
        // A click on the <dialog> itself (not its content) is a click on the backdrop.
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="dialog-body">{children}</div>
    </dialog>
  );
}
