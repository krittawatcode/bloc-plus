import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { GradeBadge, Loading, TypePill } from '@/components/ui';
import { ui } from '@/components/uiStyles';
import { useToast } from '@/components/toastContext';
import { friendly } from '@/data/backend';
import { useCoreData, useSaveRoutes } from '@/data/queries';
import { PRACTICE_WALL_ID } from '@/domain/types';
import { StageTools } from '@/viewer/stage';
import { useStageScene, useViewer } from '@/viewer/stageContext';
import { useStaffWall } from './staffWall';
import { WallSelect } from './WallSelect';
import { wallLabel } from './staffWall';
import s from './Staff.module.css';

export function RoutesTab() {
  const { wallId } = useStaffWall();
  const d = useCoreData();
  const save = useSaveRoutes();
  const toast = useToast();
  const viewer = useViewer();
  const location = useLocation();
  const [preview, setPreview] = useState<string | null>(
    (location.state as { preview?: string } | null)?.preview ?? null,
  );
  const previewRoute = d.routes.find((r) => r.id === preview && r.wallId === wallId);
  const hasHolds = wallId === PRACTICE_WALL_ID || d.holds.some((h) => h.wallId === wallId);

  useStageScene(
    !d.isLoading && hasHolds ? { kind: 'wall', wallId, markers: previewRoute?.holds ?? {} } : null,
    `routes:${wallId}:${previewRoute?.id}:${d.holds.length}`,
    d.isLoading ? 'Loading…' : 'Tag some holds on this wall first.',
  );

  if (d.isLoading) return <Loading />;
  const bases = d.routes.filter((r) => r.type === 'base' && r.wallId === wallId);
  const toggle = (id: string) => setPreview((p) => (p === id ? null : id));

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
            {wallLabel(d.walls, wallId)}. Tap a route to see it on the wall.
          </p>
          <div className={ui.actions}>
            <Link to="/staff/routes/new" className={`${ui.btn} ${ui.primary}`}>
              New normal route
            </Link>
          </div>
          {bases.length === 0 && <p className={ui.empty}>No routes on this wall yet.</p>}
          {bases.map((b) => (
            <div key={b.id} className={s.base}>
              <button
                type="button"
                className={preview === b.id ? ui.rowSelected : ui.row}
                onClick={() => toggle(b.id)}
              >
                <span className={ui.tape} style={{ background: b.color ?? '#999' }} />
                <span className={ui.grow}>
                  <strong>{b.name}</strong> <GradeBadge grading={d.settings?.grading} id={b.grade} />
                  <br />
                  <span className={`${ui.muted} ${ui.smallText}`}>{b.section}</span>
                </span>
              </button>
              <div className={s.extras}>
                {d.routes
                  .filter((x) => x.baseId === b.id)
                  .map((x) => (
                    <div key={x.id} className={`${s.extra} ${x.archived ? s.archived : ''}`}>
                      <button
                        type="button"
                        className={s.extraName}
                        aria-pressed={preview === x.id}
                        onClick={() => toggle(x.id)}
                      >
                        <strong>{x.name}</strong>
                        <TypePill type={x.type} />
                        {x.archived && <span className={`${ui.muted} ${ui.smallText}`}>Archived</span>}
                      </button>
                      <Link to={`/staff/routes/${x.id}`} className={ui.link}>
                        Edit
                      </Link>
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
                    </div>
                  ))}
              </div>
              <div className={s.addRow}>
                <Link to={`/staff/routes/new/${b.id}/elim`} className={`${ui.btn} ${ui.small}`}>
                  + Elimination
                </Link>
                <Link to={`/staff/routes/new/${b.id}/new`} className={`${ui.btn} ${ui.small}`}>
                  + New route
                </Link>
                <Link to={`/staff/routes/${b.id}`} className={ui.link}>
                  Edit normal route
                </Link>
                <Link to={`/r/${b.id}`} className={ui.link}>
                  Climber view
                </Link>
              </div>
            </div>
          ))}
        </>
      )}
    </>
  );
}
