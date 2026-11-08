import { useState } from 'react';
import { useBackend, useSession } from '@/data/context';
import { useComments, useCoreData, useSendCounts } from '@/data/queries';
import { PRACTICE_WALL_ID, type Wall } from '@/domain/types';
import { device } from '@/lib/device';

/** Data every climber screen uses, plus helpers to look things up. */
export function useClimberData() {
  const core = useCoreData();
  const backend = useBackend();
  const comments = useComments();
  const counts = useSendCounts();
  const { session } = useSession();
  // The practice wall is for trying things out: climbers never see it, but signed-in staff
  // (and everyone in demo mode) do, so staff can check the climber view of a test route.
  const showPractice = backend.kind === 'demo' || !!session?.isStaff;
  const bases = (wallId?: string) =>
    core.routes.filter((r) => r.type === 'base' && (!wallId || r.wallId === wallId));
  const visibleWalls: Pick<Wall, 'id' | 'name'>[] = [
    ...core.walls,
    ...(showPractice
      ? [
          {
            id: PRACTICE_WALL_ID,
            name: backend.kind === 'demo' ? 'Practice wall' : 'Practice wall · staff only',
          },
        ]
      : []),
  ].filter((w) => bases(w.id).length);
  return {
    ...core,
    comments: comments.data ?? [],
    counts: counts.data ?? {},
    bases,
    visibleWalls,
    route: (id: string | undefined) => core.routes.find((r) => r.id === id),
    extrasOf: (id: string) => core.routes.filter((r) => r.baseId === id && !r.archived),
    commentsOf: (id: string) => (comments.data ?? []).filter((c) => c.routeId === id && !c.hidden),
    wallName: (id: string) =>
      id === PRACTICE_WALL_ID ? 'Practice wall' : (core.walls.find((w) => w.id === id)?.name ?? 'Wall'),
  };
}

export function useGhostPref() {
  const [ghost, setGhost] = useState(device.get().ghost);
  return [
    ghost,
    (on: boolean) => {
      device.set({ ghost: on });
      setGhost(on);
    },
  ] as const;
}
