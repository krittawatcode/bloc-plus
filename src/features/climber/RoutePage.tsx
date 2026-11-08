import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { GradeBadge, Loading } from '@/components/ui';
import { ui } from '@/components/uiStyles';
import { useToast } from '@/components/toastContext';
import { friendly } from '@/data/backend';
import { useAddSend } from '@/data/queries';
import { markersOf, TYPE_NAME } from '@/domain/routes';
import { device } from '@/lib/device';
import { plural } from '@/lib/format';
import { holdsOfWall } from '@/viewer/practiceWall';
import { useStageScene } from '@/viewer/stageContext';
import { Comments } from './Comments';
import { RouteTools } from './shared';
import { useClimberData, useGhostPref } from './useClimberData';
import s from './RoutePage.module.css';

/** One extra route: only its holds in 3D, the setter's notes, sends and comments. */
export function RoutePage() {
  const { routeId } = useParams();
  const d = useClimberData();
  const [ghost, setGhost] = useGhostPref();
  const route = d.route(routeId);
  const base = route?.baseId ? d.route(route.baseId) : undefined;

  useStageScene(
    route && !route.archived ? { kind: 'route', wallId: route.wallId, holds: route.holds, ghost } : null,
    `route:${route?.id}:${ghost}:${d.holds.length}`,
    d.isLoading ? 'Loading…' : 'This route has been taken down.',
  );
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [routeId]);

  if (d.isLoading) return <Loading />;
  if (!route || route.archived || !base)
    return (
      <>
        <p className={ui.empty}>This route has been taken down. The wall may have been reset.</p>
        <Link to="/" className={ui.back}>
          All starts
        </Link>
      </>
    );

  const wallHolds = holdsOfWall(route.wallId, d.holds);
  const hasMarkers = Object.keys(route.holds).some((id) => markersOf(wallHolds, id).length);
  let help =
    route.type === 'elim'
      ? `Same holds as the normal ${base.name} route, but the red crossed-out holds are off.`
      : 'Only the holds shown are on. Start on the green ring and finish on the gold one.';
  if (hasMarkers) help += ' A big hold or volume with a small marker hold bolted on it counts as one hold.';

  return (
    <>
      <RouteTools ghost={ghost} onGhost={setGhost} />
      <Link to={`/r/${base.id}`} className={ui.back}>
        {base.name} start
      </Link>
      <div className={ui.head}>
        <p className={ui.eyebrow}>
          {TYPE_NAME[route.type]} · set by {route.setter || 'staff'}
        </p>
        <h2>
          {route.name} <GradeBadge grading={d.settings?.grading} id={route.grade} />
        </h2>
        <p className={ui.muted}>{help}</p>
      </div>
      {route.description && <p className={ui.desc}>{route.description}</p>}
      {route.rules.length > 0 && (
        <div className={ui.chips}>
          {route.rules.map((r) => (
            <span key={r} className={ui.chip}>
              {r}
            </span>
          ))}
        </div>
      )}
      <SendButton routeId={route.id} count={d.counts[route.id] ?? 0} />
      <Comments routeId={route.id} comments={d.commentsOf(route.id)} />
    </>
  );
}

function SendButton({ routeId, count }: { routeId: string; count: number }) {
  const add = useAddSend();
  const toast = useToast();
  const [mine, setMine] = useState(!!device.get().sent[routeId]);
  return (
    <div className={s.sendbar}>
      <button
        type="button"
        className={s.send}
        aria-pressed={mine}
        disabled={mine || add.isPending}
        onClick={() =>
          add.mutate(routeId, {
            onSuccess: () => {
              setMine(true);
              toast('Nice send!');
            },
            onError: (e) => toast(friendly(e)),
          })
        }
      >
        {mine ? 'You sent it' : 'I sent it'}
      </button>
      <span className={`${ui.muted} ${ui.smallText}`}>{plural(count, 'climber')} sent this</span>
    </div>
  );
}
