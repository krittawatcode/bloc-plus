import { useState } from 'react';
import { Link } from 'react-router-dom';
import { RouteTag } from '@/components/RouteTag';
import { ConfirmButton, Loading } from '@/components/ui';
import { ui } from '@/components/uiStyles';
import { useToast } from '@/components/toastContext';
import { friendly } from '@/data/backend';
import { useBackend } from '@/data/context';
import { useClearReport, useComments, useCoreData, useDeleteComment, useHideComment } from '@/data/queries';
import type { Comment, Route } from '@/domain/types';
import { ago, plural } from '@/lib/format';
import { useStageCollapsed, useStageScene } from '@/viewer/stageContext';
import c from '@/features/climber/RoutePage.module.css';
import { wallLabel } from './staffWall';
import s from './Staff.module.css';

type Show = 'all' | 'reported' | 'hidden';

/**
as * Moderation. Comments are grouped under their route; tap the route to see it on the wall.
 * Reported comments come first. Hidden comments stay here so they can come back.
 */
export function CommentsTab() {
  const backend = useBackend();
  const comments = useComments();
  const d = useCoreData();
  const hide = useHideComment();
  const clear = useClearReport();
  const del = useDeleteComment();
  const toast = useToast();
  const [show, setShow] = useState<Show>('all');
  const [routeFilter, setRouteFilter] = useState('');
  const [selected, setSelected] = useState<string | null>(null);

  const route = (id: string) => d.routes.find((r) => r.id === id);
  const baseOf = (r: Route | undefined) => (r?.baseId ? route(r.baseId) : undefined);
  const shown = selected ? route(selected) : undefined;

  useStageScene(
    shown ? { kind: 'route', wallId: shown.wallId, holds: shown.holds } : null,
    `comments:${shown?.id}:${d.holds.length}`,
    'Tap a route on a comment to see it on the wall.',
  );
  useStageCollapsed(!shown);

  if (comments.isLoading || d.isLoading) return <Loading />;
  const all = comments.data ?? [];
  const reported = all.filter((m) => m.reported && !m.hidden).length;
  const hidden = all.filter((m) => m.hidden).length;
  const list = all
    .filter((m) => (show === 'reported' ? m.reported && !m.hidden : show === 'hidden' ? m.hidden : true))
    .filter((m) => !routeFilter || m.routeId === routeFilter)
    .sort(
      (a, b) =>
        Number(b.reported && !b.hidden) - Number(a.reported && !a.hidden) ||
        b.createdAt.localeCompare(a.createdAt),
    );

  // Routes that have comments, grouped under their normal route so staff can find them.
  const withComments = new Set(all.map((m) => m.routeId));
  const options = d.routes
    .filter((r) => withComments.has(r.id))
    .map((r) => ({ id: r.id, label: r.type === 'base' ? r.name : `${baseOf(r)?.name ?? '?'} › ${r.name}` }))
    .sort((a, b) => a.label.localeCompare(b.label));

  const onError = (e: unknown) => toast(friendly(e));
  const pick = (id: string) => {
    setSelected((cur) => (cur === id ? null : id));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <>
      <div className={ui.chips} role="group" aria-label="Which comments">
        {(
          [
            ['all', `All ${all.length}`],
            ['reported', `Reported ${reported}`],
            ['hidden', `Hidden ${hidden}`],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            className={ui.chip}
            aria-pressed={show === k}
            onClick={() => setShow(k)}
          >
            {label}
          </button>
        ))}
      </div>
      {options.length > 1 && (
        <div className={ui.field}>
          <label className={ui.label} htmlFor="commentRoute">
            Route
          </label>
          <select
            id="commentRoute"
            className={ui.input}
            value={routeFilter}
            onChange={(e) => setRouteFilter(e.target.value)}
          >
            <option value="">All routes</option>
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label} ({plural(all.filter((m) => m.routeId === o.id).length, 'comment')})
              </option>
            ))}
          </select>
        </div>
      )}
      {shown && (
        <p className={ui.note}>
          Showing {shown.name} on the wall.{' '}
          <button type="button" className={ui.link} onClick={() => setSelected(null)}>
            Hide wall
          </button>
        </p>
      )}
      {list.length === 0 && (
        <p className={ui.empty}>{all.length ? 'No comments match.' : 'No comments yet.'}</p>
      )}
      {groupByRoute(list).map(([routeId, group]) => {
        const r = route(routeId);
        return (
          <section
            key={routeId}
            className={c.commentGroup}
            aria-label={`Comments on ${r?.name ?? 'a removed route'}`}
          >
            <div className={s.commentRoute}>
              <RouteTag
                route={r}
                base={baseOf(r)}
                grading={d.settings?.grading}
                wallName={r ? wallLabel(d.walls, r.wallId) : undefined}
                onClick={r ? () => pick(r.id) : undefined}
                pressed={selected === routeId}
              />
              {r && (
                <Link to={r.type === 'base' ? `/r/${r.id}` : `/x/${r.id}`} className={ui.link}>
                  Climber view
                </Link>
              )}
            </div>
            {group.map((m: Comment) => (
              <article key={m.id} className={m.hidden ? c.hiddenComment : c.comment}>
                <header className={c.commentHead}>
                  <strong>{m.nick}</strong>
                  <span className={`${ui.muted} ${ui.smallText}`}>{ago(m.createdAt)}</span>
                  {m.beta && <span className={ui.pillBeta}>Beta</span>}
                  {m.reported && <span className={ui.pillReported}>Reported</span>}
                  {m.hidden && <span className={`${ui.muted} ${ui.smallText}`}>Hidden</span>}
                </header>
                {m.body && <p>{m.body}</p>}
                {m.photoPath && (
                  <img
                    className={c.photo}
                    src={backend.photoUrl(m.photoPath)}
                    alt={`Photo from ${m.nick}`}
                    loading="lazy"
                  />
                )}
                <div className={c.actions}>
                  <button
                    type="button"
                    className={ui.link}
                    onClick={() => hide.mutate({ id: m.id, hidden: !m.hidden }, { onError })}
                  >
                    {m.hidden ? 'Show again' : 'Hide'}
                  </button>
                  {m.reported && (
                    <button type="button" className={ui.link} onClick={() => clear.mutate(m.id, { onError })}>
                      Keep, clear report
                    </button>
                  )}
                  <ConfirmButton
                    className={`${ui.link} ${ui.danger}`}
                    confirmText="Tap again to delete"
                    onConfirm={() => del.mutate(m, { onError })}
                  >
                    Delete
                  </ConfirmButton>
                </div>
              </article>
            ))}
          </section>
        );
      })}
    </>
  );
}

/** One group per route, in the order the list is already sorted (reported and newest first). */
function groupByRoute(list: Comment[]): [string, Comment[]][] {
  const groups = new Map<string, Comment[]>();
  for (const m of list) groups.set(m.routeId, [...(groups.get(m.routeId) ?? []), m]);
  return [...groups];
}
