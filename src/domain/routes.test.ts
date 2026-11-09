import { describe, expect, it } from 'vitest';
import {
  cleanTag,
  pickHold,
  startNote,
  feetNote,
  parentOf,
  startingHolds,
  STRICT_FEET,
  tagOptions,
  tally,
  toggleHold,
  validateRoute,
  withMarkers,
} from './routes';
import type { Hold, Route } from './types';

const hold = (id: string, onId: string | null = null): Hold => ({
  id,
  wallId: 'w',
  kind: onId ? 'marker' : 'hold',
  c: [0, 0, 0],
  r: 0.1,
  n: [0, 0, 1],
  onId,
  piecePath: null,
});
const holds = [hold('jug'), hold('jugMarker', 'jug'), hold('a'), hold('b')];
const base: Route = {
  id: 'yellow',
  wallId: 'w',
  type: 'base',
  baseId: null,
  name: 'Yellow',
  grade: 't1',
  color: '#ff0',
  section: '',
  description: '',
  rules: [],
  hands: {},
  holds: { a: 'start', jug: 'hand', b: 'top' },
  setter: '',
  archived: false,
  createdAt: '',
};

describe('marker holds', () => {
  it('treat a tap on a marker as a tap on the hold it sits on', () => {
    expect(parentOf(holds, 'jugMarker')).toBe('jug');
    expect(parentOf(holds, 'a')).toBe('a');
  });

  it('follow their parent hold in a route', () => {
    expect(withMarkers(holds, { jug: 'off' })).toEqual({ jug: 'off', jugMarker: 'off' });
  });
});

describe('setting routes', () => {
  it('starts an elimination with all base holds and a new route with only the start', () => {
    expect(startingHolds(base, 'elim')).toEqual(base.holds);
    expect(startingHolds(base, 'new')).toEqual({ a: 'start' });
  });

  it('crosses a base hold out and back in for eliminations', () => {
    const elim = { type: 'elim' as const, holds: { ...base.holds } };
    const once = toggleHold(elim, base, 'jug', 'hand');
    expect(once).toEqual({ a: 'start', jug: 'off', b: 'top' });
    const twice = toggleHold({ ...elim, holds: once as Route['holds'] }, base, 'jug', 'hand');
    expect(twice).toEqual(base.holds);
  });

  it('refuses to cross out a hold that is not on the base route', () => {
    expect(toggleHold({ type: 'elim', holds: {} }, base, 'zzz', 'hand')).toMatch(/Only Yellow holds/);
  });

  it('adds, changes and removes holds on new routes', () => {
    const r = { type: 'new' as const, holds: {} };
    const a = toggleHold(r, base, 'x', 'hand') as Route['holds'];
    expect(a).toEqual({ x: 'hand' });
    expect(toggleHold({ ...r, holds: a }, base, 'x', 'top')).toEqual({ x: 'top' });
    expect(toggleHold({ ...r, holds: a }, base, 'x', 'hand')).toEqual({});
  });

  it('explains what is missing before saving', () => {
    expect(validateRoute({ type: 'new', name: '', holds: {} })).toMatch(/name/);
    expect(validateRoute({ type: 'new', name: 'X', holds: { a: 'start' } })).toMatch(/start and one top/);
    expect(validateRoute({ type: 'elim', name: 'X', holds: { a: 'start' } })).toMatch(/Cross out/);
    expect(validateRoute({ type: 'elim', name: 'X', holds: { a: 'off' } })).toBeNull();
  });

  it('summarises a route', () => {
    expect(tally(base)).toBe('3 holds · 1 start · 1 top');
    expect(tally({ type: 'new', holds: { a: 'start', b: 'top', c: 'foot' } })).toBe(
      '3 holds · 1 start · 1 top · 1 feet only',
    );
    expect(tally({ type: 'elim', holds: { a: 'start', jug: 'off' } })).toBe('1 crossed out · 1 still on');
  });
});

describe('feetNote', () => {
  it('leaves feet free unless the route is strict', () => {
    expect(feetNote({ holds: { a: 'start' }, rules: [] })).toBe('Feet: any hold');
    expect(feetNote({ holds: { a: 'foot' }, rules: [] })).toMatch(/^Feet: any hold/);
    expect(feetNote({ holds: {}, rules: [STRICT_FEET] })).toBe('Feet: route holds only');
  });
});

describe('tags', () => {
  it('cleans typed tags', () => {
    expect(cleanTag('  Sit   start ')).toBe('Sit start');
    expect(cleanTag('x'.repeat(40))).toHaveLength(30);
  });
  it('offers gym tags, Marked feet only, and tags already on the route, once each', () => {
    expect(tagOptions(['No dyno', 'Crimpy'], ['crimpy', 'Old tag'])).toEqual([
      'No dyno',
      'Crimpy',
      STRICT_FEET,
      'Old tag',
    ]);
  });
});

describe('start hands', () => {
  const r = { type: 'base' as const, holds: {}, hands: {} };
  it('puts a start hold in with its hand, and changes the hand on a second tap', () => {
    const a = pickHold(r, undefined, 's1', 'start', 'left');
    expect(a).toEqual({ holds: { s1: 'start' }, hands: { s1: 'left' } });
    const b = pickHold({ ...r, ...(a as object) }, undefined, 's1', 'start', 'both');
    expect(b).toEqual({ holds: { s1: 'start' }, hands: { s1: 'both' } });
    // Same hand again: the hold comes out, and so does its hand.
    const c = pickHold({ ...r, ...(b as object) }, undefined, 's1', 'start', 'both');
    expect(c).toEqual({ holds: {}, hands: {} });
  });
  it('drops the hand when a start hold becomes another role', () => {
    const a = pickHold(
      { ...r, holds: { s1: 'start' }, hands: { s1: 'right' } },
      undefined,
      's1',
      'hand',
      'any',
    );
    expect(a).toEqual({ holds: { s1: 'hand' }, hands: {} });
  });
  it('tells climbers how to start', () => {
    expect(startNote({ holds: { a: 'start' }, hands: {} })).toBeNull();
    expect(startNote({ holds: { a: 'start' }, hands: { a: 'both' } })).toMatch(/both hands/);
    expect(startNote({ holds: { a: 'start', b: 'start' }, hands: { a: 'left', b: 'right' } })).toMatch(
      /left hand on START L, right hand on START R/,
    );
  });
});
