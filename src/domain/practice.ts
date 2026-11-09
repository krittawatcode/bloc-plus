import { PRACTICE_WALL_ID, type Route } from './types';

/** Normal routes that come with the practice wall. The same rows are inserted by the first migration. */
const r = (
  id: string,
  name: string,
  grade: string,
  color: string,
  section: string,
  holds: Route['holds'],
): Route => ({
  id,
  wallId: PRACTICE_WALL_ID,
  type: 'base',
  baseId: null,
  name,
  grade,
  color,
  section,
  description: '',
  rules: [],
  holds,
  hands: {},
  setter: '',
  archived: false,
  createdAt: '2026-11-08T00:00:00.000Z',
});

export const PRACTICE_ROUTES: Route[] = [
  r('practice-yellow', 'Yellow', 't1', '#F2C230', 'Slab · 10°', {
    p1: 'foot',
    p2: 'start',
    p3: 'hand',
    p4: 'hand',
    p5: 'hand',
    p6: 'hand',
    p7: 'hand',
    p8: 'top',
  }),
  r('practice-blue', 'Blue', 't3', '#2D6FD6', 'Vertical into a 42° roof', {
    p9: 'foot',
    p10: 'start',
    p11: 'hand',
    p12: 'hand',
    p13: 'hand',
    p14: 'hand',
    p15: 'top',
  }),
  r('practice-pink', 'Pink', 't5', '#E5559A', 'Overhang · 29°', {
    p16: 'foot',
    p17: 'start',
    p18: 'hand',
    p19: 'hand',
    p20: 'hand',
    p21: 'hand',
    p22: 'top',
    v2: 'hand',
  }),
];
