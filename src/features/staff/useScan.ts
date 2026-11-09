import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Wall } from '@/domain/types';
import { useBackend } from '@/data/context';
import { parseScan, scanKey, type LoadedScan } from '@/viewer/scan';

/** The full scan of a wall: for tagging, and behind routes. Kept in memory for this visit. */
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
