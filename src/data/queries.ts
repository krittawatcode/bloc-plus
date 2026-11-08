import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Comment, GymSettings, Hold, Route, Wall } from '@/domain/types';
import { device } from '@/lib/device';
import type { NewComment } from './backend';
import { useBackend } from './context';

export const keys = {
  settings: ['settings'] as const,
  walls: ['walls'] as const,
  holds: ['holds'] as const,
  routes: ['routes'] as const,
  comments: ['comments'] as const,
  sends: ['sendCounts'] as const,
};

/* ---------------- Reads ---------------- */

export function useSettings() {
  const b = useBackend();
  return useQuery({ queryKey: keys.settings, queryFn: () => b.getSettings() });
}
export function useWalls() {
  const b = useBackend();
  return useQuery({ queryKey: keys.walls, queryFn: () => b.listWalls() });
}
export function useHolds() {
  const b = useBackend();
  return useQuery({ queryKey: keys.holds, queryFn: () => b.listHolds() });
}
export function useRoutes() {
  const b = useBackend();
  return useQuery({ queryKey: keys.routes, queryFn: () => b.listRoutes() });
}
export function useComments() {
  const b = useBackend();
  return useQuery({ queryKey: keys.comments, queryFn: () => b.listComments(), refetchInterval: 60_000 });
}
export function useSendCounts() {
  const b = useBackend();
  return useQuery({ queryKey: keys.sends, queryFn: () => b.sendCounts(), refetchInterval: 60_000 });
}

/** Everything the climber and staff screens need before they can draw. */
export function useCoreData() {
  const settings = useSettings();
  const walls = useWalls();
  const holds = useHolds();
  const routes = useRoutes();
  const all = [settings, walls, holds, routes];
  return {
    settings: settings.data,
    walls: walls.data ?? [],
    holds: holds.data ?? [],
    routes: routes.data ?? [],
    isLoading: all.some((q) => q.isLoading),
    error: all.find((q) => q.error)?.error ?? null,
    refetch: () => all.forEach((q) => void q.refetch()),
  };
}

/* ---------------- Writes ---------------- */

export function useSaveSettings() {
  const b = useBackend();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (s: GymSettings) => b.saveSettings(s),
    onMutate: (s) => qc.setQueryData(keys.settings, s),
    onError: () => qc.invalidateQueries({ queryKey: keys.settings }),
  });
}

export function useSaveRoutes() {
  const b = useBackend();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (routes: Route[]) => b.saveRoutes(routes),
    onSuccess: (_d, routes) =>
      qc.setQueryData<Route[]>(keys.routes, (old = []) => {
        const next = [...old];
        for (const r of routes) {
          const i = next.findIndex((x) => x.id === r.id);
          if (i >= 0) next[i] = r;
          else next.push({ ...r, createdAt: new Date().toISOString() });
        }
        return next;
      }),
  });
}

export function useAddWall() {
  const b = useBackend();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: {
      wall: { id: string; name: string; tris: number };
      scan: ArrayBuffer;
      ghost: Float32Array;
    }) => b.addWall(v.wall, v.scan, v.ghost),
    onSuccess: (wall) => qc.setQueryData<Wall[]>(keys.walls, (old = []) => [...old, wall]),
  });
}

export function useReorientWall() {
  const b = useBackend();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { wall: Wall; o: { upright: boolean; spin: number }; ghost: Float32Array }) =>
      b.updateWallOrientation(v.wall, v.o, v.ghost),
    onSuccess: (wall) =>
      qc.setQueryData<Wall[]>(keys.walls, (old = []) => old.map((w) => (w.id === wall.id ? wall : w))),
  });
}

export function useRenameWall() {
  const b = useBackend();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { wall: Wall; name: string }) => b.renameWall(v.wall, v.name),
    onSuccess: (wall) =>
      qc.setQueryData<Wall[]>(keys.walls, (old = []) => old.map((w) => (w.id === wall.id ? wall : w))),
  });
}

/** Reset a wall with a new scan. Its routes get archived, so routes and walls are reloaded. */
export function useResetWall() {
  const b = useBackend();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: {
      old: Wall;
      next: { id: string; name: string; tris: number };
      scan: ArrayBuffer;
      ghost: Float32Array;
    }) => b.resetWall(v.old, v.next, v.scan, v.ghost),
    onSettled: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: keys.walls }),
        qc.invalidateQueries({ queryKey: keys.routes }),
      ]),
  });
}

export function useDeleteWall() {
  const b = useBackend();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { wall: Wall; holds: Hold[]; routes: Route[]; photoPaths: string[] }) =>
      b.deleteWall(v.wall, v.holds, v.routes, v.photoPaths),
    onSuccess: (_d, v) => {
      const gone = new Set(v.routes.map((r) => r.id));
      qc.setQueryData<Wall[]>(keys.walls, (old = []) => old.filter((w) => w.id !== v.wall.id));
      qc.setQueryData<Hold[]>(keys.holds, (old = []) => old.filter((h) => h.wallId !== v.wall.id));
      qc.setQueryData<Route[]>(keys.routes, (old = []) => old.filter((r) => r.wallId !== v.wall.id));
      qc.setQueryData<Comment[]>(keys.comments, (old = []) => old.filter((c) => !gone.has(c.routeId)));
      void qc.invalidateQueries({ queryKey: keys.sends });
    },
  });
}

/** Delete routes for good. `routes` should include a normal route's extras. */
export function useDeleteRoutes() {
  const b = useBackend();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { routes: Route[]; photoPaths: string[] }) => b.deleteRoutes(v.routes, v.photoPaths),
    onSuccess: (_d, v) => {
      const gone = new Set(v.routes.map((r) => r.id));
      qc.setQueryData<Route[]>(keys.routes, (old = []) =>
        old.filter((r) => !gone.has(r.id) && !(r.baseId && gone.has(r.baseId))),
      );
      qc.setQueryData<Comment[]>(keys.comments, (old = []) => old.filter((c) => !gone.has(c.routeId)));
      void qc.invalidateQueries({ queryKey: keys.sends });
    },
  });
}

export function useAddHold() {
  const b = useBackend();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { hold: Omit<Hold, 'piecePath'>; piece: ArrayBuffer }) => b.addHold(v.hold, v.piece),
    onSuccess: (hold) => qc.setQueryData<Hold[]>(keys.holds, (old = []) => [...old, hold]),
  });
}

export function useDeleteHold() {
  const b = useBackend();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (hold: Hold) => b.deleteHold(hold),
    onSuccess: (_d, hold) =>
      qc.setQueryData<Hold[]>(keys.holds, (old = []) =>
        old.filter((h) => h.id !== hold.id && h.onId !== hold.id),
      ),
  });
}

export function useAddComment() {
  const b = useBackend();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (c: NewComment) => b.addComment(c),
    onSuccess: (c) => qc.setQueryData<Comment[]>(keys.comments, (old = []) => [c, ...old]),
  });
}

function useCommentUpdate<V>(fn: (v: V) => Promise<void>, apply: (list: Comment[], v: V) => Comment[]) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (_d, v) => qc.setQueryData<Comment[]>(keys.comments, (old = []) => apply(old, v)),
  });
}

export function useReportComment() {
  const b = useBackend();
  return useCommentUpdate(
    (id: string) => b.reportComment(id),
    (list, id) => list.map((c) => (c.id === id ? { ...c, reported: true } : c)),
  );
}
export function useHideComment() {
  const b = useBackend();
  return useCommentUpdate(
    (v: { id: string; hidden: boolean }) => b.setCommentHidden(v.id, v.hidden),
    (list, v) =>
      list.map((c) =>
        c.id === v.id ? { ...c, hidden: v.hidden, reported: v.hidden ? false : c.reported } : c,
      ),
  );
}
export function useClearReport() {
  const b = useBackend();
  return useCommentUpdate(
    (id: string) => b.clearReport(id),
    (list, id) => list.map((c) => (c.id === id ? { ...c, reported: false } : c)),
  );
}
export function useDeleteComment() {
  const b = useBackend();
  return useCommentUpdate(
    (c: Comment) => b.deleteComment(c),
    (list, c) => list.filter((x) => x.id !== c.id),
  );
}

/** Tick or untick "I sent it" for this phone. */
export function useToggleSend() {
  const b = useBackend();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ routeId, sent }: { routeId: string; sent: boolean }) =>
      sent ? b.addSend(routeId, device.get().device) : b.removeSend(routeId, device.get().device),
    onSuccess: (_d, { routeId, sent }) => {
      const mine = { ...device.get().sent };
      if (sent) mine[routeId] = true;
      else delete mine[routeId];
      device.set({ sent: mine });
      qc.setQueryData<Record<string, number>>(keys.sends, (old = {}) => ({
        ...old,
        [routeId]: Math.max(0, (old[routeId] ?? 0) + (sent ? 1 : -1)),
      }));
    },
  });
}
