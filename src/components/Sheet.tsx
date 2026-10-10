'use client';

import { X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import s from './Sheet.module.css';

/** Bottom sheet on phones, centred dialog on desktop. Native <dialog> for focus trapping + Esc. */
export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      // showModal focuses the first focusable (the close button); move to the field
      // that asked for focus, if any — viewing a trade shouldn't pop the keyboard.
      requestAnimationFrame(() => d.querySelector<HTMLElement>('[data-autofocus]')?.focus());
    }
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={s.sheet}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      aria-label={title}
    >
      <div className={s.inner}>
        <div className={s.grab} aria-hidden />
        <header className={s.head}>
          <h2 className={s.title}>{title}</h2>
          <button className="btn btn-soft btn-icon btn-sm" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </header>
        {open && children}
      </div>
    </dialog>
  );
}
