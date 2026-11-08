import { describe, expect, it } from 'vitest';
import { PRESETS, addLevel, defaultGradeId, defaultGrading, gradeLabel, remapGrades } from './grading';
import type { Route } from './types';

const route = (id: string, grade: string): Route => ({
  id,
  wallId: 'w',
  type: 'base',
  baseId: null,
  name: id,
  grade,
  color: null,
  section: '',
  description: '',
  rules: [],
  holds: {},
  setter: '',
  archived: false,
  createdAt: '2026-11-08T00:00:00Z',
});

describe('grading', () => {
  it('defaults to number tags 0–8 plus Unknown and Surprise', () => {
    const g = defaultGrading();
    expect(g.levels.map((l) => l.label)).toEqual([
      '0',
      '1',
      '2',
      '3',
      '4',
      '5',
      '6',
      '7',
      '8',
      'Unknown',
      'Surprise',
    ]);
    expect(g.levels.filter((l) => l.special).map((l) => l.id)).toEqual(['tunknown', 'tsurprise']);
  });

  it('labels number tags as "Tag n" and leaves other names alone', () => {
    const g = defaultGrading();
    expect(gradeLabel(g, g.levels[3]!)).toBe('Tag 3');
    expect(gradeLabel(g, g.levels[9]!)).toBe('Unknown');
    const v = { system: 'v' as const, levels: PRESETS.v.levels() };
    expect(gradeLabel(v, v.levels[4]!)).toBe('V4');
  });

  it('starts new routes about a third of the way up the ranked levels', () => {
    expect(defaultGradeId(defaultGrading())).toBe('t3');
  });

  it('keeps each route in its place on the scale when switching systems', () => {
    const tags = PRESETS.number.levels();
    const v = PRESETS.v.levels();
    const changed = remapGrades(tags, v, [route('easy', 't0'), route('hard', 't8'), route('mid', 't4')]);
    expect(Object.fromEntries(changed.map((r) => [r.id, r.grade]))).toEqual({
      easy: 'V0',
      hard: 'V10',
      mid: 'V5',
    });
  });

  it('keeps unranked levels by name, or puts them low if the new system has no such level', () => {
    const tags = PRESETS.number.levels();
    const [r] = remapGrades(tags, PRESETS.v.levels(), [route('s', 'tsurprise')]);
    expect(r!.grade).toBe('V3');
    expect(remapGrades(tags, PRESETS.number.levels(), [route('s', 'tsurprise')])).toEqual([]);
  });

  it('adds new number levels before Unknown and Surprise', () => {
    const g = addLevel(defaultGrading());
    expect(g.levels.map((l) => l.label).slice(-3)).toEqual(['9', 'Unknown', 'Surprise']);
  });
});
