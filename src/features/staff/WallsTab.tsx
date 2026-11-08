import { useState } from 'react';
import { ConfirmButton, Loading } from '@/components/ui';
import { ui } from '@/components/uiStyles';
import { useToast } from '@/components/toastContext';
import { friendly } from '@/data/backend';
import { useAddWall, useComments, useCoreData, useDeleteWall } from '@/data/queries';
import { PRACTICE_WALL_ID, type Wall } from '@/domain/types';
import { fmt, mb, plural, uid } from '@/lib/format';
import { ghostPoints, parseScan, ScanError } from '@/viewer/scan';
import { StageTools } from '@/viewer/stage';
import { useStageScene, useViewer } from '@/viewer/stageContext';
import { ScanTagger } from './ScanTagger';
import { useStaffWall } from './staffWall';
import { useRememberScan } from './useScan';
import s from './Staff.module.css';

const MAX_BYTES = 50 * 1048576;

export function WallsTab() {
  const d = useCoreData();
  const { wallId, setWallId } = useStaffWall();
  const wall = d.walls.find((w) => w.id === wallId);

  if (d.isLoading) return <Loading />;
  return (
    <>
      <div className={ui.field}>
        <span className={ui.label}>Walls</span>
        <ul className={ui.list}>
          {d.walls.map((w) => (
            <li key={w.id}>
              <button
                type="button"
                className={w.id === wallId ? ui.rowSelected : ui.row}
                onClick={() => setWallId(w.id)}
              >
                <span className={ui.grow}>
                  <strong>{w.name}</strong>
                  <br />
                  <span className={`${ui.muted} ${ui.smallText}`}>
                    {d.holds.filter((h) => h.wallId === w.id).length} holds tagged ·{' '}
                    {d.routes.filter((r) => r.wallId === w.id && r.type === 'base').length} routes
                  </span>
                </span>
              </button>
            </li>
          ))}
          <li>
            <button
              type="button"
              className={wallId === PRACTICE_WALL_ID ? ui.rowSelected : ui.row}
              onClick={() => setWallId(PRACTICE_WALL_ID)}
            >
              <span className={ui.grow}>
                <strong>Practice wall</strong>
                <br />
                <span className={`${ui.muted} ${ui.smallText}`}>
                  Built in. Try the flow here. Climbers don't see it.
                </span>
              </span>
            </button>
          </li>
        </ul>
      </div>
      <AddWall open={!d.walls.length} onAdded={(w) => setWallId(w.id)} />
      {wall ? <ScannedWall key={wall.id} wall={wall} /> : <PracticeWall />}
    </>
  );
}

function PracticeWall() {
  const viewer = useViewer();
  useStageScene({ kind: 'wall', wallId: PRACTICE_WALL_ID, markers: {} }, 'walls:practice');
  return (
    <>
      <StageTools>
        <button type="button" onClick={() => viewer?.resetView()}>
          Reset view
        </button>
      </StageTools>
      <p className={ui.muted}>
        The practice wall already has holds, including three big holds with small marker holds on them. Set
        practice routes in the Routes tab.
      </p>
    </>
  );
}

function ScannedWall({ wall }: { wall: Wall }) {
  const d = useCoreData();
  const comments = useComments().data ?? [];
  const del = useDeleteWall();
  const toast = useToast();
  const { setWallId } = useStaffWall();
  const holds = d.holds.filter((h) => h.wallId === wall.id);
  const routes = d.routes.filter((r) => r.wallId === wall.id);
  const routeIds = new Set(routes.map((r) => r.id));
  const wallComments = comments.filter((c) => routeIds.has(c.routeId));
  const parts = [
    'the scan',
    plural(holds.length, 'tagged hold'),
    plural(routes.length, 'route'),
    ...(wallComments.length ? [plural(wallComments.length, 'comment')] : []),
  ];
  const summary = `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
  return (
    <>
      <h3>{wall.name}</h3>
      <ScanTagger wall={wall} />
      <div className={ui.field}>
        <span className={ui.label}>Remove this wall</span>
        <p className={`${ui.muted} ${ui.smallText}`}>
          Removes {summary}. Climbers can no longer open its QR codes. This can't be undone.
        </p>
        <div className={ui.actions}>
          <ConfirmButton
            className={`${ui.btn} ${ui.small} ${ui.danger}`}
            confirmText="Tap again to remove everything"
            disabled={del.isPending}
            onConfirm={() =>
              del.mutate(
                {
                  wall,
                  holds,
                  routes,
                  photoPaths: wallComments.flatMap((c) => (c.photoPath ? [c.photoPath] : [])),
                },
                {
                  onSuccess: () => {
                    toast(`${wall.name} removed.`);
                    setWallId(PRACTICE_WALL_ID);
                  },
                  onError: (e) => toast(friendly(e)),
                },
              )
            }
          >
            {del.isPending ? 'Removing…' : 'Remove this wall'}
          </ConfirmButton>
        </div>
      </div>
    </>
  );
}

function AddWall({ open, onAdded }: { open: boolean; onAdded: (w: Wall) => void }) {
  const add = useAddWall();
  const remember = useRememberScan();
  const toast = useToast();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const onFile = async (file: File) => {
    if (file.size > MAX_BYTES)
      return toast(
        `That file is ${mb(file.size)}. The limit is 50 MB, so export a lighter version of the scan.`,
      );
    setBusy('Reading the scan…');
    try {
      const buf = await file.arrayBuffer();
      const scan = await parseScan(buf, { upright: false, spin: 0 });
      setBusy(`Uploading the scan (${mb(buf.byteLength)}, ${fmt(scan.tris)} triangles)…`);
      const id = uid('w');
      const wallName = name.trim() || file.name.replace(/\.[^.]+$/, '').slice(0, 40) || 'New wall';
      const wall = await add.mutateAsync({
        wall: { id, name: wallName, tris: scan.tris },
        scan: buf,
        ghost: ghostPoints(scan),
      });
      remember(wall, scan);
      setName('');
      onAdded(wall);
      toast('Wall added. Turn it to face you if needed, then tap holds to tag them.');
    } catch (e) {
      toast(e instanceof ScanError ? e.message : friendly(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <details className={s.box} open={open}>
      <summary>Add a wall</summary>
      <div className={ui.field}>
        <label className={ui.label} htmlFor="wname">
          Wall name
        </label>
        <input
          id="wname"
          className={ui.input}
          maxLength={40}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Like Cave or Slab corner"
        />
      </div>
      {busy ? (
        <Loading text={busy} />
      ) : (
        <label className={s.drop}>
          <input
            type="file"
            id="wallFile"
            accept=".glb,model/gltf-binary"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) void onFile(f);
            }}
          />
          <strong>Choose the scan (.glb)</strong>
          <span className={`${ui.muted} ${ui.smallText}`}>
            Export from Polycam or KIRI Engine as GLB, without Draco compression. Up to 50 MB.
          </span>
        </label>
      )}
      <p className={`${ui.muted} ${ui.smallText}`}>
        Scan tips: bright even light, slow overlapping photos, extra angles under overhangs, one wall section
        at a time.
      </p>
    </details>
  );
}
