'use client';

import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { TERMS } from '@/lib/units';
import s from './Term.module.css';

/** A trader word with a one-line plain explanation on tap. */
export function Term({ word, children }: { word: keyof typeof TERMS | string; children?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const text = TERMS[word];

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  if (!text) return <>{children ?? word}</>;
  return (
    <span ref={ref} className={s.wrap}>
      <button type="button" className={s.word} aria-expanded={open} onClick={() => setOpen(!open)}>
        {children ?? word}
      </button>
      <AnimatePresence>
        {open && (
          <motion.span
            role="tooltip"
            className={s.tip}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
          >
            {text}
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}
