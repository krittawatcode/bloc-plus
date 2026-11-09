import {
  BoxGeometry,
  BufferGeometry,
  ConeGeometry,
  DoubleSide,
  Float32BufferAttribute,
  IcosahedronGeometry,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  type Object3D,
  Points,
  PointsMaterial,
  Quaternion,
  Vector3,
} from 'three';
import { TAPE_COLORS } from '@/domain/routes';
import { PRACTICE_WALL_ID, type Hold, type Vec3 } from '@/domain/types';

/**
 * A built-in 6 m practice wall: a 10° slab, a vertical face into a 42° roof and a 29° overhang.
 * Staff can set routes on it before they have scanned a real wall. Climbers never see it.
 */
const WALL_W = 6,
  WALL_H = 4.2;
const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
function profile(x: number, y: number) {
  const slab = -0.18 * y,
    vert = Math.max(0, y - 1.3) * 0.9,
    over = 0.55 * y;
  const t1 = smooth(1.7, 2.3, x),
    t2 = smooth(3.7, 4.3, x);
  return slab * (1 - t1) + (vert * (1 - t2) + over * t2) * t1;
}
const surface = (x: number, y: number) => new Vector3(x - WALL_W / 2, y, profile(x, y));
function surfaceNormal(x: number, y: number) {
  const e = 0.01;
  const dzx = profile(x + e, y) - profile(x - e, y),
    dzy = profile(x, y + e) - profile(x, y - e);
  return new Vector3(-dzx, -dzy, 2 * e).normalize();
}

function rng(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface PracticeHold extends Hold {
  color: string;
  seed: number;
}

const ZAX = new Vector3(0, 0, 1);
const toVec = (v: Vector3): Vec3 => [v.x, v.y, v.z];

function build(): PracticeHold[] {
  const holds: PracticeHold[] = [];
  const add = (
    id: string,
    kind: Hold['kind'],
    x: number,
    y: number,
    r: number,
    color: string,
    seed: number,
    onId: string | null = null,
  ) => {
    const n = surfaceNormal(x, y);
    let c = surface(x, y);
    if (onId) {
      const parent = holds.find((h) => h.id === onId)!;
      const pn = new Vector3(...parent.n);
      const side = new Vector3(1, 0, 0).projectOnPlane(pn).normalize();
      const lift = parent.kind === 'volume' ? parent.r * 0.55 : parent.r * 0.62;
      c = new Vector3(...parent.c)
        .addScaledVector(pn, lift)
        .addScaledVector(side, parent.kind === 'volume' ? 0 : parent.r * 0.18);
    }
    holds.push({
      id,
      wallId: PRACTICE_WALL_ID,
      kind,
      c: toVec(c),
      r,
      n: toVec(n),
      onId,
      piecePath: null,
      color,
      seed,
    });
  };
  const sets: [string, [number, number, number, string?][]][] = [
    [
      TAPE_COLORS.yellow!,
      [
        [0.85, 0.35, 0.06],
        [0.6, 1.15, 0.09],
        [1.05, 1.55, 0.08],
        [0.7, 2.05, 0.16, TAPE_COLORS.green],
        [1.15, 2.5, 0.08],
        [0.8, 3.0, 0.09],
        [1.25, 3.45, 0.08],
        [0.95, 3.95, 0.1],
      ],
    ],
    [
      TAPE_COLORS.blue!,
      [
        [2.95, 0.3, 0.06],
        [2.6, 1.2, 0.08],
        [2.85, 1.8, 0.11],
        [3.3, 2.3, 0.15, TAPE_COLORS.white],
        [2.7, 2.8, 0.08],
        [3.2, 3.35, 0.07],
        [2.9, 3.9, 0.1],
      ],
    ],
    [
      TAPE_COLORS.pink!,
      [
        [4.9, 0.35, 0.06],
        [5.1, 1.1, 0.08],
        [4.7, 1.65, 0.07],
        [5.3, 2.2, 0.09],
        [4.8, 2.85, 0.07],
        [5.4, 3.35, 0.08],
        [5.0, 3.95, 0.1],
      ],
    ],
  ];
  let k = 0;
  for (const [colour, pts] of sets)
    for (const [x, y, r, big] of pts) {
      const id = `p${++k}`;
      add(id, 'hold', x, y, r, big ?? colour, k + 3);
      if (big) add(`${id}m`, 'marker', x, y, 0.045, colour, k + 40, id);
    }
  [
    [3.55, 1.5],
    [5.55, 1.6],
    [0.35, 2.7],
  ].forEach(([x, y], i) => add(`v${i + 1}`, 'volume', x!, y!, 0.42, '#8E8A80', 90 + i));
  add('v2m', 'marker', 5.55, 1.6, 0.045, TAPE_COLORS.pink!, 95, 'v2');
  const fill = [
    TAPE_COLORS.green!,
    TAPE_COLORS.purple!,
    TAPE_COLORS.black!,
    TAPE_COLORS.orange!,
    TAPE_COLORS.white!,
  ];
  const placed: [number, number, number, Hold['kind']][] = [];
  for (const h of holds) {
    const v = new Vector3(...h.c);
    placed.push([v.x + WALL_W / 2, v.y, h.r, h.kind]);
  }
  const R = rng(7);
  let count = 0,
    tries = 0;
  while (count < 46 && tries < 3000) {
    tries++;
    const x = 0.2 + R() * 5.6,
      y = 0.25 + R() * 3.8,
      r = 0.05 + R() * 0.07;
    if (
      placed.some(
        ([hx, hy, hr, kind]) =>
          Math.hypot(hx - x, hy - y) < (kind === 'volume' ? 0.55 : Math.max(0.3, hr + 0.2)),
      )
    )
      continue;
    count++;
    add(`h${count}`, 'hold', x, y, r, fill[count % fill.length]!, 200 + count);
    placed.push([x, y, r, 'hold']);
  }
  return holds;
}

export const PRACTICE_HOLDS: PracticeHold[] = build();

const materials = new Map<string, MeshStandardMaterial>();
const mat = (color: string) => {
  let m = materials.get(color);
  if (!m)
    materials.set(
      color,
      (m = new MeshStandardMaterial({ color, roughness: 0.72, metalness: 0, flatShading: true })),
    );
  return m;
};

export function buildPracticeHold(h: PracticeHold): Mesh {
  let g: BufferGeometry;
  if (h.kind === 'volume') {
    g = new ConeGeometry(h.r, h.r * 0.7, 3);
    g.rotateX(Math.PI / 2);
    g.translate(0, 0, h.r * 0.35);
  } else {
    g = new IcosahedronGeometry(h.r, 1);
    const p = g.getAttribute('position');
    const v = new Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      const d = v.clone().normalize();
      const f =
        1 +
        0.22 * Math.sin(3.1 * d.x + h.seed) * Math.cos(2.7 * d.y + h.seed * 1.3) +
        0.12 * Math.sin(4.3 * d.z + h.seed * 0.7);
      v.multiplyScalar(f);
      v.z = v.z * 0.5 + h.r * 0.2;
      p.setXYZ(i, v.x, v.y, v.z);
    }
    g.computeVertexNormals();
  }
  const m = new Mesh(g, mat(h.color));
  m.position.set(...h.c);
  m.quaternion.setFromUnitVectors(ZAX, new Vector3(...h.n));
  m.rotateZ(h.seed * 1.7);
  m.userData.holdId = h.id;
  return m;
}

function wallGeometry(nx: number, ny: number) {
  const pos: number[] = [],
    idx: number[] = [];
  for (let j = 0; j <= ny; j++)
    for (let i = 0; i <= nx; i++) {
      const v = surface((i / nx) * WALL_W, (j / ny) * WALL_H);
      pos.push(v.x, v.y, v.z);
    }
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++) {
      const a = j * (nx + 1) + i,
        b = a + 1,
        c = a + nx + 2,
        d = a + nx + 1;
      idx.push(a, b, c, a, c, d);
    }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export interface PracticeColours {
  wall: string;
  tnut: string;
  mat: string;
  fg: string;
}

/** The full practice wall with panels, T-nuts and a floor mat. */
export function practiceWallObjects(c: PracticeColours): Object3D[] {
  const wall = new Mesh(
    wallGeometry(48, 34),
    new MeshStandardMaterial({ color: c.wall, roughness: 0.95, side: DoubleSide }),
  );
  const pts: number[] = [];
  for (let x = 0.1; x < WALL_W; x += 0.2)
    for (let y = 0.15; y < WALL_H; y += 0.2) {
      const p = surface(x, y).addScaledVector(surfaceNormal(x, y), 0.004);
      pts.push(p.x, p.y, p.z);
    }
  const pg = new BufferGeometry();
  pg.setAttribute('position', new Float32BufferAttribute(pts, 3));
  const tnuts = new Points(pg, new PointsMaterial({ color: c.tnut, size: 0.014 }));
  const floor = new Mesh(
    new BoxGeometry(WALL_W + 1, 0.3, 3),
    new MeshStandardMaterial({ color: c.mat, roughness: 1 }),
  );
  floor.position.set(0, -0.15, 1.3);
  return [wall, tnuts, floor];
}

/** A faint see-through version of the practice wall for climber views. */
export function practiceGhostObjects(fg: string, strength = 1): Object3D[] {
  const g = wallGeometry(18, 12);
  return [
    new Mesh(
      g,
      new MeshBasicMaterial({
        color: fg,
        wireframe: true,
        transparent: true,
        opacity: Math.min(1, 0.16 * strength),
        depthWrite: false,
      }),
    ),
    new Mesh(
      g,
      new MeshBasicMaterial({
        color: fg,
        transparent: true,
        opacity: Math.min(1, 0.045 * strength),
        side: DoubleSide,
        depthWrite: false,
      }),
    ),
  ];
}

export const PRACTICE_BOX = {
  min: new Vector3(-WALL_W / 2, 0, -0.8),
  max: new Vector3(WALL_W / 2, WALL_H, 2.3),
};

export const practiceQuat = (n: Vec3) => new Quaternion().setFromUnitVectors(ZAX, new Vector3(...n));

/** The holds of a wall: the built-in practice holds, or the tagged holds of a scanned wall. */
export const holdsOfWall = (wallId: string, tagged: Hold[]): Hold[] =>
  wallId === PRACTICE_WALL_ID ? PRACTICE_HOLDS : tagged.filter((h) => h.wallId === wallId);
