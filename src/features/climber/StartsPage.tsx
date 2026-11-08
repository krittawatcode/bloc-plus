import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loading } from '@/components/ui';
import { ui } from '@/components/uiStyles';
import { friendly } from '@/data/backend';
import { parentOf, startsOf, withMarkers } from '@/domain/routes';
import { PRACTICE_WALL_ID } from '@/domain/types';
import { holdsOfWall } from '@/viewer/practiceWall';
import { StageTools } from '@/viewer/stage';
import { useStageScene, useViewer, useViewerEvents } from '@/viewer/stageContext';
import { useToast } from '@/components/toastContext';
import { BaseRow } from './shared';
import { useClimberData } from './useClimberData';

/** The climber home: every QR start, grouped by wall. Tap a green ring on the wall to open one. */
export function StartsPage() {
  const d = useClimberData();
  const navigate = useNavigate();
  const toast = useToast();
  const viewer = useViewer();
  const [chosen, setChosen] = useState<string | null>(null);
  const wallId = d.visibleWalls.find((w) => w.id === chosen)?.id ?? d.visibleWalls[0]?.id ?? null;
  const bases = wallId ? d.bases(wallId) : [];
  const starts = startsOf(bases);
  const wallHolds = wallId ? holdsOfWall(wallId, d.holds) : [];

  useStageScene(
    wallId && !d.isLoading
      ? {
          kind: 'wall',
          wallId,
          markers: starts,
          holdIds: wallId === PRACTICE_WALL_ID ? undefined : Object.keys(withMarkers(wallHolds, starts)),
        }
      : null,
    `starts:${wallId}:${d.holds.length}:${d.routes.length}:${d.isLoading}`,
    d.isLoading ? 'Loading…' : 'No routes yet. Check back soon.',
  );
  useViewerEvents({
    holdTap: (id) => {
      if (!wallId) return;
      const parent = parentOf(wallHolds, id);
      const base = bases.find((b) => b.holds[parent] === 'start');
      if (base) navigate(`/r/${base.id}`);
      else toast('That hold is not a start. Tap a green ring.');
    },
  });

  if (d.error) return <p className={ui.error}>{friendly(d.error)}</p>;
  if (d.isLoading) return <Loading />;
  return (
    <>
      <StageTools>
        <button type="button" onClick={() => viewer?.resetView()}>
          Reset view
        </button>
      </StageTools>
      <div className={ui.head}>
        <p className={ui.eyebrow}>Climber</p>
        <h2>Find extra routes at the wall</h2>
        <p className={ui.muted}>Scan the QR sticker next to a start hold, or pick a start below.</p>
      </div>
      {d.visibleWalls.length ? (
        d.visibleWalls.map((w) => (
          <section key={w.id} className={ui.field}>
            <div className={ui.frow}>
              <h3>{w.name}</h3>
              {d.visibleWalls.length > 1 && (
                <button
                  type="button"
                  className={ui.link}
                  onClick={() => setChosen(w.id)}
                  disabled={w.id === wallId}
                >
                  {w.id === wallId ? 'On the wall above' : 'Show on the wall'}
                </button>
              )}
            </div>
            <ul className={ui.list}>
              {d.bases(w.id).map((b) => (
                <li key={b.id}>
                  <BaseRow
                    route={b}
                    grading={d.settings?.grading}
                    extras={d.extrasOf(b.id).length}
                    to={`/r/${b.id}`}
                  />
                </li>
              ))}
            </ul>
          </section>
        ))
      ) : (
        <p className={ui.empty}>No routes yet. The staff are setting the first ones.</p>
      )}
    </>
  );
}
