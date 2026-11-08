import { useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { gradeLabel, levelOf } from '@/domain/grading';
import { TYPE_NAME } from '@/domain/routes';
import type { Grading, RouteType } from '@/domain/types';
import s from './ui.module.css';

export function GradeBadge({ grading, id }: { grading: Grading | undefined; id: string | null }) {
  const level = grading ? levelOf(grading, id) : undefined;
  if (!grading || !level) return <span className={s.gradeNone}>No grade</span>;
  return (
    <span className={level.special ? s.gradeSpecial : s.grade}>
      {level.color && <span className={s.swatch} style={{ background: level.color }} />}
      {gradeLabel(grading, level)}
    </span>
  );
}

export function TypePill({ type }: { type: RouteType }) {
  const cls = type === 'elim' ? s.pillElim : type === 'new' ? s.pillNew : s.pillBase;
  return <span className={cls}>{TYPE_NAME[type]}</span>;
}

/** A button that asks for a second tap before doing something that can't be undone. */
export function ConfirmButton({
  confirmText = 'Tap again to confirm',
  onConfirm,
  children,
  ...rest
}: { confirmText?: string; onConfirm: () => void; children: ReactNode } & Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'onClick'
>) {
  const [armed, setArmed] = useState(false);
  const timer = useRef<number>(0);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return (
    <button
      type="button"
      {...rest}
      onClick={() => {
        if (armed) {
          setArmed(false);
          onConfirm();
          return;
        }
        setArmed(true);
        timer.current = window.setTimeout(() => setArmed(false), 3000);
      }}
    >
      {armed ? confirmText : children}
    </button>
  );
}

export function Loading({ text = 'Loading…' }: { text?: string }) {
  return <p className={s.busy}>{text}</p>;
}
