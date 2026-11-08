import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Wall } from '@/domain/types';
import { useBackend } from '@/data/context';
import { parseScan, type LoadedScan } from '@/viewer/scan';

/** The full scan of a wall, for tagging. Only staff ever download it. Kept in memory for this visit. */
export const scanKey = (w: Pick<Wall, 'id' | 'scanPath' | 'upright' | 'spin'>) =>
  ['scan', w.id, w.scanPath, w.upright, w.spin] as const;

export function useLoadedScan(wall: Wall | undefined) {
  const backend = useBackend();
  return useQuery({
    queryKey: wall ? scanKey(wall) : ['scan', 'none'],
    enabled: !!wall?.scanPath,
    staleTime: Infinity,
    gcTime: 30 * 60_000,
    retry: false,
    queryFn: async (): Promise<LoadedScan> =>
      parseScan(await backend.fetchScanFile(wall!.scanPath!), { upright: wall!.upright, spin: wall!.spin }),
  });
}

export function useRememberScan() {
  const qc = useQueryClient();
  return (wall: Wall, scan: LoadedScan) => qc.setQueryData(scanKey(wall), scan);
}
