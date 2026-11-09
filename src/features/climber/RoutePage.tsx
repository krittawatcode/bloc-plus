import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { GradeBadge, Loading } from '@/components/ui';
import { ui } from '@/components/uiStyles';
import { useToast } from '@/components/toastContext';
import { friendly } from '@/data/backend';
import { useRateRoute, useToggleSend } from '@/data/queries';
import { feetNote, startNote, markersOf, STRICT_FEET, TYPE_NAME } from '@/domain/routes';
import type { RatingStats } from '@/domain/types';
import { device } from '@/lib/device';
import { plural } from '@/lib/format';
import { holdsOfWall } from '@/viewer/practiceWall';
import { useStageScene } from '@/viewer/stageContext';
import { Comments } from './Comments';
import { RouteTools } from './shared';
import { useClimberData } from './useClimberData';
import s from './RoutePage.module.css';

/** One extra route: only its holds in 3D, the setter's notes, sends and comments. */
export function RoutePage() {
  const { routeId } = useParams();
  const d = useClimberData();
  const route = d.route(routeId);
  const base = route?.baseId ? d.route(route.baseId) : undefined;

  useStageScene(
    route && !route.archived
      ? { kind: 'route', wallId: route.wallId, holds: route.holds, hands: route.hands }
      : null,
    `route:${route?.id}:${d.holds.length}`,
    d.isLoading ? 'Loading…' : 'This route has been taken down.',
  );

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
      <RouteTools />
      <Link to={`/r/${base.id}`} className={ui.back}>
        {base.name} start
      </Link>
      <div className={ui.head}>
        <p className={ui.eyebrow}>{TYPE_NAME[route.type]}</p>
        <h2>
          {route.name} <GradeBadge grading={d.settings?.grading} id={route.grade} />{' '}
          <span className={`${ui.muted} ${ui.smallText}`}>by {route.setter || 'staff'}</span>
        </h2>
        <p className={ui.muted}>{help}</p>
      </div>
      {route.description && <p className={ui.desc}>{route.description}</p>}
      <div className={ui.chips}>
        {startNote(route) && <span className={ui.chip}>{startNote(route)}</span>}
        <span className={ui.chip}>{feetNote(route)}</span>
        {route.rules
          .filter((r) => r !== STRICT_FEET)
          .map((r) => (
            <span key={r} className={ui.chip}>
              {r}
            </span>
          ))}
      </div>
      <SendToggle routeId={route.id} count={d.counts[route.id] ?? 0} />
      <StarRating routeId={route.id} stats={d.ratings[route.id]} />
      <Comments routeId={route.id} comments={d.commentsOf(route.id)} />
    </>
  );
}

/** "I sent it" tick box. Untick to take the send back (one per phone). */
function SendToggle({ routeId, count }: { routeId: string; count: number }) {
  const toggle = useToggleSend();
  const toast = useToast();
  const [mine, setMine] = useState(!!device.get().sent[routeId]);
  return (
    <div className={s.sendbar}>
      <label className={s.send}>
        <input
          type="checkbox"
          checked={mine}
          disabled={toggle.isPending}
          onChange={(e) => {
            const sent = e.target.checked;
            toggle.mutate(
              { routeId, sent },
              {
                onSuccess: () => {
                  setMine(sent);
                  if (sent) toast('Nice send!');
                },
                onError: (err) => toast(friendly(err)),
              },
            );
          }}
        />
        <span className={s.box} aria-hidden="true" />I sent it
      </label>
      <span className={`${ui.muted} ${ui.smallText}`}>{plural(count, 'climber')} sent this</span>
    </div>
  );
}

/** 1–5 stars, one rating per phone. Tap your current rating again to clear it. */
function StarRating({ routeId, stats }: { routeId: string; stats?: RatingStats }) {
  const rate = useRateRoute();
  const toast = useToast();
  const [mine, setMine] = useState<number | null>(device.get().rated[routeId] ?? null);
  const pick = (n: number) => {
    const stars = n === mine ? null : n;
    rate.mutate(
      { routeId, stars },
      {
        onSuccess: () => setMine(stars),
        onError: (err) => toast(friendly(err)),
      },
    );
  };
  return (
    <div className={s.ratebar}>
      <div className={s.stars} role="group" aria-label="Rate this route">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            className={s.star}
            aria-label={`${n} ${n === 1 ? 'star' : 'stars'}`}
            aria-pressed={mine !== null && n <= mine}
            disabled={rate.isPending}
            onClick={() => pick(n)}
          >
            ★
          </button>
        ))}
      </div>
      <span className={`${ui.muted} ${ui.smallText}`}>
        {stats && stats.n > 0
          ? `${stats.avg.toFixed(1)} from ${plural(stats.n, 'rating')}`
          : mine
            ? 'Thanks for rating'
            : 'Rate this route'}
      </span>
    </div>
  );
}
