import { ui } from '@/components/uiStyles';
import { useToast } from '@/components/toastContext';
import { friendly } from '@/data/backend';
import { useReorientWall } from '@/data/queries';
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
      </StageTools>
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
