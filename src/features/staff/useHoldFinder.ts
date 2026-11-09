import { useEffect, useMemo, useState } from 'react';
import { Vector3 } from 'three';
import { useAddHold } from '@/data/queries';
import type { Hold, HoldKind, Vec3, Wall } from '@/domain/types';
import { uid } from '@/lib/format';
import { detectHold } from '@/viewer/detect';
import { cutPiece, cutTriangles, encodePiece } from '@/viewer/piece';
import type { LoadedScan } from '@/viewer/scan';
import { TAP_PX, type ViewState, type WallViewer } from '@/viewer/WallViewer';

/** A hold the app found where staff tapped, highlighted until they add it or cancel. */
export interface PendingHold {
  kind: HoldKind;
  c: Vector3;
  r: number;
  n: Vector3;
  /** For a marker: the big hold or volume it is bolted on. */
  onId: string | null;
  miss: boolean;
  /**
   * The scan triangles of the hold as found, so the piece follows its real shape (a long volume is
   * not a circle). Null after a manual − / +: then everything inside the circle is used.
   */
  tris: number[] | null;
  /** Where the tap was, so a different kind can be looked for in the same spot. */
  tap: { p: Vector3; n: Vector3 };
  prev: ViewState | null;
}

const toVec = (v: Vector3): Vec3 => [v.x, v.y, v.z];
const at = (h: Hold) => new Vector3(...h.c);

/** The smallest saved hold whose middle is near p, if any. Small holds win, so a marker beats its volume. */
function holdAt(holds: Hold[], p: Vector3): Hold | undefined {
  return [...holds]
    .sort((a, b) => a.r - b.r)
    .find((h) => at(h).distanceTo(p) < Math.max(0.03, h.r * (h.kind === 'volume' ? 0.8 : 0.6)));
}

/** The big hold or volume a small hold at p is bolted on (for markers). */
function hostAt(holds: Hold[], p: Vector3, r: number): Hold | undefined {
  return holds
    .filter((h) => !h.onId && h.r > r * 1.8 && at(h).distanceTo(p) < h.r + 0.03)
    .sort((a, b) => at(a).distanceTo(p) - at(b).distanceTo(p))[0];
}

/**
 * Find holds on a wall scan while setting a route. A tap on a hold that is already saved returns it;
 * a tap anywhere else looks for the hold's edge and shows it for checking before it is saved.
 */
export function useHoldFinder(
  wall: Wall | undefined,
  scan: LoadedScan | undefined,
  viewer: WallViewer | null,
  holds: Hold[],
) {
  const addHold = useAddHold();
  const [pending, setPending] = useState<PendingHold | null>(null);

  const cut = useMemo(
    () =>
      !scan || !pending
        ? null
        : pending.tris
          ? cutTriangles(scan, pending.tris)
          : cutPiece(scan, pending.c, pending.r),
    [scan, pending],
  );
  useEffect(() => {
    viewer?.setPreview(
      pending ? { geom: cut?.geom ?? null, c: pending.c, r: pending.r, n: pending.n } : null,
    );
  }, [viewer, pending, cut]);
  useEffect(() => () => viewer?.setPreview(null), [viewer]);

  const look = (kind: HoldKind, p: Vector3, n: Vector3, base: ViewState | null): PendingHold | null => {
    if (!scan || !viewer) return null;
    if (kind === 'marker') {
      const host =
        hostAt(holds, p, 0.05) ??
        holdAt(
          holds.filter((h) => !h.onId),
          p,
        );
      return {
        kind,
        c: p,
        r: 0.05,
        n,
        onId: host?.id ?? null,
        miss: !host,
        tris: null,
        tap: { p, n },
        prev: base,
      };
    }
    const tol = Math.min(0.2, Math.max(0.04, viewer.pxToWorld(p, TAP_PX)));
    let found = detectHold(scan, p, kind, tol, viewer.viewDirAt(p));
    // Long or big holds are often too large for the hold search: try again as a volume.
    if (!found && kind === 'hold') {
      found = detectHold(scan, p, 'volume', tol, viewer.viewDirAt(p));
      if (found) kind = 'volume';
    }
    if (!found)
      return {
        kind,
        c: p,
        r: kind === 'volume' ? 0.4 : 0.1,
        n,
        onId: null,
        miss: true,
        tris: null,
        tap: { p, n },
        prev: base,
      };
    // A small hold found on a big saved hold is most likely a marker bolted on it.
    const host = kind === 'hold' ? hostAt(holds, found.c, found.r) : undefined;
    if (host && found.r < 0.08)
      return {
        kind: 'marker',
        c: found.c,
        r: found.r,
        n: found.n,
        onId: host.id,
        miss: false,
        tris: found.tris,
        tap: { p, n },
        prev: base,
      };
    return {
      kind,
      c: found.c,
      r: found.r,
      n: found.n,
      onId: null,
      miss: false,
      tris: found.tris,
      tap: { p, n },
      prev: base,
    };
  };

  /** Handle a tap on the scan. Returns the id of a saved hold that was tapped, or null. */
  const tap = (p: Vector3, n: Vector3): string | null => {
    if (!viewer || addHold.isPending) return null;
    if (pending) viewer.restoreView(pending.prev);
    const base = pending?.prev ?? null;
    const saved = holdAt(holds, p);
    if (saved) {
      setPending(null);
      return saved.id;
    }
    const next = look('hold', p, n, null);
    if (!next) return null;
    const prev = viewer.focusOn(next.c, next.r) ?? base;
    setPending({ ...next, prev });
    return null;
  };

  /** Look again in the same spot for a different kind (hold, volume or marker). */
  const setKind = (kind: HoldKind) => {
    if (!pending || pending.kind === kind) return;
    const next = look(kind, pending.tap.p, pending.tap.n, pending.prev);
    if (next) setPending(next);
  };

  const resize = (dir: 1 | -1) => {
    if (!pending) return;
    const step = pending.kind === 'volume' ? 0.05 : pending.r < 0.1 ? 0.01 : 0.02;
    setPending({
      ...pending,
      r: Math.min(0.9, Math.max(0.02, +(pending.r + dir * step).toFixed(3))),
      miss: false,
      tris: null,
    });
  };

  const cancel = () => {
    viewer?.restoreView(pending?.prev);
    setPending(null);
  };

  /** Save the pending hold. Resolves to the saved hold. */
  const save = async (): Promise<Hold | null> => {
    if (!pending || !cut || !wall) return null;
    if (pending.kind === 'marker' && !pending.onId)
      throw new Error('A marker must sit on a big hold or volume.');
    const hold = await addHold.mutateAsync({
      hold: {
        id: uid('h'),
        wallId: wall.id,
        kind: pending.kind,
        c: toVec(pending.c),
        r: pending.r,
        n: toVec(pending.n),
        onId: pending.kind === 'marker' ? pending.onId : null,
      },
      piece: encodePiece(cut.geom),
    });
    viewer?.addPiece(hold.id, cut.geom);
    cancel();
    return hold;
  };

  const message = !pending
    ? ''
    : addHold.isPending
      ? 'Saving…'
      : !cut
        ? 'Nothing inside the circle. Make it bigger, or tap again.'
        : pending.kind === 'marker'
          ? pending.onId
            ? 'Marker hold: check the small hold is inside the circle.'
            : 'A marker sits on a big hold or volume. Add that one to a route first.'
          : pending.miss
            ? `Couldn't find the edge. Set the size with − and +, or tap again.`
            : `Found a ${pending.kind}. Check the highlight covers all of it.`;

  return { pending, cut, tap, setKind, resize, cancel, save, saving: addHold.isPending, message };
}
