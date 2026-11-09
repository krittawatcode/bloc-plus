import { BufferAttribute, BufferGeometry, Color, Float32BufferAttribute, Sphere, Vector3 } from 'three';
import type { LoadedScan } from './scan';

/**
 * A hold's own small 3D file. Layout (little-endian):
 *   u32 vertexCount
 *   f32 position[3 * n]   metres
 *   i8  normal[3 * n]     normalised to -127..127
 *   u8  color[3 * n]      linear RGB, 0..255
 * Triangles are not indexed: every 3 vertices make one triangle.
 */
export function encodePiece(geom: BufferGeometry): ArrayBuffer {
  const pos = geom.getAttribute('position').array as Float32Array;
  const nor = geom.getAttribute('normal').array as ArrayLike<number>;
  const col = geom.getAttribute('color').array as Uint8Array;
  const n = pos.length / 3;
  const buf = new ArrayBuffer(4 + n * 18);
  new DataView(buf).setUint32(0, n, true);
  new Float32Array(buf, 4, n * 3).set(pos);
  const ni = new Int8Array(buf, 4 + n * 12, n * 3);
  for (let i = 0; i < n * 3; i++) ni[i] = Math.max(-127, Math.min(127, Math.round(nor[i]! * 127)));
  new Uint8Array(buf, 4 + n * 15, n * 3).set(col);
  return buf;
}

export function decodePiece(buf: ArrayBuffer): BufferGeometry {
  if (buf.byteLength < 4) throw new Error('Hold file is empty.');
  const n = new DataView(buf).getUint32(0, true);
  if (buf.byteLength !== 4 + n * 18) throw new Error('Hold file is damaged.');
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(buf.slice(4, 4 + n * 12)), 3));
  g.setAttribute('normal', new BufferAttribute(new Int8Array(buf.slice(4 + n * 12, 4 + n * 15)), 3, true));
  g.setAttribute('color', new BufferAttribute(new Uint8Array(buf.slice(4 + n * 15)), 3, true));
  g.computeBoundingSphere();
  return g;
}

export interface CutResult {
  geom: BufferGeometry;
  /** Average outward direction of the cut triangles. */
  n: Vector3;
}

const srgbToLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));

/**
 * Copy every triangle whose centre is inside the sphere into one coloured mesh.
 * Colours come from the scan's vertex colours, or are sampled from its texture.
 */
export function cutPiece(scan: LoadedScan, c: Vector3, r: number): CutResult | null {
  const r2 = r * r;
  const sphere = new Sphere(c, r);
  return cut(
    scan,
    (part) => part.box.intersectsSphere(sphere),
    (P, t) => {
      const cx = (P.getX(t) + P.getX(t + 1) + P.getX(t + 2)) / 3 - c.x;
      const cy = (P.getY(t) + P.getY(t + 1) + P.getY(t + 2)) / 3 - c.y;
      const cz = (P.getZ(t) + P.getZ(t + 1) + P.getZ(t + 2)) / 3 - c.z;
      return cx * cx + cy * cy + cz * cz < r2;
    },
  );
}

/**
 * Copy exactly these triangles (indices as numbered by `triCache`, part by part) into one coloured
 * mesh. Used with the triangles hold detection found, so the piece follows the hold's real shape.
 */
export function cutTriangles(scan: LoadedScan, tris: Iterable<number>): CutResult | null {
  const want = new Set(tris);
  let offset = 0;
  const starts = scan.parts.map((p) => {
    const s = offset;
    offset += Math.floor(p.geom.getAttribute('position').count / 3);
    return s;
  });
  let k = -1;
  return cut(
    scan,
    (_part, pi) => {
      k = starts[pi]!;
      return true;
    },
    (_P, t) => want.has(k + t / 3),
  );
}

type Positions = BufferGeometry['attributes'][string];

function cut(
  scan: LoadedScan,
  usePart: (part: LoadedScan['parts'][number], index: number) => boolean,
  keep: (P: Positions, t: number) => boolean,
): CutResult | null {
  const pos: number[] = [];
  const nor: number[] = [];
  const col: number[] = [];
  const nsum = new Vector3();
  const a = new Vector3(),
    b = new Vector3(),
    d = new Vector3(),
    e1 = new Vector3(),
    e2 = new Vector3();
  const rgb = [1, 1, 1];
  scan.parts.forEach((part, pi) => {
    if (!usePart(part, pi)) return;
    const P = part.geom.getAttribute('position');
    const N = part.geom.getAttribute('normal');
    const UV = part.geom.getAttribute('uv');
    const CA = part.geom.getAttribute('color');
    const sample = UV && !CA ? part.sampler : null;
    const base: Color = part.baseColor;
    for (let t = 0; t + 2 < P.count; t += 3) {
      if (!keep(P, t)) continue;
      a.fromBufferAttribute(P, t);
      b.fromBufferAttribute(P, t + 1);
      d.fromBufferAttribute(P, t + 2);
      nsum.add(e1.subVectors(b, a).cross(e2.subVectors(d, a)));
      for (let k = 0; k < 3; k++) {
        const i = t + k;
        pos.push(P.getX(i), P.getY(i), P.getZ(i));
        nor.push(N.getX(i), N.getY(i), N.getZ(i));
        if (CA) {
          rgb[0] = CA.getX(i);
          rgb[1] = CA.getY(i);
          rgb[2] = CA.getZ(i);
        } else if (sample && UV) {
          sample(UV.getX(i), UV.getY(i), rgb);
        } else {
          rgb[0] = rgb[1] = rgb[2] = 0.64;
        }
        col.push(rgb[0]! * base.r * 255, rgb[1]! * base.g * 255, rgb[2]! * base.b * 255);
      }
    }
  });
  if (!pos.length) return null;
  const geom = new BufferGeometry();
  geom.setAttribute('position', new Float32BufferAttribute(pos, 3));
  geom.setAttribute('normal', new Float32BufferAttribute(nor, 3));
  geom.setAttribute(
    'color',
    new BufferAttribute(
      Uint8Array.from(col, (v) => Math.max(0, Math.min(255, Math.round(v)))),
      3,
      true,
    ),
  );
  geom.computeBoundingSphere();
  return { geom, n: nsum.lengthSq() > 0 ? nsum.normalize() : new Vector3(0, 0, 1) };
}

/** Texture colours are sRGB; vertex colours are linear. Convert while sampling. */
export function makeSampler(image: CanvasImageSource & { width: number; height: number }) {
  const w = Math.min(image.width, 2048),
    h = Math.min(image.height, 2048);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(image, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h).data;
  return (u: number, v: number, out: number[]) => {
    u -= Math.floor(u);
    v -= Math.floor(v);
    const x = Math.min(w - 1, Math.floor(u * w)),
      y = Math.min(h - 1, Math.floor(v * h));
    const i = (y * w + x) * 4;
    out[0] = srgbToLinear(data[i]! / 255);
    out[1] = srgbToLinear(data[i + 1]! / 255);
    out[2] = srgbToLinear(data[i + 2]! / 255);
  };
}
