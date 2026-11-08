import { mb } from '@/lib/format';
import { parseScan, ScanError, type LoadedScan } from '@/viewer/scan';

export const MAX_SCAN_BYTES = 50 * 1048576;

/** Read a .glb wall scan picked by staff. Throws `ScanError` with a message people can act on. */
export async function readScanFile(file: File): Promise<{ buf: ArrayBuffer; scan: LoadedScan }> {
  if (file.size > MAX_SCAN_BYTES)
    throw new ScanError(
      `That file is ${mb(file.size)}. The limit is 50 MB, so export a lighter version of the scan.`,
    );
  const buf = await file.arrayBuffer();
  return { buf, scan: await parseScan(buf, { upright: false, spin: 0 }) };
}
