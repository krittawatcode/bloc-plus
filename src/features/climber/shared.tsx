import { Link } from 'react-router-dom';
import { GradeBadge, TypePill } from '@/components/ui';
import { ui } from '@/components/uiStyles';
import type { Grading, RatingStats, Route } from '@/domain/types';
import { plural } from '@/lib/format';
import { StageTools } from '@/viewer/stage';
import { useViewer } from '@/viewer/stageContext';

export function BaseRow({
  route,
  grading,
  extras,
  to,
  selected,
}: {
  route: Route;
  grading?: Grading;
  extras: number;
  to: string;
  selected?: boolean;
}) {
  return (
    <Link to={to} className={selected ? ui.rowSelected : ui.row}>
      <span className={ui.tape} style={{ background: route.color ?? '#999' }} />
      <span className={ui.grow}>
        <strong>{route.name}</strong> <GradeBadge grading={grading} id={route.grade} />
        <br />
        <span className={`${ui.muted} ${ui.smallText}`}>{route.section}</span>
      </span>
      <span className={ui.stats}>{plural(extras, 'extra')}</span>
    </Link>
  );
}

/** The inside of an extra-route card: name, setter, type, grade and counts. Climber and staff share it. */
export function ExtraRowBody({
  route,
  grading,
  sends,
  comments,
  rating,
}: {
  route: Route;
  grading?: Grading;
  sends: number;
  comments: number;
  rating?: RatingStats;
}) {
  return (
    <>
      <span className={ui.grow}>
        <strong>{route.name}</strong>
        {route.setter && <span className={`${ui.muted} ${ui.smallText}`}> by {route.setter}</span>}
        <span className={ui.meta}>
          <TypePill type={route.type} />
          <GradeBadge grading={grading} id={route.grade} />
          {route.rules.length > 0 && (
            <span className={`${ui.muted} ${ui.smallText}`}>{route.rules.join(' · ')}</span>
          )}
          {route.archived && <span className={`${ui.muted} ${ui.smallText}`}>Archived</span>}
        </span>
      </span>
      <span className={ui.stats}>
        {rating && rating.n > 0 && (
          <span aria-label={`Rated ${rating.avg.toFixed(1)} of 5`}>★ {rating.avg.toFixed(1)}</span>
        )}
        <span>{sends} sent</span>
        <span>{plural(comments, 'comment')}</span>
      </span>
    </>
  );
}

export function ExtraRow(props: {
  route: Route;
  grading?: Grading;
  sends: number;
  comments: number;
  rating?: RatingStats;
}) {
  return (
    <Link to={`/x/${props.route.id}`} className={ui.row}>
      <ExtraRowBody {...props} />
    </Link>
  );
}

/** Reset view and wall-outline buttons for route views. */
export function RouteTools({ ghost, onGhost }: { ghost: boolean; onGhost: (on: boolean) => void }) {
  const viewer = useViewer();
  return (
    <StageTools>
      <button type="button" onClick={() => viewer?.resetView()}>
        Reset view
      </button>
      <button type="button" aria-pressed={ghost} onClick={() => onGhost(!ghost)}>
        Outline {ghost ? 'on' : 'off'}
      </button>
    </StageTools>
  );
}
