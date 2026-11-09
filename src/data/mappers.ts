import { defaultGrading } from '@/domain/grading';
import { DEFAULT_TAGS } from '@/domain/routes';
import type {
  Comment,
  Grading,
  GymSettings,
  Hold,
  HoldKind,
  HoldMap,
  Route,
  RouteType,
  Vec3,
  Wall,
} from '@/domain/types';
import type { Database, Json } from '@/lib/database.types';

type T = Database['public']['Tables'];

/** Database rows use snake_case and JSON columns; the app uses camelCase and typed values. */
export const wallFromRow = (r: T['walls']['Row']): Wall => ({
  id: r.id,
  name: r.name,
  scanPath: r.scan_path,
  ghostPath: r.ghost_path,
  upright: r.upright,
  spin: r.spin,
  tris: r.tris,
  createdAt: r.created_at,
  retiredAt: r.retired_at,
  replacedBy: r.replaced_by,
});

export const holdFromRow = (r: T['holds']['Row']): Hold => ({
  id: r.id,
  wallId: r.wall_id,
  kind: r.kind as HoldKind,
  c: r.c as Vec3,
  r: r.r,
  n: r.n as Vec3,
  onId: r.on_id,
  piecePath: r.piece_path,
});

export const holdToRow = (h: Hold & { piecePath: string }): T['holds']['Insert'] => ({
  id: h.id,
  wall_id: h.wallId,
  kind: h.kind,
  c: h.c.map((v) => +v.toFixed(4)),
  r: +h.r.toFixed(4),
  n: h.n.map((v) => +v.toFixed(4)),
  on_id: h.onId,
  piece_path: h.piecePath,
});

export const routeFromRow = (r: T['routes']['Row']): Route => ({
  id: r.id,
  wallId: r.wall_id,
  type: r.type as RouteType,
  baseId: r.base_id,
  name: r.name,
  grade: r.grade,
  color: r.color,
  section: r.section ?? '',
  description: r.description ?? '',
  rules: (r.rules as string[]) ?? [],
  holds: (r.holds as HoldMap) ?? {},
  hands: (r.start_hands as Route['hands'] | null) ?? {},
  setter: r.setter ?? '',
  archived: r.archived,
  createdAt: r.created_at,
});

export const routeToRow = (r: Route): T['routes']['Insert'] => ({
  id: r.id,
  wall_id: r.wallId,
  type: r.type,
  base_id: r.baseId,
  name: r.name,
  grade: r.grade,
  color: r.color,
  section: r.section || null,
  description: r.description || null,
  rules: r.rules,
  holds: r.holds,
  start_hands: r.hands,
  setter: r.setter || null,
  archived: r.archived,
});

export const commentFromRow = (r: T['comments']['Row']): Comment => ({
  id: r.id,
  routeId: r.route_id,
  nick: r.nick,
  body: r.body,
  beta: r.beta,
  photoPath: r.photo_path,
  hidden: r.hidden,
  reported: r.reported,
  createdAt: r.created_at,
});

export function settingsFromRow(r: T['settings']['Row'] | null): GymSettings {
  const g = r?.grading as Grading | null | undefined;
  return {
    gymName: r?.gym_name ?? 'My gym',
    grading: g && Array.isArray(g.levels) && g.levels.length ? g : defaultGrading(),
    qrLink: r?.qr_link ?? '',
    tags: Array.isArray(r?.tags) ? (r.tags as string[]) : [...DEFAULT_TAGS],
  };
}

export const settingsToRow = (s: GymSettings): T['settings']['Insert'] => ({
  id: 1,
  gym_name: s.gymName,
  grading: s.grading as unknown as Json,
  qr_link: s.qrLink,
  tags: s.tags,
  updated_at: new Date().toISOString(),
});
