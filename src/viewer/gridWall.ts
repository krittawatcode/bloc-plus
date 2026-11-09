import { Box3, BufferAttribute, BufferGeometry, Vector3 } from 'three';

/** A light grid surface of a scanned wall, like the demo wall's see-through look. */
export interface GridWall {
  /** Grid lines along rows and columns. */
  lines: BufferGeometry;
  /** A faint filled surface under the lines. */
  fill: BufferGeometry;
  box: Box3;
}

/** About this many metres between grid lines (the demo wall uses about the same). */
const CELL = 0.15;

/**
 * Fit a grid surface to the wall's outline points. The wall faces +z (towards the camera), so each grid
 * point takes the median depth of the scan points around it. Holds stick out of the wall, so the median
 * follows the panels, not the holds. Cells with no points (gaps, edges) stay open.
 */
export function gridFromPoints(pts: Float32Array): GridWall | null {
  const count = Math.floor(pts.length / 3);
  if (count < 50) return null;
  const box = new Box3();
  const v = new Vector3();
  for (let i = 0; i < count; i++) box.expandByPoint(v.fromArray(pts, i * 3));
  const size = box.getSize(new Vector3());
  const nx = Math.max(4, Math.min(60, Math.round(size.x / CELL)));
  const ny = Math.max(4, Math.min(60, Math.round(size.y / CELL)));
  const dx = size.x / nx;
  const dy = size.y / ny;

  // Depths of the points nearest to each grid point.
  const buckets: number[][] = Array.from({ length: (nx + 1) * (ny + 1) }, () => []);
  for (let i = 0; i < count; i++) {
    const gx = Math.round((pts[i * 3]! - box.min.x) / dx);
    const gy = Math.round((pts[i * 3 + 1]! - box.min.y) / dy);
    buckets[gy * (nx + 1) + gx]!.push(pts[i * 3 + 2]!);
  }
  const z = buckets.map((b) => {
    if (b.length < 2) return NaN;
    b.sort((p, q) => p - q);
    return b[b.length >> 1]!;
  });
  // Close small gaps: a missing point with at least 3 known neighbours takes their average.
  for (let pass = 0; pass < 2; pass++) {
    const next = z.slice();
    for (let y = 0; y <= ny; y++)
      for (let x = 0; x <= nx; x++) {
        const k = y * (nx + 1) + x;
        if (!Number.isNaN(z[k]!)) continue;
        let sum = 0;
        let n = 0;
        for (const [ox, oy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ] as const) {
          const xx = x + ox;
          const yy = y + oy;
          if (xx < 0 || yy < 0 || xx > nx || yy > ny) continue;
          const val = z[yy * (nx + 1) + xx]!;
          if (!Number.isNaN(val)) {
            sum += val;
            n++;
          }
        }
        if (n >= 3) next[k] = sum / n;
      }
    z.splice(0, z.length, ...next);
  }

  const pos = new Float32Array((nx + 1) * (ny + 1) * 3);
  for (let y = 0; y <= ny; y++)
    for (let x = 0; x <= nx; x++) {
      const k = y * (nx + 1) + x;
      pos[k * 3] = box.min.x + x * dx;
      pos[k * 3 + 1] = box.min.y + y * dy;
      pos[k * 3 + 2] = Number.isNaN(z[k]!) ? 0 : z[k]!;
    }
  const ok = (k: number) => !Number.isNaN(z[k]!);
  const lineIdx: number[] = [];
  const triIdx: number[] = [];
  for (let y = 0; y <= ny; y++)
    for (let x = 0; x <= nx; x++) {
      const k = y * (nx + 1) + x;
      if (!ok(k)) continue;
      if (x < nx && ok(k + 1)) lineIdx.push(k, k + 1);
      if (y < ny && ok(k + nx + 1)) lineIdx.push(k, k + nx + 1);
      if (x < nx && y < ny && ok(k + 1) && ok(k + nx + 1) && ok(k + nx + 2))
        triIdx.push(k, k + 1, k + nx + 2, k, k + nx + 2, k + nx + 1);
    }
  if (!lineIdx.length) return null;
  const attr = new BufferAttribute(pos, 3);
  const lines = new BufferGeometry();
  lines.setAttribute('position', attr);
  lines.setIndex(lineIdx);
  const fill = new BufferGeometry();
  fill.setAttribute('position', attr);
  fill.setIndex(triIdx);
  return { lines, fill, box };
}
