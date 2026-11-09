import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ConfirmButton, Loading } from '@/components/ui';
import { ui } from '@/components/uiStyles';
import d from '@/components/Dock.module.css';
import { useToast } from '@/components/toastContext';
import { friendly } from '@/data/backend';
import { useSession } from '@/data/context';
import { useComments, useCoreData, useDeleteRoutes, useSaveRoutes } from '@/data/queries';
import { defaultGradeId, gradeLabel, PRESETS } from '@/domain/grading';
import {
  HAND_NAME,
  TAPE_COLORS,
  parentOf,
  pickHold,
  startingHolds,
  tally,
  validateRoute,
} from '@/domain/routes';
import type { HoldKind, Role, Route, RouteType, StartHand } from '@/domain/types';
import { plural, uid } from '@/lib/format';
import { holdsOfWall } from '@/viewer/practiceWall';
import { StageDock, StageTools } from '@/viewer/stage';
import { useStageScene, useViewer, useViewerEvents } from '@/viewer/stageContext';
import { useStaffWall } from './staffWall';
import { TagPicker } from './TagPicker';
import { useHoldFinder } from './useHoldFinder';
import { useLoadedScan } from './useScan';
import s from './Staff.module.css';

const SHORT_ROLE: Record<Exclude<Role, 'off'>, string> = {
  start: 'Start',
  hand: 'Hand',
  top: 'Top',
  foot: 'Feet',
};
const ROLE_VAR: Record<Exclude<Role, 'off'>, string> = {
  start: '--start',
  hand: '--hand',
  top: '--top',
  foot: '--foot',
};

/** Set a normal route, an elimination or a new route by tapping holds on the wall. */
export function RouteEditor() {
  const params = useParams<{ routeId?: string; baseId?: string; type?: RouteType }>();
  const data = useCoreData();
  const { wallId: staffWall } = useStaffWall();
  const save = useSaveRoutes();
  const toast = useToast();
  const navigate = useNavigate();
  const viewer = useViewer();
  const { session } = useSession();
  const me = nameFromEmail(session?.email);
  const nameRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<Route | null>(null);
  const [role, setRole] = useState<Exclude<Role, 'off'>>('start');
  const [hand, setHand] = useState<StartHand | 'any'>('any');

  // Build the draft once the data is here.
  useEffect(() => {
    if (draft || data.isLoading || !data.settings) return;
    const grading = data.settings.grading;
    if (params.routeId) {
      const r = data.routes.find((x) => x.id === params.routeId);
      if (r) {
        setDraft(structuredClone(r));
        setRole('hand');
      }
      return;
    }
    if (params.baseId && params.type) {
      const base = data.routes.find((x) => x.id === params.baseId);
      if (!base) return;
      setDraft({
        id: uid('x'),
        wallId: base.wallId,
        type: params.type,
        baseId: base.id,
        name: '',
        grade: base.grade,
        color: null,
        section: '',
        description: '',
        rules: [],
        holds: startingHolds(base, params.type),
        // The start holds come from the normal route, with their hands.
        hands: { ...base.hands },
        setter: me,
        archived: false,
        createdAt: '',
      });
      setRole('hand');
      return;
    }
    setDraft({
      id: uid('b'),
      wallId: staffWall,
      type: 'base',
      baseId: null,
      name: '',
      grade: defaultGradeId(grading),
      color: TAPE_COLORS.green!,
      section: '',
      description: '',
      rules: [],
      holds: {},
      hands: {},
      setter: '',
      archived: false,
      createdAt: '',
    });
  }, [
    draft,
    me,
    data.isLoading,
    data.settings,
    data.routes,
    params.routeId,
    params.baseId,
    params.type,
    staffWall,
  ]);

  const base = draft?.baseId ? data.routes.find((r) => r.id === draft.baseId) : undefined;
  const wall = data.walls.find((w) => w.id === draft?.wallId);
  const wallHolds = draft ? holdsOfWall(draft.wallId, data.holds) : [];
  // On a scanned wall, staff tap the scan itself: holds are found and saved as the route is set.
  // Eliminations only cross out holds the normal route already has, so they keep the simple view.
  const onScan = !!wall?.scanPath && draft?.type !== 'elim';
  const scanQuery = useLoadedScan(onScan ? wall : undefined);
  const scan = scanQuery.data;
  const finder = useHoldFinder(wall, scan, viewer, wallHolds);

  useStageScene(
    !draft
      ? null
      : onScan
        ? scan
          ? { kind: 'scan', wallId: draft.wallId, scan, markers: draft.holds }
          : null
        : { kind: 'wall', wallId: draft.wallId, markers: draft.holds },
    `editor:${draft?.id}:${draft?.wallId}:${onScan}:${!!scan}`,
    scanQuery.error ? friendly(scanQuery.error) : onScan ? 'Downloading the wall…' : 'Loading…',
  );
  // Update the rings without moving the camera.
  useEffect(() => {
    if (draft) viewer?.setMarkers(draft.holds, draft.hands);
  }, [viewer, draft, data.holds]);

  const apply = (target: string) => {
    if (!draft) return;
    const next = pickHold(draft, base, target, role, hand);
    if (typeof next === 'string') toast(next);
    else setDraft({ ...draft, ...next });
  };
  // A marker hold stands for the big hold under it, so that one goes into the route.
  const pick = (id: string) => draft && apply(parentOf(holdsOfWall(draft.wallId, data.holds), id));
  useViewerEvents(
    {
      holdTap: pick,
      scanTap: (p, n) => {
        const id = finder.tap(p, n);
        if (id) pick(id);
      },
    },
    { zoomFirst: true },
  );
  const addFound = () =>
    finder.save().then(
      (h) => {
        if (!h || !draft) return;
        apply(h.onId ?? h.id);
      },
      (e: unknown) => toast(friendly(e)),
    );

  if (data.isLoading || !data.settings) return <Loading />;
  if (!draft)
    return (
      <>
        <p className={ui.empty}>This route no longer exists.</p>
        <Link to="/staff/routes" className={ui.back}>
          Back to routes
        </Link>
      </>
    );

  const grading = data.settings.grading;
  const isNew = !data.routes.some((r) => r.id === draft.id);
  const title =
    draft.type === 'base'
      ? isNew
        ? 'New normal route'
        : 'Edit normal route'
      : `${isNew ? 'New' : 'Edit'} ${draft.type === 'elim' ? 'elimination' : 'route'} from ${base?.name ?? 'base route'}`;
  const set = (patch: Partial<Route>) => setDraft({ ...draft, ...patch });
  // Back to the start this route belongs to (a brand-new normal route goes back to the list).
  const startId = draft.type === 'base' ? (isNew ? null : draft.id) : draft.baseId;
  const backTo = startId ? `/staff/routes/start/${startId}` : '/staff/routes';

  const submit = () => {
    const problem = validateRoute(draft);
    if (problem) return toast(problem);
    const route: Route = {
      ...draft,
      name: draft.name.trim(),
      description: draft.description.trim(),
      section: draft.section.trim(),
      setter: draft.type === 'base' ? '' : draft.setter.trim() || 'Staff',
    };
    save.mutate([route], {
      onSuccess: () => {
        toast(isNew ? 'Route saved. It is live for climbers.' : 'Route updated.');
        const id = route.type === 'base' ? route.id : (route.baseId ?? route.id);
        navigate(`/staff/routes/start/${id}`, route.type === 'base' ? {} : { state: { preview: route.id } });
      },
      onError: (e) => toast(friendly(e)),
    });
  };

  return (
    <>
      <StageTools>
        <button type="button" onClick={() => viewer?.resetView()}>
          Reset view
        </button>
      </StageTools>
      <StageDock>
        {finder.pending ? (
          <>
            <p className={d.msg}>{finder.message}</p>
            <div className={d.seg} role="group" aria-label="What was tapped">
              {(['hold', 'volume', 'marker'] as HoldKind[]).map((k) => (
                <button
                  key={k}
                  type="button"
                  aria-pressed={finder.pending?.kind === k}
                  onClick={() => finder.setKind(k)}
                  disabled={finder.saving}
                >
                  {k[0]!.toUpperCase() + k.slice(1)}
                </button>
              ))}
            </div>
            <div className={d.row}>
              <button
                type="button"
                className={d.btn}
                aria-label="Smaller"
                onClick={() => finder.resize(-1)}
                disabled={finder.saving}
              >
                −
              </button>
              <span className={d.size}>{Math.round(finder.pending.r * 100)} cm</span>
              <button
                type="button"
                className={d.btn}
                aria-label="Bigger"
                onClick={() => finder.resize(1)}
                disabled={finder.saving}
              >
                +
              </button>
              <span className={d.spacer} />
              <button type="button" className={d.btn} onClick={finder.cancel} disabled={finder.saving}>
                Cancel
              </button>
              <button
                type="button"
                className={d.primary}
                onClick={() => void addFound()}
                disabled={
                  !finder.cut || finder.saving || (finder.pending.kind === 'marker' && !finder.pending.onId)
                }
              >
                Add as {SHORT_ROLE[role]}
              </button>
            </div>
          </>
        ) : draft.type !== 'elim' ? (
          <>
            <div className={d.seg} role="group" aria-label="Role to place">
              {(Object.keys(SHORT_ROLE) as (keyof typeof SHORT_ROLE)[]).map((r) => (
                <button
                  key={r}
                  type="button"
                  aria-pressed={role === r}
                  onClick={() => setRole(r)}
                  data-role={r}
                >
                  <b className={d.roleDot} style={{ borderColor: `var(${ROLE_VAR[r]})` }} />
                  {SHORT_ROLE[r]}
                </button>
              ))}
            </div>
            {role === 'start' && (
              <div className={d.seg} role="group" aria-label="Which hand on the start hold">
                {(Object.keys(HAND_NAME) as (StartHand | 'any')[]).map((h) => (
                  <button key={h} type="button" aria-pressed={hand === h} onClick={() => setHand(h)}>
                    {h === 'any' ? 'Any hand' : HAND_NAME[h]}
                  </button>
                ))}
              </div>
            )}
          </>
        ) : (
          <p className={d.msg}>Tap a {base?.name} hold to cross it out. Tap again to bring it back.</p>
        )}
        {!finder.pending && (
          <div className={d.row}>
            <span className={d.tally} data-testid="tally">
              {tally(draft)}
            </span>
            <button
              type="button"
              className={d.primary}
              onClick={() => nameRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })}
            >
              Name &amp; grade
            </button>
          </div>
        )}
      </StageDock>

      <Link to={backTo} className={ui.back}>
        Back
      </Link>
      <h3>{title}</h3>
      <p className={ui.muted}>
        {draft.type === 'elim'
          ? `Tap a ${base?.name} hold on the wall to cross it out. Tap it again to bring it back.`
          : onScan
            ? 'Pick Start, Hand, Top or Feet, then tap a hold on the wall. For a start hold, also pick the hand: Left, Right, Both (both hands on one hold) or Any. The app finds its edge: check it and tap Add. Tap a hold in the route again to remove it. Feet are optional: climbers can use any foot hold unless you mark Feet holds or add the "Marked feet only" tag.'
            : 'Pick Start, Hand or Top on the wall view, then tap holds. Tap a hold again to remove it. Tapping a marker hold selects the big hold under it too. Feet are optional: climbers can use any foot hold unless you mark Feet holds or add the "Marked feet only" tag.'}
      </p>

      <div className={ui.field}>
        <label className={ui.label} htmlFor="ename">
          Name
        </label>
        <input
          ref={nameRef}
          id="ename"
          className={ui.input}
          maxLength={40}
          value={draft.name}
          onChange={(e) => set({ name: e.target.value })}
          placeholder={
            draft.type === 'base' ? 'Tape color, like Green' : 'Something fun, like No feet Friday'
          }
        />
      </div>
      <div className={ui.field}>
        <label className={ui.label} htmlFor="edesc">
          Description
        </label>
        <textarea
          id="edesc"
          className={ui.input}
          rows={3}
          maxLength={400}
          value={draft.description}
          onChange={(e) => set({ description: e.target.value })}
          placeholder={
            draft.type === 'base'
              ? 'Anything climbers should know about this route'
              : 'The idea behind it, the crux, or a challenge for the crew'
          }
        />
      </div>
      <div className={ui.field}>
        <span className={ui.label}>
          Grade <span className={`${ui.muted} ${ui.smallText}`}>({PRESETS[grading.system].name})</span>
        </span>
        <div className={ui.chips}>
          {grading.levels.map((l) => (
            <button
              key={l.id}
              type="button"
              className={ui.chip}
              aria-pressed={draft.grade === l.id}
              onClick={() => set({ grade: l.id })}
              data-grade={l.id}
            >
              {l.color && <span className={ui.swatch} style={{ background: l.color }} />}
              {gradeLabel(grading, l)}
            </button>
          ))}
        </div>
      </div>
      {draft.type === 'base' ? (
        <>
          <div className={ui.field}>
            <span className={ui.label}>Route color</span>
            <div className={ui.chips}>
              {Object.entries(TAPE_COLORS).map(([name, c]) => (
                <button
                  key={name}
                  type="button"
                  className={s.swatchButton}
                  style={{ background: c }}
                  aria-pressed={draft.color === c}
                  aria-label={name}
                  onClick={() => set({ color: c })}
                />
              ))}
            </div>
          </div>
          <div className={ui.field}>
            <label className={ui.label} htmlFor="esection">
              Wall section
            </label>
            <input
              id="esection"
              className={ui.input}
              maxLength={40}
              value={draft.section}
              onChange={(e) => set({ section: e.target.value })}
              placeholder="Like Overhang · 30°"
            />
          </div>
        </>
      ) : (
        <>
          <TagPicker value={draft.rules} onChange={(rules) => set({ rules })} />
          <div className={ui.field}>
            <label className={ui.label} htmlFor="esetter">
              Set by
            </label>
            <input
              id="esetter"
              className={ui.input}
              maxLength={24}
              value={draft.setter}
              onChange={(e) => set({ setter: e.target.value })}
              placeholder="Your name"
            />
          </div>
        </>
      )}
      <div className={ui.actions}>
        <button
          type="button"
          className={`${ui.btn} ${ui.primary}`}
          onClick={submit}
          disabled={save.isPending}
        >
          {save.isPending ? 'Saving…' : 'Save route'}
        </button>
        <Link to={backTo} className={ui.btn}>
          Cancel
        </Link>
      </div>
      {!isNew && <DeleteRoute route={draft} />}
    </>
  );
}

/** Delete a saved route for good. A normal route takes its extras with it. */
function DeleteRoute({ route }: { route: Route }) {
  const data = useCoreData();
  const comments = useComments().data ?? [];
  const del = useDeleteRoutes();
  const toast = useToast();
  const navigate = useNavigate();
  const extras = data.routes.filter((r) => r.baseId === route.id);
  const all = [route, ...extras];
  const ids = new Set(all.map((r) => r.id));
  const routeComments = comments.filter((c) => ids.has(c.routeId));
  const what = [
    ...(extras.length ? [`its ${plural(extras.length, 'extra')}`] : []),
    ...(routeComments.length ? [plural(routeComments.length, 'comment')] : []),
  ];
  return (
    <div className={ui.field}>
      <span className={ui.label}>Delete route</span>
      <p className={`${ui.muted} ${ui.smallText}`}>
        {route.type === 'base' ? 'Its QR code stops working. ' : ''}
        {what.length ? `Also deletes ${what.join(' and ')}. ` : ''}
        To take a route down for a while instead, archive it in Routes.
      </p>
      <div className={ui.actions}>
        <ConfirmButton
          className={`${ui.btn} ${ui.small} ${ui.danger}`}
          confirmText="Tap again to delete"
          disabled={del.isPending}
          onConfirm={() =>
            del.mutate(
              { routes: all, photoPaths: routeComments.flatMap((c) => (c.photoPath ? [c.photoPath] : [])) },
              {
                onSuccess: () => {
                  toast(`${route.name || 'Route'} deleted.`);
                  navigate(route.baseId ? `/staff/routes/start/${route.baseId}` : '/staff/routes');
                },
                onError: (e) => toast(friendly(e)),
              },
            )
          }
        >
          {del.isPending ? 'Deleting…' : 'Delete route'}
        </ConfirmButton>
      </div>
    </div>
  );
}

/** "bom@bloccity.co.th" → "Bom", used as the default "Set by" name. */
function nameFromEmail(email?: string): string {
  const local =
    email
      ?.split('@')[0]
      ?.replace(/[._-]+/g, ' ')
      .trim() ?? '';
  return local ? local[0]!.toUpperCase() + local.slice(1) : '';
}
