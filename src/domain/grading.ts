import type { GradeLevel, Grading, GradingSystem, Route } from './types';

const colourLevels = (): GradeLevel[] =>
  (
    [
      ['White', '#EDEDE8'],
      ['Yellow', '#F2C230'],
      ['Green', '#3BA55C'],
      ['Blue', '#2D6FD6'],
      ['Red', '#D93B3B'],
      ['Black', '#2A2A2A'],
    ] as const
  ).map(([label, color]) => ({ id: `c-${label.toLowerCase()}`, label, color }));

export interface GradingPreset {
  name: string;
  help: string;
  levels: () => GradeLevel[];
  /** Staff can rename, recolour, reorder, add and remove levels. */
  editable: boolean;
}

export const PRESETS: Record<GradingSystem, GradingPreset> = {
  v: {
    name: 'V-scale',
    help: 'V grades from V0 up.',
    editable: false,
    levels: () => Array.from({ length: 11 }, (_, i) => ({ id: `V${i}`, label: `V${i}` })),
  },
  font: {
    name: 'Font',
    help: 'Fontainebleau grades like 6A+ and 7B.',
    editable: false,
    levels: () =>
      [
        '4',
        '5',
        '5+',
        '6A',
        '6A+',
        '6B',
        '6B+',
        '6C',
        '6C+',
        '7A',
        '7A+',
        '7B',
        '7B+',
        '7C',
        '7C+',
        '8A',
      ].map((l) => ({ id: `f${l}`, label: l })),
  },
  color: {
    name: 'Hold color',
    help: 'Each hold color is a grade band. Put the easiest color first.',
    editable: true,
    levels: colourLevels,
  },
  tape: {
    name: 'Tape color',
    help: 'A tape color at the start shows the grade. Put the easiest color first.',
    editable: true,
    levels: colourLevels,
  },
  number: {
    name: 'Number tags',
    help: 'A numbered tag at the start shows the level, 0 is easiest. Unknown and Surprise are not ranked, so they stay put when you reorder or switch.',
    editable: true,
    levels: () => [
      ...Array.from({ length: 9 }, (_, i) => ({ id: `t${i}`, label: String(i) })),
      { id: 'tunknown', label: 'Unknown', special: true },
      { id: 'tsurprise', label: 'Surprise', special: true },
    ],
  },
};

export const defaultGrading = (): Grading => ({ system: 'number', levels: PRESETS.number.levels() });

export const levelOf = (grading: Grading, id: string | null | undefined): GradeLevel | undefined =>
  id ? grading.levels.find((l) => l.id === id) : undefined;

/** How a level is shown to people: number tags read "Tag 3", everything else as named. */
export function gradeLabel(grading: Grading, level: GradeLevel): string {
  return grading.system === 'number' && /^\d+$/.test(level.label) ? `Tag ${level.label}` : level.label;
}

/** The level new routes start on: about a third of the way up the ranked levels. */
export function defaultGradeId(grading: Grading): string | null {
  const ranked = grading.levels.filter((l) => !l.special);
  return (ranked[Math.floor(ranked.length / 3)] ?? grading.levels[0])?.id ?? null;
}

/**
 * When a gym switches grading system, keep each route's place on the scale.
 * Unranked levels map to the level with the same name, if there is one.
 * Returns only the routes whose grade changed.
 */
export function remapGrades(oldLevels: GradeLevel[], newLevels: GradeLevel[], routes: Route[]): Route[] {
  const oldRanked = oldLevels.filter((l) => !l.special);
  const newRanked = newLevels.filter((l) => !l.special);
  if (!newRanked.length) return [];
  const changed: Route[] = [];
  for (const route of routes) {
    const old = oldLevels.find((l) => l.id === route.grade);
    if (!old) continue;
    let next: string;
    if (old.special) {
      next = (newLevels.find((l) => l.label === old.label) ?? newRanked[Math.floor(newRanked.length / 3)]!)
        .id;
    } else {
      const i = oldRanked.indexOf(old);
      const j = oldRanked.length > 1 ? Math.round((i * (newRanked.length - 1)) / (oldRanked.length - 1)) : 0;
      next = newRanked[Math.min(j, newRanked.length - 1)]!.id;
    }
    if (next !== route.grade) changed.push({ ...route, grade: next });
  }
  return changed;
}

export function newLevel(grading: Grading): GradeLevel {
  const id = `g-${Math.random().toString(36).slice(2, 9)}`;
  if (grading.system === 'number') {
    return { id, label: String(grading.levels.filter((l) => !l.special).length) };
  }
  return { id, label: 'New level', color: '#888888' };
}

/** Insert a new level before the unranked ones. */
export function addLevel(grading: Grading): Grading {
  const levels = [...grading.levels];
  const firstSpecial = levels.findIndex((l) => l.special);
  levels.splice(firstSpecial < 0 ? levels.length : firstSpecial, 0, newLevel(grading));
  return { ...grading, levels };
}
