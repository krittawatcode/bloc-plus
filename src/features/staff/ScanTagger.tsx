import { useEffect, useMemo, useState } from 'react';
import type { Vector3 } from 'three';
import { ui } from '@/components/uiStyles';
import d from '@/components/Dock.module.css';
import { useToast } from '@/components/toastContext';
import { friendly } from '@/data/backend';
import { useAddHold, useCoreData, useDeleteHold, useReorientWall } from '@/data/queries';
import type { HoldKind, Vec3, Wall } from '@/domain/types';
import { fmt, mb, plural, uid } from '@/lib/format';
import { detectHold } from '@/viewer/detect';
import { cutPiece, encodePiece } from '@/viewer/piece';
import { buildScan, ghostPoints, type LoadedScan } from '@/viewer/scan';
import { StageDock, StageTools } from '@/viewer/stage';
import { useStageScene, useViewer, useViewerEvents } from '@/viewer/stageContext';
import { TAP_PX, type MarkerMap, type ViewState } from '@/viewer/WallViewer';
import { useLoadedScan, useRememberScan } from './useScan';

/** A hold the app found (or the staff placed), shown highlighted until they save or cancel it. */
interface Pending {
  kind: HoldKind;
  c: Vector3;
  r: number;
  n: Vector3;
  onId: string | null;
  miss: boolean;
  prev: ViewState | null;
}

const KIND_LABEL: Record<HoldKind, string> = { hold: 'hold', volume: 'volume', marker: 'marker hold' };
const toVec = (v: Vector3): Vec3 => [v.x, v.y, v.z];

/** Tag holds on a wall scan: tap, check the highlight, save. Built for phones. */
export function ScanTagger({ wall }: { wall: Wall }) {
  const data = useCoreData();
  const scanQuery = useLoadedScan(wall);
  const scan = scanQuery.data;
  const viewer = useViewer();
  const toast = useToast();
  const addHold = useAddHold();
  const deleteHold = useDeleteHold();
  const reorient = useReorientWall();
  const remember = useRememberScan();
  const [kind, setKind] = useState<HoldKind>('hold');
  const [pending, setPending] = useState<Pending | null>(null);
  const holds = data.holds.filter((h) => h.wallId === wall.id);
  const tagMap: MarkerMap = useMemo(
    () => Object.fromEntries(holds.map((h) => [h.id, h.onId ? 'marker' : 'tag'])),
    [holds],
  );

  useStageScene(
    scan ? { kind: 'scan', wallId: wall.id, scan, markers: tagMap } : null,
    `scan:${wall.id}:${wall.upright}:${wall.spin}:${!!scan}`,
    scanQuery.error ? friendly(scanQuery.error) : 'Downloading the full scan for tagging…',
  );
  // Keep the rings in step with saved holds without moving the camera.
  useEffect(() => {
    if (scan) viewer?.setMarkers(tagMap);
  }, [viewer, scan, tagMap]);

  const cut = useMemo(() => (scan && pending ? cutPiece(scan, pending.c, pending.r) : null), [scan, pending]);
  useEffect(() => {
    viewer?.setPreview(
      pending ? { geom: cut?.geom ?? null, c: pending.c, r: pending.r, n: pending.n } : null,
    );
  }, [viewer, pending, cut]);
  useEffect(() => () => viewer?.setPreview(null), [viewer]);

  useViewerEvents({
    scanTap: (p, faceNormal) => {
      if (!scan || !viewer || addHold.isPending) return;
      if (pending) viewer.restoreView(pending.prev);
      const base = pending?.prev ?? null;
      let next: Omit<Pending, 'prev'>;
      if (kind === 'marker') {
        let onId: string | null = null,
          best = Infinity;
        for (const h of holds) {
          if (h.onId) continue;
          const dist = p.distanceTo({ x: h.c[0], y: h.c[1], z: h.c[2] } as Vector3);
          if (dist < h.r + 0.05 && dist < best) {
            best = dist;
            onId = h.id;
          }
        }
        if (!onId) {
          setPending(null);
          return toast('Tag the big hold or volume under it first, then tap the small marker hold.');
        }
        next = { kind, c: p, r: 0.05, n: faceNormal, onId, miss: false };
      } else {
        const tol = Math.min(0.2, Math.max(0.04, viewer.pxToWorld(p, TAP_PX)));
        const found = detectHold(scan, p, kind, tol, viewer.viewDirAt(p));
        next = found
          ? { kind, c: found.c, r: found.r, n: found.n, onId: null, miss: false }
          : { kind, c: p, r: kind === 'volume' ? 0.4 : 0.1, n: faceNormal, onId: null, miss: true };
      }
      const prev = viewer.focusOn(next.c, next.r) ?? base;
      setPending({ ...next, prev });
    },
  });

  const close = () => {
    viewer?.restoreView(pending?.prev);
    setPending(null);
  };
  const resize = (dir: 1 | -1) => {
    if (!pending) return;
    const step = pending.kind === 'volume' ? 0.05 : pending.r < 0.1 ? 0.01 : 0.02;
    setPending({
      ...pending,
      r: Math.min(0.9, Math.max(0.02, +(pending.r + dir * step).toFixed(3))),
      miss: false,
    });
  };
  const save = () => {
    if (!pending || !cut) return;
    const hold = {
      id: uid('h'),
      wallId: wall.id,
      kind: pending.kind,
      c: toVec(pending.c),
      r: pending.r,
      n: toVec(pending.n),
      onId: pending.onId,
    };
    addHold.mutate(
      { hold, piece: encodePiece(cut.geom) },
      {
        onSuccess: (h) => {
          viewer?.addPiece(h.id, cut.geom);
          close();
          toast(
            h.onId
              ? 'Marker saved and linked to the hold under it.'
              : `${h.kind === 'volume' ? 'Volume' : 'Hold'} saved.`,
          );
        },
        onError: (e) => toast(friendly(e)),
      },
    );
  };
  const undo = () => {
    const last = holds[holds.length - 1];
    if (!last) return;
    if (data.routes.some((r) => r.wallId === wall.id && last.id in r.holds))
      return toast('That hold is used in a route. Remove it from the route first.');
    if (holds.some((h) => h.onId === last.id)) return toast('Remove its marker hold first.');
    deleteHold.mutate(last, {
      onSuccess: () => viewer?.forgetPiece(last.id),
      onError: (e) => toast(friendly(e)),
    });
  };
  // Turn the scan, or with no `what` keep the orientation and only make a fresh wall outline.
  const turn = (what?: 'upright' | 'spin') => {
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
          if (!what) toast('Wall outline rebuilt.');
        },
        onError: (e) => {
          buildScan(scan.source, wall, scan.bytes);
          toast(friendly(e));
        },
      },
    );
  };

  if (scanQuery.isLoading)
    return <p className={`${ui.muted} ${ui.smallText}`}>Downloading the full scan for tagging…</p>;
  if (scanQuery.error)
    return (
      <>
        <p className={ui.error}>{friendly(scanQuery.error)}</p>
        <div className={ui.actions}>
          <button type="button" className={`${ui.btn} ${ui.small}`} onClick={() => void scanQuery.refetch()}>
            Try again
          </button>
        </div>
      </>
    );
  if (!scan) return null;

  const hint = {
    hold: 'Zoom in, then tap a hold. The app finds its edge.',
    volume: 'Zoom in, then tap a volume. The app finds its edge.',
    marker: 'Tap the small hold bolted on a big hold you already tagged.',
  }[kind];
  const label = pending ? KIND_LABEL[pending.kind] : '';
  const message = !pending
    ? ''
    : addHold.isPending
      ? 'Saving…'
      : !cut
        ? 'Nothing inside the circle. Make it bigger, or tap again.'
        : pending.miss
          ? `Couldn't find the edge of this ${label}. Set the size with − and +, or turn the wall and tap again.`
          : pending.kind === 'marker'
            ? 'Check the small hold is inside the circle, then save.'
            : `Found the ${label}. Check the highlight covers all of it, then save.`;

  return (
    <>
      <StageTools>
        <button type="button" onClick={() => viewer?.resetView()}>
          Reset view
        </button>
      </StageTools>
      <StageDock>
        {pending ? (
          <>
            <p className={d.msg}>{message}</p>
            <div className={d.row}>
              <button
                type="button"
                className={d.btn}
                aria-label="Smaller"
                onClick={() => resize(-1)}
                disabled={addHold.isPending}
              >
                −
              </button>
              <span className={d.size}>{Math.round(pending.r * 100)} cm</span>
              <button
                type="button"
                className={d.btn}
                aria-label="Bigger"
                onClick={() => resize(1)}
                disabled={addHold.isPending}
              >
                +
              </button>
              <span className={d.spacer} />
              <button type="button" className={d.btn} onClick={close} disabled={addHold.isPending}>
                Cancel
              </button>
              <button
                type="button"
                className={d.primary}
                onClick={save}
                disabled={!cut || addHold.isPending}
                data-action="save-hold"
              >
                Save
              </button>
            </div>
          </>
        ) : (
          <>
            <div className={d.seg} role="group" aria-label="What to tag">
              {(['hold', 'volume', 'marker'] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  aria-pressed={kind === k}
                  onClick={() => setKind(k)}
                  data-kind={k}
                >
                  {k[0]!.toUpperCase() + k.slice(1)}
                </button>
              ))}
            </div>
            <div className={d.row}>
              <p className={d.msg}>
                {hint} <span className={ui.tally}>{holds.length} tagged</span>
              </p>
              <button
                type="button"
                className={d.btn}
                onClick={undo}
                disabled={!holds.length || deleteHold.isPending}
              >
                Undo
              </button>
            </div>
          </>
        )}
      </StageDock>

      <p className={`${ui.muted} ${ui.smallText}`}>
        {fmt(scan.tris)} triangles · {mb(scan.bytes)}
      </p>
      <div className={ui.field}>
        <span className={ui.label}>Orientation</span>
        <div className={ui.actions}>
          <button
            type="button"
            className={`${ui.btn} ${ui.small}`}
            disabled={!!holds.length || reorient.isPending}
            onClick={() => turn('upright')}
          >
            Stand upright
          </button>
          <button
            type="button"
            className={`${ui.btn} ${ui.small}`}
            disabled={!!holds.length || reorient.isPending}
            onClick={() => turn('spin')}
          >
            Turn 90°
          </button>
          <button
            type="button"
            className={`${ui.btn} ${ui.small}`}
            disabled={reorient.isPending}
            onClick={() => turn()}
          >
            Rebuild outline
          </button>
        </div>
        <p className={`${ui.muted} ${ui.smallText}`}>
          {holds.length
            ? 'Remove all tags to change orientation.'
            : 'Turn the scan until the wall faces you, then tag holds.'}{' '}
          Rebuild outline redraws the see-through wall shown behind routes.
        </p>
      </div>
      <div className={ui.field}>
        <span className={ui.label}>Tag holds</span>
        <p className={`${ui.muted} ${ui.smallText}`}>
          Use the bar on the wall view. Tap a hold and the app finds its edge, highlights it and zooms in so
          you can check it. Each hold is saved as its own small file. Drag with one finger to turn the wall,
          pinch to zoom.
        </p>
        <p className={ui.tally}>
          {holds.length} tagged · {plural(holds.filter((h) => h.kind === 'volume').length, 'volume')} ·{' '}
          {plural(holds.filter((h) => h.onId).length, 'marker')}
        </p>
      </div>
      <p className={ui.note}>Next: open Routes to set the normal routes on these holds.</p>
    </>
  );
}
