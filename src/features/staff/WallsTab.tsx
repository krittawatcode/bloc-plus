import { useState } from 'react';
import { ConfirmButton, Loading } from '@/components/ui';
import { ui } from '@/components/uiStyles';
import { useToast } from '@/components/toastContext';
import { friendly } from '@/data/backend';
import {
  useAddWall,
  useComments,
  useCoreData,
  useDeleteWall,
  useRenameWall,
  useResetWall,
  useSendCounts,
} from '@/data/queries';
import { ExtraRowBody } from '@/features/climber/shared';
import { isCurrentWall, PRACTICE_WALL_ID, type Route, type Wall } from '@/domain/types';
import { fmt, mb, plural, uid } from '@/lib/format';
import { ghostPoints, ScanError } from '@/viewer/scan';
import { StageTools } from '@/viewer/stage';
import { useStageScene, useViewer } from '@/viewer/stageContext';
import { RebuildOutline, WallSetup } from './WallSetup';
import { useStaffWall } from './staffWall';
import { readScanFile } from './scanFile';
import { useRememberScan } from './useScan';
import s from './Staff.module.css';

export function WallsTab() {
  const d = useCoreData();
  const { wallId, setWallId } = useStaffWall();
  const wall = d.walls.find((w) => w.id === wallId);
  const current = d.walls.filter(isCurrentWall);
  const past = d.walls
    .filter((w) => !isCurrentWall(w))
    .sort((a, b) => (b.retiredAt ?? '').localeCompare(a.retiredAt ?? ''));

  if (d.isLoading) return <Loading />;
  return (
    <>
      <div className={ui.field}>
        <span className={ui.label}>Walls</span>
        <ul className={ui.list}>
          {current.map((w) => (
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
                    {plural(
                      d.routes.filter((r) => r.wallId === w.id && r.type === 'base' && !r.archived).length,
                      'route',
                    )}
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
                <strong>Demo wall</strong>
                <br />
                <span className={`${ui.muted} ${ui.smallText}`}>
                  Built in. Try the flow here. Climbers don't see it.
                </span>
              </span>
            </button>
          </li>
        </ul>
      </div>
      <AddWall open={!current.length} onAdded={(w) => setWallId(w.id)} />
      {past.length > 0 && <PastWalls walls={past} />}
      {!wall ? (
        <PracticeWall />
      ) : isCurrentWall(wall) ? (
        <ScannedWall key={wall.id} wall={wall} />
      ) : (
        <PastWall key={wall.id} wall={wall} />
      )}
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
      <p className={ui.muted}>Built-in wall to practise on. Set practice routes in the Routes tab.</p>
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
    plural(routes.length, 'route'),
    ...(wallComments.length ? [plural(wallComments.length, 'comment')] : []),
  ];
  const summary = `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
  return (
    <>
      <h3>{wall.name}</h3>
      <WallSetup wall={wall} locked={holds.length > 0} />
      <p className={ui.note}>
        {routes.length
          ? 'Set routes in the Routes tab.'
          : 'Next: set routes in the Routes tab. You pick the holds on the wall while setting each route.'}
      </p>
      <details className={s.box}>
        <summary>More</summary>
        <RenameWall wall={wall} />
        <ResetWall wall={wall} routes={routes.filter((r) => !r.archived)} />
        <RebuildOutline wall={wall} />
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
      </details>
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
    setBusy('Reading the scan…');
    try {
      const { buf, scan } = await readScanFile(file);
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
      toast('Wall added. Turn it to face you if needed, then set routes.');
    } catch (e) {
      toast(e instanceof ScanError ? e.message : friendly(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <details className={s.box} open={open}>
      <summary>+ Add a wall</summary>
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
      <ScanDrop busy={busy} onFile={(f) => void onFile(f)} />
      <p className={`${ui.muted} ${ui.smallText}`}>
        Tips: bright even light, slow overlapping photos, extra angles under overhangs.
      </p>
    </details>
  );
}

/** File picker for a .glb scan, or progress while one is being read and uploaded. */
function ScanDrop({ busy, onFile }: { busy: string | null; onFile: (f: File) => void }) {
  if (busy) return <Loading text={busy} />;
  return (
    <label className={s.drop}>
      <input
        type="file"
        accept=".glb,model/gltf-binary"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) onFile(f);
        }}
      />
      <strong>Choose the scan (.glb)</strong>
      <span className={`${ui.muted} ${ui.smallText}`}>
        Polycam: export as GLTF (it saves a .glb). KIRI Engine: export as GLB. No Draco compression. Up to 50
        MB.
      </span>
    </label>
  );
}

function RenameWall({ wall }: { wall: Wall }) {
  const rename = useRenameWall();
  const toast = useToast();
  const [name, setName] = useState(wall.name);
  const next = name.trim();
  const changed = !!next && next !== wall.name;
  return (
    <div className={ui.field}>
      <label className={ui.label} htmlFor="wallName">
        Wall name
      </label>
      <div className={s.inlineField}>
        <input
          id="wallName"
          className={ui.input}
          maxLength={40}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button
          type="button"
          className={`${ui.btn} ${ui.small}`}
          disabled={!changed || rename.isPending}
          onClick={() =>
            rename.mutate(
              { wall, name: next },
              { onSuccess: () => toast('Wall renamed.'), onError: (e) => toast(friendly(e)) },
            )
          }
        >
          Save
        </button>
      </div>
    </div>
  );
}

/**
 * Reset: the setters stripped the wall and set new routes, so staff upload a new scan.
 * The old wall, its routes, sends and comments are kept as a past wall for stats.
 */
function ResetWall({ wall, routes }: { wall: Wall; routes: Route[] }) {
  const reset = useResetWall();
  const remember = useRememberScan();
  const toast = useToast();
  const { setWallId } = useStaffWall();
  const [busy, setBusy] = useState<string | null>(null);
  const starts = routes.filter((r) => r.type === 'base').length;
  const extras = routes.length - starts;

  const onFile = async (file: File) => {
    setBusy('Reading the new scan…');
    try {
      const { buf, scan } = await readScanFile(file);
      setBusy(`Uploading the new scan (${mb(buf.byteLength)})…`);
      const next = await reset.mutateAsync({
        old: wall,
        next: { id: uid('w'), name: wall.name, tris: scan.tris },
        scan: buf,
        ghost: ghostPoints(scan),
      });
      remember(next, scan);
      setWallId(next.id);
      toast(`${wall.name} reset. Set the new routes and print their QR codes.`);
    } catch (e) {
      toast(e instanceof ScanError ? e.message : friendly(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className={ui.field}>
      <span className={ui.label}>Reset this wall</span>
      <p className={`${ui.muted} ${ui.smallText}`}>
        After the setters strip the wall and set new routes, upload a new scan here.{' '}
        {routes.length
          ? `The ${plural(starts, 'route')} and ${plural(extras, 'extra')} on it now are archived with their sends and comments.`
          : 'There are no routes on it now.'}{' '}
        Climbers stop seeing them and old QR codes say the wall was reset. You can still see everything under
        Past walls.
      </p>
      <ScanDrop busy={busy} onFile={(f) => void onFile(f)} />
    </div>
  );
}

const day = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '';

/** Totals for a wall's routes: starts, extras, sends and comments. */
function useWallStats(wallId: string) {
  const d = useCoreData();
  const counts = useSendCounts().data ?? {};
  const comments = useComments().data ?? [];
  const routes = d.routes.filter((r) => r.wallId === wallId);
  const ids = new Set(routes.map((r) => r.id));
  return {
    routes,
    counts,
    comments,
    starts: routes.filter((r) => r.type === 'base').length,
    extras: routes.filter((r) => r.type !== 'base').length,
    sends: routes.reduce((n, r) => n + (counts[r.id] ?? 0), 0),
    commentCount: comments.filter((c) => ids.has(c.routeId)).length,
  };
}

function PastWalls({ walls }: { walls: Wall[] }) {
  const { wallId, setWallId } = useStaffWall();
  return (
    <details className={s.box} open={walls.some((w) => w.id === wallId)}>
      <summary>Past walls ({walls.length})</summary>
      <p className={`${ui.muted} ${ui.smallText}`}>
        Walls that were reset. Their routes, sends and comments are kept so you can look back at them.
      </p>
      <ul className={ui.list}>
        {walls.map((w) => (
          <li key={w.id}>
            <PastWallRow wall={w} selected={w.id === wallId} onPick={() => setWallId(w.id)} />
          </li>
        ))}
      </ul>
    </details>
  );
}

function PastWallRow({ wall, selected, onPick }: { wall: Wall; selected: boolean; onPick: () => void }) {
  const st = useWallStats(wall.id);
  return (
    <button type="button" className={selected ? ui.rowSelected : ui.row} onClick={onPick}>
      <span className={ui.grow}>
        <strong>{wall.name}</strong>
        <br />
        <span className={`${ui.muted} ${ui.smallText}`}>
          {day(wall.createdAt)} – {day(wall.retiredAt)}
        </span>
      </span>
      <span className={ui.stats}>
        <span>{plural(st.starts + st.extras, 'route')}</span>
        <span>{st.sends} sent</span>
      </span>
    </button>
  );
}

/** A reset wall: read-only stats of every route that was on it. Tap a route to see it on the old scan. */
function PastWall({ wall }: { wall: Wall }) {
  const d = useCoreData();
  const viewer = useViewer();
  const del = useDeleteWall();
  const toast = useToast();
  const { setWallId } = useStaffWall();
  const st = useWallStats(wall.id);
  const [shownId, setShownId] = useState<string | null>(null);
  const shown = st.routes.find((r) => r.id === shownId);
  const holds = d.holds.filter((h) => h.wallId === wall.id);
  const commentsOf = (id: string) => st.comments.filter((c) => c.routeId === id).length;
  const ranked = [...st.routes].sort((a, b) => (st.counts[b.id] ?? 0) - (st.counts[a.id] ?? 0));
  const base = (r: Route) => (r.baseId ? d.routes.find((x) => x.id === r.baseId) : undefined);

  useStageScene(
    shown
      ? { kind: 'route', wallId: wall.id, holds: shown.holds }
      : { kind: 'wall', wallId: wall.id, markers: {} },
    `past:${wall.id}:${shown?.id}:${holds.length}`,
  );

  return (
    <>
      <StageTools>
        <button type="button" onClick={() => viewer?.resetView()}>
          Reset view
        </button>
      </StageTools>
      <div className={ui.head}>
        <p className={ui.eyebrow}>
          Past wall · {day(wall.createdAt)} – {day(wall.retiredAt)}
        </p>
        <h3>{wall.name}</h3>
        <p className={ui.muted}>
          {plural(st.starts, 'route')} · {plural(st.extras, 'extra')} · {st.sends} sent ·{' '}
          {plural(st.commentCount, 'comment')}
        </p>
      </div>
      {wall.replacedBy && d.walls.some((w) => w.id === wall.replacedBy) && (
        <button type="button" className={ui.link} onClick={() => setWallId(wall.replacedBy!)}>
          Go to the current {wall.name}
        </button>
      )}
      <h3>Routes, most sent first</h3>
      {ranked.length ? (
        <ul className={ui.list}>
          {ranked.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                className={shownId === r.id ? ui.rowSelected : ui.row}
                aria-pressed={shownId === r.id}
                onClick={() => setShownId((cur) => (cur === r.id ? null : r.id))}
              >
                <ExtraRowBody
                  route={{ ...r, archived: false, name: base(r) ? `${base(r)!.name} › ${r.name}` : r.name }}
                  grading={d.settings?.grading}
                  sends={st.counts[r.id] ?? 0}
                  comments={commentsOf(r.id)}
                />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className={ui.empty}>No routes were set on this wall.</p>
      )}
      <div className={ui.field}>
        <span className={ui.label}>Remove for good</span>
        <p className={`${ui.muted} ${ui.smallText}`}>
          Deletes the old scan, its routes, sends and comments. The stats are gone after this.
        </p>
        <div className={ui.actions}>
          <ConfirmButton
            className={`${ui.btn} ${ui.small} ${ui.danger}`}
            confirmText="Tap again to delete everything"
            disabled={del.isPending}
            onConfirm={() =>
              del.mutate(
                {
                  wall,
                  holds,
                  routes: st.routes,
                  photoPaths: st.comments
                    .filter((c) => st.routes.some((r) => r.id === c.routeId))
                    .flatMap((c) => (c.photoPath ? [c.photoPath] : [])),
                },
                {
                  onSuccess: () => {
                    toast(`Past ${wall.name} deleted.`);
                    setWallId(wall.replacedBy ?? PRACTICE_WALL_ID);
                  },
                  onError: (e) => toast(friendly(e)),
                },
              )
            }
          >
            {del.isPending ? 'Deleting…' : 'Delete this past wall'}
          </ConfirmButton>
        </div>
      </div>
    </>
  );
}
