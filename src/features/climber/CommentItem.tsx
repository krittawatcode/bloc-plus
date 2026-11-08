import { useState, type ReactNode } from 'react';
import { ui } from '@/components/uiStyles';
import { useToast } from '@/components/toastContext';
import { friendly } from '@/data/backend';
import { useBackend } from '@/data/context';
import { useReportComment } from '@/data/queries';
import type { Comment } from '@/domain/types';
import { ago } from '@/lib/format';
import s from './RoutePage.module.css';

/** One climber comment. Beta stays blurred until tapped. `route` labels which route it is about. */
export function CommentItem({ comment: c, route }: { comment: Comment; route?: ReactNode }) {
  const backend = useBackend();
  const report = useReportComment();
  const toast = useToast();
  const [revealed, setRevealed] = useState(false);
  const hide = c.beta && !revealed;
  return (
    <article className={s.comment}>
      {route}
      <header className={s.commentHead}>
        <strong>{c.nick}</strong>
        <span className={`${ui.muted} ${ui.smallText}`}>{ago(c.createdAt)}</span>
        {c.beta && <span className={ui.pillBeta}>Beta</span>}
      </header>
      {c.body && <p className={hide ? s.blur : undefined}>{c.body}</p>}
      {c.photoPath && (
        <img
          className={`${s.photo} ${hide ? s.blur : ''}`}
          src={backend.photoUrl(c.photoPath)}
          alt={`Photo from ${c.nick}`}
          loading="lazy"
        />
      )}
      <div className={s.actions}>
        {hide && (
          <button type="button" className={ui.link} onClick={() => setRevealed(true)}>
            Show beta
          </button>
        )}
        {c.reported ? (
          <span className={`${ui.muted} ${ui.smallText}`}>Reported. Staff will review it.</span>
        ) : (
          <button
            type="button"
            className={ui.link}
            onClick={() =>
              report.mutate(c.id, {
                onSuccess: () => toast('Thanks. Staff will review it.'),
                onError: (e) => toast(friendly(e)),
              })
            }
          >
            Report
          </button>
        )}
      </div>
    </article>
  );
}
