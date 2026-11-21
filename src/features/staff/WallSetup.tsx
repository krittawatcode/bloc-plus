import { useState } from 'react';
import { ui } from '@/components/uiStyles';
import { useToast } from '@/components/toastContext';
import { friendly } from '@/data/backend';
import { useReorientWall, useSetWallView } from '@/data/queries';
import type { Wall } from '@/domain/types';
import { buildScan, ghostPoints, type LoadedScan } from '@/viewer/scan';
import { StageTools } from '@/viewer/stage';
import { useStageScene, useViewer } from '@/viewer/stageContext';
import { useLoadedScan, useRememberScan } from './useScan';

/**
 * Show a wall's scan and turn it to face the camera. Holds are not tagged here: staff pick them on the
 * scan while setting a route. `locked` is true once holds exist, because turning would move them.
 */
export function WallSetup({ wall, locked }: { wall: Wall; locked: boolean }) {
  const scanQuery = useLoadedScan(wall);
  const scan = scanQuery.data;
  const viewer = useViewer();
  const toast = useToast();
  const reorient = useReorientWall();
  const remember = useRememberScan();
  const view = useSaveView(wall);

  useStageScene(
    scan ? { kind: 'scan', wallId: wall.id, scan, markers: {} } : null,
    `wall:${wall.id}:${wall.upright}:${wall.spin}:${!!scan}`,
    scanQuery.error ? friendly(scanQuery.error) : 'Downloading the scan…',
  );

  const turn = (what: 'upright' | 'spin') => {
    if (!scan || !viewer) return;
    const o = {
      upright: what === 'upright' ? !wall.upright : wall.upright,
      spin: what === 'spin' ? (wall.spin + 1) % 4 : wall.spin,
    };
    const turned: LoadedScan = buildScan(scan.source, o, scan.bytes);
    reorient.mutate(
      { wall, o, ghost: ghostPoints(turned) },
      {
        onSuccess: (w) => {
          remember(w, turned);
          viewer.forgetGhost(w.id);
        },
        onError: (e) => {
          buildScan(scan.source, wall, scan.bytes);
          toast(friendly(e));
        },
      },
    );
  };

  return (
    <>
      <StageTools>
        <button type="button" onClick={() => viewer?.resetView()}>
          Reset view
        </button>
        <button
          type="button"
          disabled={!scan || !viewer || view.saving}
          onClick={() => viewer && view.save(viewer.currentView())}
        >
          {view.saving ? 'Saving…' : 'Set default view'}
        </button>
      </StageTools>
      {scan && <StartView wall={wall} saving={view.saving} onClear={() => view.save(null)} />}
      {scan && (
        <Straighten
          wall={wall}
          saving={view.saving}
          onSave={() => viewer && view.save(viewer.currentView())}
        />
      )}
      {scanQuery.error ? (
        <div className={ui.actions}>
          <button type="button" className={`${ui.btn} ${ui.small}`} onClick={() => void scanQuery.refetch()}>
            Try again
          </button>
        </div>
      ) : (
        !locked && (
          <div className={ui.field}>
            <span className={ui.label}>Does the wall face you?</span>
            <div className={ui.actions}>
              <button
                type="button"
                className={`${ui.btn} ${ui.small}`}
                disabled={!scan || reorient.isPending}
                onClick={() => turn('upright')}
              >
                Stand upright
              </button>
              <button
                type="button"
                className={`${ui.btn} ${ui.small}`}
                disabled={!scan || reorient.isPending}
                onClick={() => turn('spin')}
              >
                Turn 90°
              </button>
            </div>
          </div>
        )
      )}
    </>
  );
}

/** Make a fresh light grid of the wall (shown while the full scan downloads behind routes). */
export function RebuildOutline({ wall }: { wall: Wall }) {
  const scanQuery = useLoadedScan(wall);
  const scan = scanQuery.data;
  const viewer = useViewer();
  const toast = useToast();
  const reorient = useReorientWall();
  return (
    <div className={ui.field}>
      <span className={ui.label}>Wall outline</span>
      <p className={`${ui.muted} ${ui.smallText}`}>
        A light grid of the wall shows while the full wall loads. Rebuild it if it looks patchy.
      </p>
      <div className={ui.actions}>
        <button
          type="button"
          className={`${ui.btn} ${ui.small}`}
          disabled={!scan || reorient.isPending}
          onClick={() =>
            scan &&
            reorient.mutate(
              { wall, o: { upright: wall.upright, spin: wall.spin }, ghost: ghostPoints(scan) },
              {
                onSuccess: (w) => {
                  viewer?.forgetGhost(w.id);
                  toast('Wall outline rebuilt.');
                },
                onError: (e) => toast(friendly(e)),
              },
            )
          }
        >
          {reorient.isPending ? 'Rebuilding…' : 'Rebuild outline'}
        </button>
      </div>
    </div>
  );
}

/** Save how the 3D wall opens, or clear it (null). Used for staff and climbers, on Reset view, and as the angle routes are seen from. */
function useSaveView(wall: Wall) {
  const viewer = useViewer();
  const toast = useToast();
  const setView = useSetWallView();
  const save = (view: Wall['view']) =>
    setView.mutate(
      { wall, view },
      {
        onSuccess: (w) => {
          viewer?.setHome(w.id, w.view);
          viewer?.resetView();
          toast(w.view ? 'Default view saved. The wall now opens like this.' : 'Default view cleared.');
        },
        onError: (e) => toast(friendly(e)),
      },
    );
  return { save, saving: setView.isPending };
}

/** Under the wall: what the default view does, and a way back to fitting the whole wall. */
function StartView({ wall, onClear, saving }: { wall: Wall; onClear: () => void; saving: boolean }) {
  return (
    <div className={ui.field}>
      <span className={ui.label}>Default view</span>
      <p className={`${ui.muted} ${ui.smallText}`}>
        {wall.view
          ? 'The wall opens from the view you set. To change it, turn and zoom the wall, then tap Set default view again.'
          : 'Turn and zoom the wall the way it should open, then tap Set default view on the wall. Routes are shown from the same side.'}
      </p>
      {wall.view && (
        <div className={ui.actions}>
          <button type="button" className={`${ui.btn} ${ui.small}`} disabled={saving} onClick={onClear}>
            Fit whole wall instead
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Photo scans often come in a little tilted, so turning the wall makes it wobble. Staff roll the view
 * until the wall stands straight on screen (from the front, then from the side) and save it with the
 * default view. Only the turning axis changes; holds stay where they are.
 */
function Straighten({ wall, saving, onSave }: { wall: Wall; saving: boolean; onSave: () => void }) {
  const viewer = useViewer();
  const [, redraw] = useState(0);
  const step = (deg: number) => {
    viewer?.tilt(deg);
    redraw((n) => n + 1);
  };
  const tilted = !!viewer?.tilted;
  const saved = !!wall.view?.up;
  return (
    <div className={ui.field}>
      <span className={ui.label}>Straighten the wall</span>
      <p className={`${ui.muted} ${ui.smallText}`}>
        If the wall wobbles when you turn it, the scan is tilted. Tap the buttons until the wall stands
        straight up on screen. Turn it to look from the side and straighten it again, then save. Holds don't
        move.
      </p>
      <div className={ui.actions}>
        <button type="button" className={`${ui.btn} ${ui.small}`} onClick={() => step(-3)}>
          ↺ Tilt
        </button>
        <button type="button" className={`${ui.btn} ${ui.small}`} onClick={() => step(3)}>
          ↻ Tilt
        </button>
        {tilted && (
          <button
            type="button"
            className={`${ui.btn} ${ui.small}`}
            onClick={() => {
              viewer?.untilt();
              redraw((n) => n + 1);
            }}
          >
            Undo tilt
          </button>
        )}
        <button
          type="button"
          className={`${ui.btn} ${ui.small} ${ui.primary}`}
          disabled={saving || !viewer}
          onClick={onSave}
        >
          {saving ? 'Saving…' : 'Save as default view'}
        </button>
      </div>
      {saved && (
        <p className={`${ui.muted} ${ui.smallText}`}>
          This wall is straightened. Everyone turns it the same way.
        </p>
      )}
    </div>
  );
}
