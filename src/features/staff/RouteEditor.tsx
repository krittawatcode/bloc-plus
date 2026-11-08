import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ConfirmButton, Loading } from '@/components/ui';
import { ui } from '@/components/uiStyles';
import d from '@/components/Dock.module.css';
import { useToast } from '@/components/toastContext';
import { friendly } from '@/data/backend';
import { useComments, useCoreData, useDeleteRoutes, useSaveRoutes } from '@/data/queries';
import { defaultGradeId, gradeLabel, PRESETS } from '@/domain/grading';
import {
  RULES,
  TAPE_COLORS,
  parentOf,
  startingHolds,
  tally,
  toggleHold,
  validateRoute,
} from '@/domain/routes';
import type { Role, Route, RouteType } from '@/domain/types';
import { plural, uid } from '@/lib/format';
import { holdsOfWall } from '@/viewer/practiceWall';
import { StageDock } from '@/viewer/stage';
import { useStageScene, useViewer, useViewerEvents } from '@/viewer/stageContext';
import { useStaffWall } from './staffWall';
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
  const nameRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<Route | null>(null);
  const [role, setRole] = useState<Exclude<Role, 'off'>>('start');

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
        setter: '',
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
      setter: '',
      archived: false,
      createdAt: '',
    });
  }, [
    draft,
    data.isLoading,
    data.settings,
    data.routes,
    params.routeId,
    params.baseId,
    params.type,
    staffWall,
  ]);

  const base = draft?.baseId ? data.routes.find((r) => r.id === draft.baseId) : undefined;

  useStageScene(
    draft ? { kind: 'wall', wallId: draft.wallId, markers: draft.holds } : null,
    `editor:${draft?.id}:${draft?.wallId}`,
    'Loading…',
  );
  // Update the rings without moving the camera.
  useEffect(() => {
    if (draft) viewer?.setMarkers(draft.holds);
  }, [viewer, draft]);

  useViewerEvents(
    {
      holdTap: (id) => {
        if (!draft) return;
        const target = parentOf(holdsOfWall(draft.wallId, data.holds), id);
        const next = toggleHold(draft, base, target, role);
        if (typeof next === 'string') toast(next);
        else setDraft({ ...draft, holds: next });
      },
    },
    { zoomFirst: true },
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
        navigate('/staff/routes', { state: { preview: route.id } });
      },
      onError: (e) => toast(friendly(e)),
    });
  };

  return (
    <>
      <StageDock>
        {draft.type !== 'elim' ? (
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
        ) : (
          <p className={d.msg}>Tap a {base?.name} hold to cross it out. Tap again to bring it back.</p>
        )}
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
      </StageDock>

      <Link to="/staff/routes" className={ui.back}>
        Back to routes
      </Link>
      <h3>{title}</h3>
      <p className={ui.muted}>
        {draft.type === 'elim'
          ? `Tap a ${base?.name} hold on the wall to cross it out. Tap it again to bring it back.`
          : 'Pick Start, Hand, Top or Feet on the wall view, then tap holds. Tap a hold again to remove it. Tapping a marker hold selects the big hold under it too.'}
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
          <div className={ui.field}>
            <span className={ui.label}>Rules</span>
            <div className={ui.chips}>
              {RULES.map((r) => (
                <button
                  key={r}
                  type="button"
                  className={ui.chip}
                  aria-pressed={draft.rules.includes(r)}
                  onClick={() =>
                    set({
                      rules: draft.rules.includes(r)
                        ? draft.rules.filter((x) => x !== r)
                        : [...draft.rules, r],
                    })
                  }
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
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
        <Link to="/staff/routes" className={ui.btn}>
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
                  navigate('/staff/routes');
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
