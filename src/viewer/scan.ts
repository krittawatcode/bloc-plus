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

/** A light outline of the wall for climbers: about 9,000 points. */
export function ghostPoints(scan: LoadedScan, target = 9000): Float32Array {
  let total = 0;
  for (const p of scan.parts) total += p.geom.getAttribute('position').count;
  const stride = Math.max(1, Math.ceil(total / target));
  const pts: number[] = [];
  for (const p of scan.parts) {
    const a = p.geom.getAttribute('position');
    for (let i = 0; i < a.count; i += stride) pts.push(a.getX(i), a.getY(i), a.getZ(i));
  }
  return new Float32Array(pts);
}

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
