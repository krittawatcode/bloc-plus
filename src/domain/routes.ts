import type { Hold, HoldMap, Role, Route, RouteType } from './types';

export const ROLE_NAME: Record<Role | 'tag' | 'marker', string> = {
  start: 'Start',
  hand: 'Hand',
  top: 'Top',
  foot: 'Feet only',
  off: 'Crossed out',
  tag: 'Tagged',
  marker: 'Marker hold',
};

export const TYPE_NAME: Record<RouteType, string> = {
  base: 'Normal route',
  elim: 'Elimination',
  new: 'New route',
};

/** Tags a new gym starts with. Staff add or remove tags in Gym settings (`GymSettings.tags`). */
export const DEFAULT_TAGS = [
  'Feet follow hands',
  'No dyno',
  'Volume is on',
  'Volume is off',
  'Sit start',
  'Match on top',
  'Marked feet only',
];

/** The competition-style tag: feet may only go on holds of the route. Always offered. */
export const STRICT_FEET = 'Marked feet only';

/** Clean up a tag a person typed: single spaces, at most 30 characters. */
export const cleanTag = (s: string) => s.replace(/\s+/g, ' ').trim().slice(0, 30);

/**
 * Tags to offer when setting a route: the gym's list, plus "Marked feet only", plus any tag the route
 * already has (so a tag removed from the gym list can still be taken off the route).
 */
export function tagOptions(gymTags: string[], routeTags: string[] = []): string[] {
  const out: string[] = [];
  for (const t of [...gymTags, STRICT_FEET, ...routeTags])
    if (!out.some((x) => x.toLowerCase() === t.toLowerCase())) out.push(t);
  return out;
}

/** What climbers may use for feet. Feet are free unless the route says otherwise. */
export function feetNote(route: Pick<Route, 'holds' | 'rules'>): string {
  if (route.rules.includes(STRICT_FEET)) return 'Feet: route holds only';
  if (Object.values(route.holds).includes('foot')) return 'Feet: any hold (marked Feet holds are feet only)';
  return 'Feet: any hold';
}

export const TAPE_COLORS: Record<string, string> = {
  yellow: '#F2C230',
  blue: '#2D6FD6',
  pink: '#E5559A',
  green: '#3BA55C',
  purple: '#7D4CC9',
  black: '#2A2A2A',
  orange: '#EE7A2B',
  white: '#EDEDE8',
  red: '#D93B3B',
};

/** A marker hold counts as the bigger hold it is bolted on. */
export function parentOf(holds: Hold[], id: string): string {
  const h = holds.find((x) => x.id === id);
  return h?.onId ?? id;
}

export function markersOf(holds: Hold[], id: string): string[] {
  return holds.filter((h) => h.onId === id).map((h) => h.id);
}

/** Add each hold's marker holds to the map with the same role. */
export function withMarkers(holds: Hold[], map: HoldMap): HoldMap {
  const out: HoldMap = { ...map };
  for (const [id, role] of Object.entries(map)) for (const m of markersOf(holds, id)) out[m] = role;
  return out;
}

/** Toggle a hold in a route that is being set. */
export function toggleHold(
  route: Pick<Route, 'type' | 'holds'>,
  base: Route | undefined,
  id: string,
  role: Role,
): HoldMap | string {
  const holds = { ...route.holds };
  if (route.type === 'elim') {
    if (!base || !(id in base.holds)) return `Only ${base?.name ?? 'base route'} holds can be crossed out.`;
    holds[id] = holds[id] === 'off' ? base.holds[id]! : 'off';
    return holds;
  }
  if (holds[id] === role) delete holds[id];
  else holds[id] = role;
  return holds;
}

export function tally(route: Pick<Route, 'type' | 'holds'>): string {
  const v = Object.values(route.holds);
  const n = (r: Role) => v.filter((x) => x === r).length;
  if (route.type === 'elim') return `${n('off')} crossed out · ${v.length - n('off')} still on`;
  const feet = n('foot') ? ` · ${n('foot')} feet only` : '';
  return `${v.length} holds · ${n('start')} start · ${n('top')} top${feet}`;
}

/** Returns a message explaining what is missing, or null if the route can be saved. */
export function validateRoute(route: Pick<Route, 'type' | 'holds' | 'name'>): string | null {
  if (!route.name.trim()) return 'Give the route a name first.';
  const v = Object.values(route.holds);
  if (route.type === 'elim' && !v.includes('off')) return 'Cross out at least one hold.';
  if (route.type !== 'elim' && (!v.includes('start') || !v.includes('top')))
    return 'Mark at least one start and one top hold.';
  return null;
}

/** The holds an extra starts with: everything for an elimination, only the start holds for a new route. */
export function startingHolds(base: Route, type: RouteType): HoldMap {
  if (type === 'elim') return { ...base.holds };
  return Object.fromEntries(Object.entries(base.holds).filter(([, r]) => r === 'start'));
}

export const startsOf = (routes: Route[]): HoldMap => {
  const m: HoldMap = {};
  for (const r of routes)
    for (const [id, role] of Object.entries(r.holds)) if (role === 'start') m[id] = 'start';
  return m;
};
