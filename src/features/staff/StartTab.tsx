import { useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { GradeBadge, Loading } from '@/components/ui';
import { ui } from '@/components/uiStyles';
import { useToast } from '@/components/toastContext';
import { friendly } from '@/data/backend';
import { useComments, useCoreData, useRatings, useSaveRoutes, useSendCounts } from '@/data/queries';
import { ExtraRowBody, RouteTools } from '@/features/climber/shared';
import { useGhostPref } from '@/features/climber/useClimberData';
import { useStageScene } from '@/viewer/stageContext';
import s from './Staff.module.css';

/** One normal route for staff: only its holds in 3D, plus its extras to add, edit and archive. */
export function StartTab() {
  const { baseId } = useParams();
  const d = useCoreData();
  const save = useSaveRoutes();
  const counts = useSendCounts();
  const ratings = useRatings();
  const comments = useComments();
  const toast = useToast();
  const location = useLocation();
  const [ghost, setGhost] = useGhostPref();
  const [preview] = useState<string | null>((location.state as { preview?: string } | null)?.preview ?? null);
  const base = d.routes.find((r) => r.id === baseId && r.type === 'base');
  const extras = d.routes.filter((r) => r.baseId === base?.id);
  // The wall shows the normal route, or the extra being previewed.
  const shown = extras.find((x) => x.id === preview) ?? base;

  useStageScene(
    shown ? { kind: 'route', wallId: shown.wallId, holds: shown.holds, ghost } : null,
    `staff-start:${shown?.id}:${ghost}:${d.holds.length}`,
    d.isLoading ? 'Loading…' : 'This route no longer exists.',
  );

  if (d.isLoading) return <Loading />;
  if (!base)
    return (
      <>
        <p className={ui.empty}>This route no longer exists.</p>
        <Link to="/staff/routes" className={ui.back}>
          All routes
        </Link>
      </>
    );

  return (
    <>
      <RouteTools ghost={ghost} onGhost={setGhost} />
      <Link to="/staff/routes" className={ui.back}>
        All routes
      </Link>
      <div className={ui.head}>
        <p className={ui.eyebrow}>{base.section || 'Normal route'}</p>
        <h2>
          <span className={ui.tapeInline} style={{ background: base.color ?? '#999' }} />
          {base.name} <GradeBadge grading={d.settings?.grading} id={base.grade} />
        </h2>
        <p className={ui.muted}>
          {shown === base
            ? `The wall shows the normal ${base.name} route. Tap an extra to edit it.`
            : `The wall shows ${shown?.name}.`}
        </p>
      </div>
      <div className={ui.actions}>
        <Link to={`/staff/routes/new/${base.id}/elim`} className={`${ui.btn} ${ui.primary}`}>
          + Elimination
        </Link>
        <Link to={`/staff/routes/new/${base.id}/new`} className={`${ui.btn} ${ui.primary}`}>
          + New route
        </Link>
      </div>
      <h3>Extra routes from this start</h3>
      {extras.length ? (
        <ul className={ui.list}>
          {extras.map((x) => (
            <li key={x.id} className={x.archived ? s.archived : undefined}>
              <Link to={`/staff/routes/${x.id}`} className={ui.row} aria-label={`Edit ${x.name}`}>
                <ExtraRowBody
                  route={x}
                  grading={d.settings?.grading}
                  sends={counts.data?.[x.id] ?? 0}
                  comments={(comments.data ?? []).filter((c) => c.routeId === x.id).length}
                  rating={ratings.data?.[x.id]}
                />
              </Link>
              <div className={s.extraActions}>
                <button
                  type="button"
                  className={ui.link}
                  disabled={save.isPending}
                  onClick={() =>
                    save.mutate([{ ...x, archived: !x.archived }], {
                      onSuccess: () =>
                        toast(x.archived ? 'Restored.' : 'Archived. Climbers no longer see it.'),
                      onError: (e) => toast(friendly(e)),
                    })
                  }
                >
                  {x.archived ? 'Restore' : 'Archive'}
                </button>
                <Link to={`/x/${x.id}`} className={ui.link}>
                  Climber view
                </Link>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className={ui.empty}>No extras yet. Add an elimination or a new route.</p>
      )}
      <div className={ui.actions}>
        <Link to={`/staff/routes/${base.id}`} className={ui.link}>
          Edit normal route
        </Link>
        <Link to={`/r/${base.id}`} className={ui.link}>
          Climber view
        </Link>
      </div>
    </>
  );
}
