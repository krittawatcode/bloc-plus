import { describe, expect, it } from 'vitest';
import {
  Box3,
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  MeshStandardMaterial,
  PlaneGeometry,
  SphereGeometry,
  Vector3,
} from 'three';
import { detectHold } from './detect';
import { cutPiece, decodePiece, encodePiece } from './piece';
import type { ScanPart } from './scan';

/** A 3 × 3 m flat wall facing +z, with round "holds" stuck on it. Optional floor in front. */
function fakeScan(holds: { x: number; y: number; r: number }[], withFloor = false) {
  const parts: ScanPart[] = [];
  const addPart = (g: BufferGeometry) => {
    const geom = g.toNonIndexed();
    geom.computeVertexNormals();
    const n = geom.getAttribute('position').count;
    geom.setAttribute('color', new Float32BufferAttribute(new Array(n * 3).fill(0.5), 3));
    geom.computeBoundingBox();
    parts.push({
      geom,
      material: new MeshStandardMaterial(),
      box: geom.boundingBox!.clone(),
      baseColor: new Color(1, 1, 1),
      sampler: null,
    });
  };
  const wall = new PlaneGeometry(3, 3, 150, 150);
  wall.translate(0, 1.5, 0);
  addPart(wall);
  for (const h of holds) {
    const s = new SphereGeometry(h.r, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2);
    s.rotateX(Math.PI / 2);
    s.scale(1, 1, 0.5);
    s.translate(h.x, h.y, 0);
    addPart(s);
  }
  if (withFloor) {
    const f = new PlaneGeometry(3, 1.5, 60, 30);
    f.rotateX(-Math.PI / 2);
    f.translate(0, 0, 0.75);
    addPart(f);
  }
  const box = new Box3();
  parts.forEach((p) => box.union(p.box));
  return { parts };
}

const towardsViewer = new Vector3(0, 0, 1);

describe('detectHold', () => {
  it('finds a hold from a tap on its surface', () => {
    const scan = fakeScan([{ x: 0, y: 1.5, r: 0.08 }]);
    const d = detectHold(scan, new Vector3(0.02, 1.51, 0.03), 'hold', 0.05, towardsViewer)!;
    expect(d).not.toBeNull();
    expect(d.c.x).toBeCloseTo(0, 1);
    expect(d.c.y).toBeCloseTo(1.5, 1);
    expect(d.r).toBeGreaterThan(0.07);
    expect(d.r).toBeLessThan(0.14);
    expect(d.n.z).toBeGreaterThan(0.95);
  });

  it('forgives a tap that lands on the wall next to the hold', () => {
    const scan = fakeScan([{ x: 0, y: 1.5, r: 0.06 }]);
    const d = detectHold(scan, new Vector3(0.12, 1.45, 0), 'hold', 0.15, towardsViewer)!;
    expect(d.c.distanceTo(new Vector3(0, 1.5, 0))).toBeLessThan(0.04);
  });

  it('picks the nearer of two holds', () => {
    const scan = fakeScan([
      { x: -0.25, y: 1.5, r: 0.06 },
      { x: 0.25, y: 1.5, r: 0.06 },
    ]);
    const d = detectHold(scan, new Vector3(0.2, 1.5, 0), 'hold', 0.15, towardsViewer)!;
    expect(d.c.x).toBeGreaterThan(0.15);
  });

  it('is not fooled by the floor next to a low foot hold', () => {
    const scan = fakeScan([{ x: 0, y: 0.25, r: 0.05 }], true);
    const d = detectHold(scan, new Vector3(0, 0.25, 0.02), 'hold', 0.2, new Vector3(0, 0.3, 1).normalize())!;
    expect(d).not.toBeNull();
    expect(d.c.y).toBeCloseTo(0.25, 1);
    expect(d.r).toBeLessThan(0.12);
  });

  it('returns null on bare wall', () => {
    const scan = fakeScan([{ x: 1, y: 2.5, r: 0.06 }]);
    expect(detectHold(scan, new Vector3(-0.8, 1, 0), 'hold', 0.05, towardsViewer)).toBeNull();
  });
});

describe('hold files', () => {
  it('cut a hold out of the scan and survive a round trip through the file format', () => {
    const scan = fakeScan([{ x: 0, y: 1.5, r: 0.08 }]);
    const cut = cutPiece(
      { ...scan, meshes: [], box: new Box3(), tris: 0, bytes: 0, source: null! },
      new Vector3(0, 1.5, 0),
      0.1,
    )!;
    expect(cut).not.toBeNull();
    const buf = encodePiece(cut.geom);
    const back = decodePiece(buf);
    const a = cut.geom.getAttribute('position'),
      b = back.getAttribute('position');
    expect(b.count).toBe(a.count);
    expect(b.getX(5)).toBeCloseTo(a.getX(5), 5);
    expect(back.getAttribute('color').getX(0)).toBeCloseTo(0.5, 1);
    expect(back.getAttribute('normal').getZ(0)).toBeCloseTo(cut.geom.getAttribute('normal').getZ(0), 1);
    expect(buf.byteLength).toBe(4 + a.count * 18);
  });

  it('rejects a damaged file', () => {
    expect(() => decodePiece(new ArrayBuffer(10))).toThrow(/damaged/);
  });
});
