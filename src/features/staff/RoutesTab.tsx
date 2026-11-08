import { Link, useNavigate } from 'react-router-dom';
import { Loading } from '@/components/ui';
import { ui } from '@/components/uiStyles';
import { useToast } from '@/components/toastContext';
import { useCoreData } from '@/data/queries';
import { parentOf, startsOf, withMarkers } from '@/domain/routes';
import { PRACTICE_WALL_ID } from '@/domain/types';
import { holdsOfWall } from '@/viewer/practiceWall';
import { StageTools } from '@/viewer/stage';
import { useStageScene, useViewer, useViewerEvents } from '@/viewer/stageContext';
import { BaseRow } from '@/features/climber/shared';
import { useStaffWall } from './staffWall';
import { WallSelect } from './WallSelect';
import { wallLabel } from './staffWall';

/** Staff home for routes: every normal route on the wall, like the climber home. Open one to manage it. */
export function RoutesTab() {
  const { wallId } = useStaffWall();
  const d = useCoreData();
  const toast = useToast();
  const viewer = useViewer();
  const navigate = useNavigate();
  const hasHolds = wallId === PRACTICE_WALL_ID || d.holds.some((h) => h.wallId === wallId);
  const bases = d.routes.filter((r) => r.type === 'base' && r.wallId === wallId);
  const starts = startsOf(bases);
  const wallHolds = holdsOfWall(wallId, d.holds);

  // Only the start holds, like the climber home. With no routes yet, the whole wall.
  useStageScene(
    d.isLoading || !hasHolds
      ? null
      : {
          kind: 'wall',
          wallId,
          markers: starts,
          holdIds:
            wallId === PRACTICE_WALL_ID || !bases.length
              ? undefined
              : Object.keys(withMarkers(wallHolds, starts)),
        },
    `routes:${wallId}:${d.holds.length}:${d.routes.length}`,
    d.isLoading ? 'Loading…' : 'Tag some holds on this wall first.',
  );
  useViewerEvents({
    holdTap: (id) => {
      const parent = parentOf(wallHolds, id);
      const base = bases.find((b) => b.holds[parent] === 'start');
      if (base) navigate(`/staff/routes/start/${base.id}`);
      else if (bases.length) toast('That hold is not a start. Tap a green ring.');
    },
  });

  if (d.isLoading) return <Loading />;

  return (
    <>
      <StageTools>
        <button type="button" onClick={() => viewer?.resetView()}>
          Reset view
        </button>
      </StageTools>
      <WallSelect />
      {!hasHolds ? (
        <>
          <p className={ui.muted}>Tag some holds on this wall first.</p>
          <div className={ui.actions}>
            <Link to="/staff/walls" className={`${ui.btn} ${ui.small}`}>
              Go to Walls
            </Link>
          </div>
        </>
      ) : (
        <>
          <p className={`${ui.muted} ${ui.smallText}`}>
            {wallLabel(d.walls, wallId)}. Pick a route to add eliminations and new routes.
          </p>
          <div className={ui.actions}>
            <Link to="/staff/routes/new" className={`${ui.btn} ${ui.primary}`}>
              New normal route
            </Link>
          </div>
          {bases.length ? (
            <ul className={ui.list}>
              {bases.map((b) => (
                <li key={b.id}>
                  <BaseRow
                    route={b}
                    grading={d.settings?.grading}
                    extras={d.routes.filter((x) => x.baseId === b.id && !x.archived).length}
                    to={`/staff/routes/start/${b.id}`}
                  />
                </li>
              ))}
            </ul>
          ) : (
            <p className={ui.empty}>No routes on this wall yet.</p>
          )}
        </>
      )}
    </>
  );
}
