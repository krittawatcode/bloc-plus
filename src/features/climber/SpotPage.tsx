import { Link, useParams } from 'react-router-dom';
import { GradeBadge, Loading } from '@/components/ui';
import { ui } from '@/components/uiStyles';
import { useStageScene } from '@/viewer/stageContext';
import rs from './RoutePage.module.css';
import { CommentItem } from './CommentItem';
import { ExtraRow, RouteTools } from './shared';
import { useClimberData, useGhostPref } from './useClimberData';

/** What a QR sticker opens: the normal route from this start, and its extras. */
export function SpotPage() {
  const { baseId } = useParams();
  const d = useClimberData();
  const [ghost, setGhost] = useGhostPref();
  const base = d.route(baseId);

  useStageScene(
    base ? { kind: 'route', wallId: base.wallId, holds: base.holds, ghost } : null,
    `spot:${base?.id}:${ghost}:${d.holds.length}`,
    d.isLoading ? 'Loading…' : 'This start is no longer here.',
  );

  if (d.isLoading) return <Loading />;
  if (!base || base.type !== 'base')
    return (
      <>
        <p className={ui.empty}>This start is no longer here. The wall may have been reset.</p>
        <Link to="/" className={ui.back}>
          All starts
        </Link>
      </>
    );
  const extras = d.extrasOf(base.id);
  // Newest comments across every extra from this start, each labelled with its route.
  const fromHere = extras
    .flatMap((x) => d.commentsOf(x.id))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const latest = fromHere.slice(0, 5);
  const total = fromHere.length;
  return (
    <>
      <RouteTools ghost={ghost} onGhost={setGhost} />
      <Link to="/" className={ui.back}>
        All starts
      </Link>
      <div className={ui.head}>
        <p className={ui.eyebrow}>QR start · {base.section || d.wallName(base.wallId)}</p>
        <h2>
          <span className={ui.tapeInline} style={{ background: base.color ?? '#999' }} />
          {base.name} <GradeBadge grading={d.settings?.grading} id={base.grade} />
        </h2>
        <p className={ui.muted}>
          The wall shows the normal {base.name} route. Pick an extra to see only its holds.
        </p>
      </div>
      {base.description && <p className={ui.desc}>{base.description}</p>}
      <h3>Extra routes from this start</h3>
      <ul className={ui.list}>
        {extras.length ? (
          extras.map((x) => (
            <li key={x.id}>
              <ExtraRow
                route={x}
                grading={d.settings?.grading}
                sends={d.counts[x.id] ?? 0}
                comments={d.commentsOf(x.id).length}
              />
            </li>
          ))
        ) : (
          <li className={ui.empty}>No extras here yet. Ask the staff to set one.</li>
        )}
      </ul>
      {latest.length > 0 && (
        <section className={ui.field} aria-label="Latest comments from this start">
          <h3>Latest from this start</h3>
          {groupByRoute(latest).map(([routeId, list]) => {
            const r = extras.find((x) => x.id === routeId);
            return (
              <div key={routeId} className={rs.commentGroup}>
                {/* The routes are listed just above, so only a short pointer is needed, and none
                    at all when this start has a single extra. */}
                {extras.length > 1 && r && (
                  <Link to={`/x/${routeId}`} className={rs.groupLink}>
                    {r.name} ›
                  </Link>
                )}
                {list.map((c) => (
                  <CommentItem key={c.id} comment={c} />
                ))}
              </div>
            );
          })}
          {total > latest.length && (
            <p className={`${ui.muted} ${ui.smallText}`}>
              Open a route to see all {total} comments on it and the others from this start.
            </p>
          )}
        </section>
      )}
    </>
  );
}

/** Groups comments under their route (one label per route), newest route first. */
function groupByRoute<C extends { routeId: string }>(list: C[]): [string, C[]][] {
  const groups = new Map<string, C[]>();
  for (const c of list) groups.set(c.routeId, [...(groups.get(c.routeId) ?? []), c]);
  return [...groups];
}
