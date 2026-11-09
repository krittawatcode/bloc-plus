import {
  Box3,
  BufferAttribute,
  BufferGeometry,
  Color,
  type InterleavedBufferAttribute,
  type Material,
  Mesh,
  MeshStandardMaterial,
  type Object3D,
  DoubleSide,
  Vector3,
} from 'three';
import { makeSampler } from './piece';

export type Sampler = (u: number, v: number, out: number[]) => void;

/** One mesh of a scan, flattened to non-indexed triangles in final (oriented, centred) coordinates. */
export interface ScanPart {
  geom: BufferGeometry;
  material: Material;
  box: Box3;
  baseColor: Color;
  sampler: Sampler | null;
}

export interface LoadedScan {
  parts: ScanPart[];
  meshes: Mesh[];
  box: Box3;
  tris: number;
  bytes: number;
  /** Cached triangle centres, normals and areas for hold detection. */
  triCache?: TriCache;
  /** The untouched loaded scene, kept so orientation can be changed. */
  source: Object3D;
}

export interface TriCache {
  C: Float32Array;
  N: Float32Array;
  A: Float32Array;
  n: number;
}

export interface Orientation {
  upright: boolean;
  spin: number;
}

function readComponent(a: BufferAttribute | InterleavedBufferAttribute, vi: number, k: number): number {
  const v = k === 0 ? a.getX(vi) : k === 1 ? a.getY(vi) : k === 2 ? a.getZ(vi) : a.getW(vi);
  return v; // getX/getY/... already denormalise normalised attributes in current three.js
}

function bake(mesh: Mesh): { geom: BufferGeometry; material: Material } {
  const src = mesh.geometry;
  const index = src.getIndex();
  const count = index ? index.count : src.getAttribute('position').count;
  const geom = new BufferGeometry();
  for (const name of ['position', 'normal', 'uv', 'color'] as const) {
    const a = src.getAttribute(name) as BufferAttribute | InterleavedBufferAttribute | undefined;
    if (!a) continue;
    const size = name === 'color' ? Math.min(3, a.itemSize) : a.itemSize;
    const arr = new Float32Array(count * size);
    for (let i = 0; i < count; i++) {
      const vi = index ? index.getX(i) : i;
      for (let k = 0; k < size; k++) arr[i * size + k] = readComponent(a, vi, k);
    }
    geom.setAttribute(name, new BufferAttribute(arr, size));
  }
  geom.applyMatrix4(mesh.matrixWorld);
  if (!geom.getAttribute('normal')) geom.computeVertexNormals();
  let material = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as Material | undefined;
  material ??= new MeshStandardMaterial({ color: 0xbbbbbb });
  material.side = DoubleSide;
  if (geom.getAttribute('color') && 'vertexColors' in material)
    (material as MeshStandardMaterial).vertexColors = true;
  return { geom, material };
}

/** Rotate the loaded scene, flatten its meshes, and move it so the wall's base sits at y = 0, centred. */
export function buildScan(source: Object3D, o: Orientation, bytes: number): LoadedScan {
  source.rotation.set(o.upright ? -Math.PI / 2 : 0, (o.spin * Math.PI) / 2, 0, 'YXZ');
  source.updateMatrixWorld(true);
  const baked: { geom: BufferGeometry; material: Material }[] = [];
  source.traverse((obj) => {
    const m = obj as Mesh;
    if (m.isMesh && m.geometry?.getAttribute('position')) baked.push(bake(m));
  });
  if (!baked.length)
    throw new ScanError('This file has no 3D mesh in it. Export the scan as a mesh, not a point cloud.');
  const box = new Box3();
  for (const b of baked) {
    b.geom.computeBoundingBox();
    box.union(b.geom.boundingBox!);
  }
  const centre = box.getCenter(new Vector3());
  const off = new Vector3(-centre.x, -box.min.y, -centre.z);
  const parts: ScanPart[] = [];
  const meshes: Mesh[] = [];
  let tris = 0;
  for (const b of baked) {
    b.geom.translate(off.x, off.y, off.z);
    b.geom.computeBoundingBox();
    b.geom.computeBoundingSphere();
    const std = b.material as MeshStandardMaterial;
    const image = std.map?.image as (CanvasImageSource & { width: number; height: number }) | undefined;
    parts.push({
      geom: b.geom,
      material: b.material,
      box: b.geom.boundingBox!.clone(),
      baseColor: std.color ? std.color.clone() : new Color(1, 1, 1),
      sampler: image && image.width ? makeSampler(image) : null,
    });
    meshes.push(new Mesh(b.geom, b.material));
    tris += b.geom.getAttribute('position').count / 3;
  }
  const full = new Box3();
  for (const p of parts) full.union(p.box);
  return { parts, meshes, box: full, tris: Math.round(tris), bytes, source };
}

/**
 * A light outline of the wall for climbers: points spread evenly over the scan's surface (by triangle
 * area, not by vertex, so flat panels get as many points as busy holds). About 30,000 points, 360 KB.
 */
export function ghostPoints(scan: LoadedScan, target = 30000): Float32Array {
  // Pass 1: the area of every triangle (no objects per triangle, so big scans fit on a phone).
  const parts = scan.parts.map((p) => {
    const pos = p.geom.getAttribute('position');
    const idx = p.geom.getIndex();
    const n = Math.floor((idx ? idx.count : pos.count) / 3);
    const corner = (t: number, k: number) => (idx ? idx.getX(t * 3 + k) : t * 3 + k);
    const areas = new Float32Array(n);
    for (let t = 0; t < n; t++) {
      const a = corner(t, 0);
      const b = corner(t, 1);
      const c = corner(t, 2);
      const ux = pos.getX(b) - pos.getX(a);
      const uy = pos.getY(b) - pos.getY(a);
      const uz = pos.getZ(b) - pos.getZ(a);
      const vx = pos.getX(c) - pos.getX(a);
      const vy = pos.getY(c) - pos.getY(a);
      const vz = pos.getZ(c) - pos.getZ(a);
      areas[t] = Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2;
    }
    return { pos, corner, areas };
  });
  let total = 0;
  for (const p of parts) for (const a of p.areas) total += a;
  if (total <= 0) return new Float32Array();

  // Pass 2: drop points along the surface, one every `step` square metres.
  let seed = 1; // fixed, so the same scan always gives the same outline
  const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  const out = new Float32Array(target * 3);
  const step = total / target;
  let acc = rand() * step;
  let o = 0;
  for (const { pos, corner, areas } of parts)
    for (let t = 0; t < areas.length; t++) {
      acc += areas[t]!;
      while (acc >= step && o < out.length) {
        acc -= step;
        let u = rand();
        let v = rand();
        if (u + v > 1) {
          u = 1 - u;
          v = 1 - v;
        }
        const w = 1 - u - v;
        const a = corner(t, 0);
        const b = corner(t, 1);
        const c = corner(t, 2);
        out[o++] = pos.getX(a) * w + pos.getX(b) * u + pos.getX(c) * v;
        out[o++] = pos.getY(a) * w + pos.getY(b) * u + pos.getY(c) * v;
        out[o++] = pos.getZ(a) * w + pos.getZ(b) * u + pos.getZ(c) * v;
      }
    }
  return out.slice(0, o);
}

/** Cache key of a parsed scan. The tagger and the wall backdrop share it, so a scan downloads once. */
export const scanKey = (w: { id: string; scanPath: string | null; upright: boolean; spin: number }) =>
  ['scan', w.id, w.scanPath, w.upright, w.spin] as const;

export class ScanError extends Error {}

export async function parseScan(buf: ArrayBuffer, o: Orientation): Promise<LoadedScan> {
  const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
  let scene: Object3D;
  try {
    const gltf = await new GLTFLoader().parseAsync(buf, '');
    scene = gltf.scene;
  } catch (e) {
    const msg = String((e as Error)?.message ?? e);
    if (/draco/i.test(msg))
      throw new ScanError('This file uses Draco compression. Export it again without Draco and upload that.');
    throw new ScanError(
      'This file could not be read as a .glb scan. Export it again as GLB and try once more.',
    );
  }
  return buildScan(scene, o, buf.byteLength);
}
