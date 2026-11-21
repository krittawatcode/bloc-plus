import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ConfirmButton, Loading } from '@/components/ui';
import { ui } from '@/components/uiStyles';
import d from '@/components/Dock.module.css';
import { useToast } from '@/components/toastContext';
import { friendly } from '@/data/backend';
import { useCoreData, useDeleteHold } from '@/data/queries';
import { PRACTICE_WALL_ID, type Hold, type Wall } from '@/domain/types';
import { plural } from '@/lib/format';
import { StageDock, StageTools } from '@/viewer/stage';
import { useStageScene, useViewer, useViewerEvents } from '@/viewer/stageContext';
import type { MarkerMap } from '@/viewer/WallViewer';
import { FoundHoldDock } from './FoundHoldDock';
import { useStaffWall } from './staffWall';
import { useHoldFinder } from './useHoldFinder';
import { useLoadedScan } from './useScan';
import { WallSelect } from './WallSelect';

const KIND_NAME: Record<Hold['kind'], string> = { hold: 'Hold', volume: 'Volume', marker: 'Marker hold' };

/** Add holds to a wall ahead of setting routes: tap the scan, check the highlight, save. */
export function HoldsTab() {
  const core = useCoreData();
  const { wallId } = useStaffWall();
  const wall = core.walls.find((w) => w.id === wallId);

  if (core.isLoading) return <Loading />;
  return (
    <>
      <WallSelect />
      {wallId === PRACTICE_WALL_ID ? (
        <NoScan text="The demo wall's holds are built in. Pick a scanned wall to add holds." />
      ) : !wall?.scanPath ? (
        <NoScan text="This wall has no scan yet. Add one in Walls." />
      ) : (
        <WallHolds key={wall.id} wall={wall} />
      )}
    </>
  );
}

function NoScan({ text }: { text: string }) {
  useStageScene(null, 'holds:none', text);
  return (
    <>
      <p className={ui.muted}>{text}</p>
      <div className={ui.actions}>
        <Link to="/staff/walls" className={`${ui.btn} ${ui.small}`}>
          Go to Walls
        </Link>
      </div>
    </>
  );
}

function WallHolds({ wall }: { wall: Wall }) {
  const data = useCoreData();
  const scanQuery = useLoadedScan(wall);
  const scan = scanQuery.data;
  const viewer = useViewer();
  const toast = useToast();
  const del = useDeleteHold();
  const holds = data.holds.filter((h) => h.wallId === wall.id);
  const finder = useHoldFinder(wall, scan, viewer, holds);
  const [selected, setSelected] = useState<string | null>(null);
  const chosen = holds.find((h) => h.id === selected);

  // Saved holds get a ring; the one tapped is highlighted.
  const rings: MarkerMap = useMemo(
    () =>
      Object.fromEntries(holds.map((h) => [h.id, h.id === selected ? 'picked' : h.onId ? 'marker' : 'tag'])),
    [holds, selected],
  );
  useStageScene(
    scan ? { kind: 'scan', wallId: wall.id, scan, markers: rings } : null,
    `holds:${wall.id}:${!!scan}`,
    scanQuery.error ? friendly(scanQuery.error) : 'Downloading the scan…',
  );
  useEffect(() => {
    if (scan) viewer?.setMarkers(rings);
  }, [viewer, scan, rings]);

  useViewerEvents(
    {
      scanTap: (p, n) => {
        setSelected(finder.tap(p, n));
      },
      previewMove: finder.move,
    },
    { zoomFirst: true },
  );

  const usedIn = (h: Hold) => data.routes.filter((r) => h.id in r.holds);
  const remove = (h: Hold) => {
    const routes = usedIn(h);
    if (routes.length)
      return toast(`Used in ${routes.map((r) => r.name).join(', ')}. Take it out of the route first.`);
    if (holds.some((x) => x.onId === h.id)) return toast('Remove the marker hold on it first.');
    del.mutate(h, {
      onSuccess: () => {
        viewer?.forgetPiece(h.id);
        setSelected(null);
        toast('Hold removed.');
      },
      onError: (e) => toast(friendly(e)),
    });
  };

  const volumes = holds.filter((h) => h.kind === 'volume').length;
  const markers = holds.filter((h) => h.onId).length;

  return (
    <>
      <StageTools>
        <button type="button" onClick={() => viewer?.resetView()}>
          Reset view
        </button>
      </StageTools>
      <StageDock>
        {finder.pending ? (
          <FoundHoldDock
            finder={finder}
            addLabel="Save"
            onAdd={() =>
              void finder.save().then(
                (h) => {
                  if (h) toast(`${KIND_NAME[h.kind]} saved.`);
                },
                (e: unknown) => toast(friendly(e)),
              )
            }
          />
        ) : chosen ? (
          <>
            <p className={d.msg}>
              {KIND_NAME[chosen.kind]} · {Math.round(chosen.r * 100)} cm ·{' '}
              {usedIn(chosen).length ? `in ${plural(usedIn(chosen).length, 'route')}` : 'not in a route yet'}
            </p>
            <div className={d.row}>
              <span className={d.spacer} />
              <button type="button" className={d.btn} onClick={() => setSelected(null)}>
                Close
              </button>
              <ConfirmButton
                className={d.btn}
                confirmText="Tap again"
                disabled={del.isPending}
                onConfirm={() => remove(chosen)}
              >
                Remove
              </ConfirmButton>
            </div>
          </>
        ) : (
          <p className={d.msg}>
            Tap a hold on the wall to add it. Tap a saved hold (ringed) to see or remove it.{' '}
            <span className={d.tally}>{plural(holds.length, 'hold')}</span>
          </p>
        )}
      </StageDock>
      <p className={`${ui.muted} ${ui.smallText}`}>
        Add holds here before setting routes, or while setting a route. {plural(holds.length, 'hold')} ·{' '}
        {plural(volumes, 'volume')} · {plural(markers, 'marker')}.
      </p>
      <p className={`${ui.muted} ${ui.smallText}`}>
        Tap a hold and the app finds its edge and zooms in so you can check it. Pick Volume for big shapes, or
        Marker for a small hold bolted on a big one. Use − and + if the highlight is off.
      </p>
    </>
  );
}
