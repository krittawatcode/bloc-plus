import { Vector3 } from 'three';
import type { HoldKind } from '@/domain/types';
import type { LoadedScan, TriCache } from './scan';

/** Triangle centres, unit normals and areas for the whole scan, computed once. */
export function triCache(scan: Pick<LoadedScan, 'parts' | 'triCache'>): TriCache {
  if (scan.triCache) return scan.triCache;
  let n = 0;
  for (const p of scan.parts) n += Math.floor(p.geom.getAttribute('position').count / 3);
  const C = new Float32Array(n * 3),
    N = new Float32Array(n * 3),
    A = new Float32Array(n);
  const a = new Vector3(),
    b = new Vector3(),
    c = new Vector3(),
    e1 = new Vector3(),
    e2 = new Vector3();
  let k = 0;
  for (const p of scan.parts) {
    const P = p.geom.getAttribute('position');
    for (let t = 0; t + 2 < P.count; t += 3, k++) {
      a.fromBufferAttribute(P, t);
      b.fromBufferAttribute(P, t + 1);
      c.fromBufferAttribute(P, t + 2);
      C[k * 3] = (a.x + b.x + c.x) / 3;
      C[k * 3 + 1] = (a.y + b.y + c.y) / 3;
      C[k * 3 + 2] = (a.z + b.z + c.z) / 3;
      e1.subVectors(b, a).cross(e2.subVectors(c, a));
      const l = e1.length();
      A[k] = l / 2;
      if (l > 0) e1.divideScalar(l);
      N[k * 3] = e1.x;
      N[k * 3 + 1] = e1.y;
      N[k * 3 + 2] = e1.z;
    }
  }
  const cache = { C, N, A, n: k };
  scan.triCache = cache;
  return cache;
}

export interface Detected {
  /** Centre of the hold (area-weighted). */
  c: Vector3;
  /** Radius that covers the whole hold plus a small margin. */
  r: number;
  /** Outward normal of the wall around the hold. */
  n: Vector3;
  /** The scan triangles that make up the hold (numbered as in `triCache`). */
  tris: number[];
}

/**
 * Find the hold under a tap.
 * 1. Fit the flat wall in a ring around the tap, ignoring triangles that face another way (floor, roof).
 * 2. Keep triangles inside the ring that stand out from that wall by more than the scan noise.
 * 3. Start from the raised triangle nearest the tap (within `tol` along the wall) and grow across
 *    touching raised triangles. If the group reaches the edge of the area, look wider and try again.
 *
 * @param p   point where the tap hit the scan
 * @param tol how far from the tap the hold may be, metres (a finger's width on screen)
 * @param view unit vector from the tap point towards the camera
 */
export function detectHold(
  scan: Pick<LoadedScan, 'parts' | 'triCache'>,
  p: Vector3,
  kind: HoldKind,
  tol: number,
  view: Vector3,
): Detected | null {
  const { C, N, A, n } = triCache(scan);
  let rin = Math.max(kind === 'volume' ? 0.55 : 0.2, tol + 0.12);
  const rmax = kind === 'volume' ? 1.4 : 0.65;
  const nrm = new Vector3(),
    p0 = new Vector3();
  const fit = (list: number[]) => {
    nrm.set(0, 0, 0);
    p0.set(0, 0, 0);
    let w = 0;
    for (const i of list) {
      const a = A[i]!;
      const sg = N[i * 3]! * view.x + N[i * 3 + 1]! * view.y + N[i * 3 + 2]! * view.z < 0 ? -a : a;
      nrm.x += N[i * 3]! * sg;
      nrm.y += N[i * 3 + 1]! * sg;
      nrm.z += N[i * 3 + 2]! * sg;
      p0.x += C[i * 3]! * a;
      p0.y += C[i * 3 + 1]! * a;
      p0.z += C[i * 3 + 2]! * a;
      w += a;
    }
    nrm.normalize();
    p0.divideScalar(w || 1);
  };
  const dist = (i: number) =>
    (C[i * 3]! - p0.x) * nrm.x + (C[i * 3 + 1]! - p0.y) * nrm.y + (C[i * 3 + 2]! - p0.z) * nrm.z;
  const facing = (i: number, v: Vector3) =>
    Math.abs(N[i * 3]! * v.x + N[i * 3 + 1]! * v.y + N[i * 3 + 2]! * v.z);

  for (let attempt = 0; attempt < 5 && rin <= rmax; attempt++, rin *= 1.5) {
    const outer2 = (rin * 1.8) ** 2,
      inner2 = rin * rin;
    const inner: number[] = [];
    let ring: number[] = [];
    for (let i = 0; i < n; i++) {
      const dx = C[i * 3]! - p.x,
        dy = C[i * 3 + 1]! - p.y,
        dz = C[i * 3 + 2]! - p.z;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 < outer2) (d2 < inner2 ? inner : ring).push(i);
    }
    if (ring.length < 40 || !inner.length) continue;
    const towardsView = ring.filter((i) => facing(i, view) > 0.45);
    if (towardsView.length >= 40) ring = towardsView;
    fit(ring);
    for (let it = 0; it < 2; it++) {
      const aligned = ring.filter((i) => facing(i, nrm) > 0.8);
      if (aligned.length >= 40) {
        ring = aligned;
        fit(ring);
      }
    }
    let kept = ring;
    for (let it = 0; it < 3; it++) {
      const ds = kept.map(dist).sort((x, y) => x - y);
      const lim = ds[Math.floor(ds.length * 0.6)]! + 0.004;
      kept = kept.filter((i) => dist(i) <= lim);
      fit(kept);
    }
    let mean = 0,
      sq = 0;
    for (const i of kept) {
      const d = dist(i);
      mean += d;
      sq += d * d;
    }
    mean /= kept.length;
    const sigma = Math.sqrt(Math.max(0, sq / kept.length - mean * mean));
    const thresh = Math.max(0.006, 3 * sigma) + mean;
    const raised = inner.filter((i) => dist(i) > thresh);
    if (!raised.length) return null;

    const lateral = (i: number) => {
      const dx = C[i * 3]! - p.x,
        dy = C[i * 3 + 1]! - p.y,
        dz = C[i * 3 + 2]! - p.z;
      const h = dx * nrm.x + dy * nrm.y + dz * nrm.z;
      return Math.sqrt(Math.max(0, dx * dx + dy * dy + dz * dz - h * h));
    };
    let seed = -1,
      best = tol;
    for (const i of raised) {
      const l = lateral(i);
      if (l < best) {
        best = l;
        seed = i;
      }
    }
    if (seed < 0) return null;

    const areas = raised.map((i) => A[i]!).sort((x, y) => x - y);
    const link = Math.max(0.025, 2.2 * Math.sqrt(areas[areas.length >> 1]!));
    const key = (x: number, y: number, z: number) => `${x},${y},${z}`;
    const cell = (v: number) => Math.floor(v / link);
    const grid = new Map<string, number[]>();
    for (const i of raised) {
      const k = key(cell(C[i * 3]!), cell(C[i * 3 + 1]!), cell(C[i * 3 + 2]!));
      let list = grid.get(k);
      if (!list) grid.set(k, (list = []));
      list.push(i);
    }
    const seen = new Set([seed]);
    const queue = [seed];
    let touchesEdge = false;
    while (queue.length) {
      const i = queue.pop()!;
      if (lateral(i) > rin - 0.03) touchesEdge = true;
      const gx = cell(C[i * 3]!),
        gy = cell(C[i * 3 + 1]!),
        gz = cell(C[i * 3 + 2]!);
      for (let x = -1; x <= 1; x++)
        for (let y = -1; y <= 1; y++)
          for (let z = -1; z <= 1; z++) {
            const list = grid.get(key(gx + x, gy + y, gz + z));
            if (!list) continue;
            for (const j of list) {
              if (seen.has(j)) continue;
              const dx = C[j * 3]! - C[i * 3]!,
                dy = C[j * 3 + 1]! - C[i * 3 + 1]!,
                dz = C[j * 3 + 2]! - C[i * 3 + 2]!;
              if (dx * dx + dy * dy + dz * dz <= link * link) {
                seen.add(j);
                queue.push(j);
              }
            }
          }
    }
    if (touchesEdge) continue;

    const centre = new Vector3();
    let w = 0;
    for (const i of seen) {
      centre.x += C[i * 3]! * A[i]!;
      centre.y += C[i * 3 + 1]! * A[i]!;
      centre.z += C[i * 3 + 2]! * A[i]!;
      w += A[i]!;
    }
    centre.divideScalar(w);
    let r = 0;
    for (const i of seen) {
      const dx = C[i * 3]! - centre.x,
        dy = C[i * 3 + 1]! - centre.y,
        dz = C[i * 3 + 2]! - centre.z;
      r = Math.max(r, Math.sqrt(dx * dx + dy * dy + dz * dz));
    }
    r += Math.min(0.03, link * 0.6);
    if (r > (kind === 'volume' ? 1.0 : 0.4)) return null;
    return { c: centre, r, n: nrm.clone(), tris: [...seen] };
  }
  return null;
}
