import { useEffect, useRef, useState } from 'react';
import { ConfirmButton, GradeBadge, Loading } from '@/components/ui';
import { ui } from '@/components/uiStyles';
import { useToast } from '@/components/toastContext';
import { friendly } from '@/data/backend';
import { useBackend } from '@/data/context';
import { DemoBackend } from '@/data/demoBackend';
import { useCoreData, useSaveRoutes, useSaveSettings } from '@/data/queries';
import { PRESETS, addLevel, remapGrades } from '@/domain/grading';
import type { GradeLevel, GradingSystem, GymSettings } from '@/domain/types';
import { useStageCollapsed, useStageScene } from '@/viewer/stageContext';
import s from './Staff.module.css';

/** Gym name and grading system. Changes save automatically. */
export function GymTab() {
  const d = useCoreData();
  const saveSettings = useSaveSettings();
  const saveRoutes = useSaveRoutes();
  const toast = useToast();
  const [draft, setDraft] = useState<GymSettings | null>(null);
  const timer = useRef<number>(0);
  // The latest unsaved change, so it can be saved right away when the page is left.
  const pending = useRef<(() => void) | null>(null);
  useStageScene(null, 'gym', 'Gym name and grading apply to every wall.');
  useStageCollapsed();
  const backend = useBackend();

  useEffect(() => {
    if (!draft && d.settings) setDraft(structuredClone(d.settings));
  }, [d.settings, draft]);
  useEffect(() => {
    const flush = () => {
      window.clearTimeout(timer.current);
      pending.current?.();
    };
    const onHide = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onHide);
      flush();
    };
  }, []);

  if (d.isLoading || !draft) return <Loading />;

  const update = (next: GymSettings, now = false) => {
    setDraft(next);
    window.clearTimeout(timer.current);
    const go = () => {
      pending.current = null;
      saveSettings.mutate(next, { onError: (e) => toast(friendly(e)) });
    };
    pending.current = go;
    if (now) go();
    else timer.current = window.setTimeout(go, 600);
  };
  const g = draft.grading;
  const setLevels = (levels: GradeLevel[], now = false) =>
    update({ ...draft, grading: { ...g, levels } }, now);
  const usedGrades = d.routes.some((r) => g.levels.some((l) => l.id === r.grade));

  const switchTo = (system: GradingSystem) => {
    const levels = PRESETS[system].levels();
    const changed = remapGrades(g.levels, levels, d.routes);
    update({ ...draft, grading: { system, levels } }, true);
    if (changed.length) saveRoutes.mutate(changed, { onError: (e) => toast(friendly(e)) });
    toast(`Grading set to ${PRESETS[system].name}.`);
  };

  return (
    <>
      <div className={ui.field}>
        <label className={ui.label} htmlFor="gname">
          Gym name
        </label>
        <input
          id="gname"
          className={ui.input}
          maxLength={40}
          value={draft.gymName}
          onChange={(e) => update({ ...draft, gymName: e.target.value })}
          onBlur={() => {
            window.clearTimeout(timer.current);
            pending.current?.();
          }}
        />
        <p className={`${ui.muted} ${ui.smallText}`} aria-live="polite">
          {pending.current || saveSettings.isPending
            ? 'Saving…'
            : saveSettings.isError
              ? 'Not saved. Check the message and try again.'
              : saveSettings.isSuccess
                ? 'Saved'
                : ''}
        </p>
      </div>
      <div className={ui.field}>
        <span className={ui.label}>How your gym grades routes</span>
        <div className={ui.chips}>
          {(Object.keys(PRESETS) as GradingSystem[]).map((k) =>
            k === g.system ? (
              <button key={k} type="button" className={ui.chip} aria-pressed>
                {PRESETS[k].name}
              </button>
            ) : usedGrades ? (
              <ConfirmButton
                key={k}
                className={ui.chip}
                aria-pressed={false}
                confirmText="Routes keep their place. Tap again"
                onConfirm={() => switchTo(k)}
              >
                {PRESETS[k].name}
              </ConfirmButton>
            ) : (
              <button
                key={k}
                type="button"
                className={ui.chip}
                aria-pressed={false}
                onClick={() => switchTo(k)}
              >
                {PRESETS[k].name}
              </button>
            ),
          )}
        </div>
        <p className={`${ui.muted} ${ui.smallText}`}>{PRESETS[g.system].help}</p>
      </div>
      <div className={ui.field}>
        <span className={ui.label}>Levels, easiest first</span>
        {PRESETS[g.system].editable ? (
          <>
            <ol className={s.levels}>
              {g.levels.map((l, i) => (
                <li key={l.id} className={s.level}>
                  {g.system === 'number' ? (
                    <span className={s.levelNo}>{i + 1}</span>
                  ) : (
                    <input
                      type="color"
                      value={l.color ?? '#888888'}
                      aria-label={`Color for ${l.label}`}
                      onChange={(e) =>
                        setLevels(g.levels.map((x) => (x.id === l.id ? { ...x, color: e.target.value } : x)))
                      }
                    />
                  )}
                  <input
                    type="text"
                    className={ui.input}
                    maxLength={20}
                    value={l.label}
                    aria-label={`Name of level ${i + 1}`}
                    onChange={(e) =>
                      setLevels(g.levels.map((x) => (x.id === l.id ? { ...x, label: e.target.value } : x)))
                    }
                  />
                  <label
                    className={`${ui.check} ${ui.smallText}`}
                    title="Not a difficulty, like Unknown or Surprise"
                  >
                    <input
                      type="checkbox"
                      checked={!!l.special}
                      onChange={(e) =>
                        setLevels(
                          g.levels.map((x) => (x.id === l.id ? { ...x, special: e.target.checked } : x)),
                          true,
                        )
                      }
                    />{' '}
                    Not ranked
                  </label>
                  <button
                    type="button"
                    className={ui.link}
                    disabled={i === 0}
                    onClick={() => {
                      const next = [...g.levels];
                      [next[i - 1], next[i]] = [next[i]!, next[i - 1]!];
                      setLevels(next, true);
                    }}
                  >
                    Easier
                  </button>
                  <button
                    type="button"
                    className={`${ui.link} ${ui.danger}`}
                    onClick={() => {
                      if (g.levels.length <= 1) return toast('Keep at least one level.');
                      const n = d.routes.filter((r) => r.grade === l.id).length;
                      if (n)
                        return toast(
                          `${n} route${n === 1 ? ' uses' : 's use'} ${l.label}. Change ${n === 1 ? 'its' : 'their'} grade first.`,
                        );
                      setLevels(
                        g.levels.filter((x) => x.id !== l.id),
                        true,
                      );
                    }}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ol>
            <div className={ui.actions}>
              <button
                type="button"
                className={`${ui.btn} ${ui.small}`}
                onClick={() => update({ ...draft, grading: addLevel(draft.grading) }, true)}
              >
                Add level
              </button>
            </div>
          </>
        ) : (
          <div className={ui.chips}>
            {g.levels.map((l) => (
              <GradeBadge key={l.id} grading={g} id={l.id} />
            ))}
          </div>
        )}
      </div>
      <p className={ui.note}>
        Changes save automatically. Climbers see grades exactly as named here, and renaming a level updates
        every route that uses it.
      </p>
      {backend.kind === 'demo' && (
        <div className={ui.field}>
          <span className={ui.label}>Demo data</span>
          <p className={`${ui.muted} ${ui.smallText}`}>
            Demo mode keeps walls, routes and comments in this browser only. Clear them to start the demo
            over.
          </p>
          <div className={ui.actions}>
            <ConfirmButton
              className={`${ui.btn} ${ui.small} ${ui.danger}`}
              confirmText="Tap again to clear everything"
              onConfirm={() => {
                DemoBackend.reset();
                window.location.hash = '#/';
                window.location.reload();
              }}
            >
              Clear demo data
            </ConfirmButton>
          </div>
        </div>
      )}
    </>
  );
}
