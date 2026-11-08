/** Core types shared by the UI, the data layer and the 3D viewer. */

export type Vec3 = [number, number, number];

/** What a hold is used for in a route. `off` is a crossed-out hold in an elimination. */
export type Role = 'start' | 'hand' | 'top' | 'foot' | 'off';

/** Route holds: hold id → role. Marker holds are never stored here; they follow their parent. */
export type HoldMap = Record<string, Role>;

export type RouteType = 'base' | 'elim' | 'new';

export interface GradeLevel {
  id: string;
  label: string;
  /** Colour swatch for colour-based systems. */
  color?: string;
  /** Not a difficulty (for example Unknown or Surprise): kept out of ordering. */
  special?: boolean;
}

export type GradingSystem = 'v' | 'font' | 'color' | 'tape' | 'number';

export interface Grading {
  system: GradingSystem;
  levels: GradeLevel[];
}

export interface GymSettings {
  gymName: string;
  grading: Grading;
  /** Base URL printed in QR codes. Empty means "this site's address". */
  qrLink: string;
}

export interface Wall {
  id: string;
  name: string;
  scanPath: string | null;
  ghostPath: string | null;
  upright: boolean;
  spin: number;
  tris: number | null;
  createdAt: string;
}

export type HoldKind = 'hold' | 'volume' | 'marker';

/** A hold cut out of a wall scan. Practice-wall holds use the same shape with `wall: 'practice'`. */
export interface Hold {
  id: string;
  wallId: string;
  kind: HoldKind;
  /** Centre of the cut-out sphere, metres. */
  c: Vec3;
  /** Cut-out radius, metres. */
  r: number;
  /** Outward normal of the wall at the hold. */
  n: Vec3;
  /** For a marker hold: the bigger hold or volume it is bolted on. */
  onId: string | null;
  /** Storage path of the hold's own small 3D file. */
  piecePath: string | null;
}

export interface Route {
  id: string;
  wallId: string;
  type: RouteType;
  /** For extras: the normal route they start from. */
  baseId: string | null;
  name: string;
  grade: string | null;
  color: string | null;
  section: string;
  description: string;
  rules: string[];
  holds: HoldMap;
  setter: string;
  archived: boolean;
  createdAt: string;
}

export interface Comment {
  id: string;
  routeId: string;
  nick: string;
  body: string;
  beta: boolean;
  photoPath: string | null;
  hidden: boolean;
  reported: boolean;
  createdAt: string;
}

export const PRACTICE_WALL_ID = 'practice';
