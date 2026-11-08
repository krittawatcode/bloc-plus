import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useQueryClient } from '@tanstack/react-query';
import { ROLE_NAME } from '@/domain/routes';
import type { Hold, Wall } from '@/domain/types';
import { useBackend } from '@/data/context';
import { keys } from '@/data/queries';
import { useToast } from '@/components/toastContext';
import { decodePiece } from './piece';
import { StageContext, useStageState, type StageState } from './stageContext';
import { WallViewer, type HoldSource, type MarkerRole, type SceneSpec } from './WallViewer';
import s from './Stage.module.css';

export function StageProvider({ children }: { children: ReactNode }) {
  const [viewer, setViewer] = useState<WallViewer | null>(null);
  const [message, setMessage] = useState<string | null>('Loading…');
  const [slots, setSlots] = useState<StageState['slots']>({ dock: null, tools: null });
  const [dockActive, setDockActive] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const lastSpec = useRef<SceneSpec | null>(null);
  return (
    <StageContext.Provider
      value={{
        viewer,
        setViewer,
        message,
        setMessage,
        slots,
        setSlots,
        dockActive,
        setDockActive,
        lastSpec,
        collapsed,
        setCollapsed,
      }}
    >
      {children}
    </StageContext.Provider>
  );
}

const cssVar = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

/** The 3D view itself. Place once in the layout. */
export function Stage() {
  const st = useStageState();
  const { setViewer, setSlots, viewer, lastSpec, setMessage } = st;
  const backend = useBackend();
  const qc = useQueryClient();
  const toast = useToast();
  const container = useRef<HTMLDivElement>(null);
  const dockRef = useRef<HTMLDivElement>(null);
  const toolsRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState('');
  const [legend, setLegend] = useState<MarkerRole[]>([]);

  useLayoutEffect(() => {
    setSlots({ dock: dockRef.current, tools: toolsRef.current });
  }, [setSlots]);

  useEffect(() => {
    if (!container.current) return;
    const source: HoldSource = {
      holds: (wallId) => (qc.getQueryData<Hold[]>(keys.holds) ?? []).filter((h) => h.wallId === wallId),
      piece: async (hold) => decodePiece(await backend.fetchScanFile(hold.piecePath!)),
      ghost: async (wallId) => {
        const wall = (qc.getQueryData<Wall[]>(keys.walls) ?? []).find((w) => w.id === wallId);
        return wall?.ghostPath ? new Float32Array(await backend.fetchScanFile(wall.ghostPath)) : null;
      },
    };
    let v: WallViewer;
    try {
      v = new WallViewer(container.current, source, { css: cssVar });
    } catch {
      setMessage('3D needs WebGL, which this browser has turned off.');
      return;
    }
    v.events.status = setStatus;
    v.events.legend = setLegend;
    setViewer(v);
    return () => {
      setViewer(null);
      v.dispose();
    };
  }, [backend, qc, setViewer, setMessage]);

  useEffect(() => {
    if (viewer) viewer.events.hint = toast;
  }, [viewer, toast]);

  // Colours come from CSS tokens; redraw when the theme changes.
  useEffect(() => {
    if (!viewer) return;
    const redraw = () => {
      if (lastSpec.current) void viewer.show(lastSpec.current);
    };
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', redraw);
    const mo = new MutationObserver(redraw);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => {
      mq.removeEventListener('change', redraw);
      mo.disconnect();
    };
  }, [viewer, lastSpec]);

  return (
    <section
      className={`${st.dockActive ? s.stageWork : s.stage} ${st.collapsed ? s.collapsed : ''}`}
      aria-label="3D wall view"
    >
      <div ref={container} className={s.viewport} />
      <div className={s.legend} hidden={!!st.message || !legend.length}>
        {legend.map((r) => (
          <span key={r} className={s.legendItem}>
            <b className={s.legendDot} style={{ color: `var(${roleVar(r)})` }} />
            {ROLE_NAME[r]}
          </span>
        ))}
      </div>
      <div ref={toolsRef} className={s.tools} hidden={!!st.message} />
      <div className={s.hud} hidden={!!st.message || !status}>
        {status}
      </div>
      <div ref={dockRef} className={s.dock} hidden={!st.dockActive} />
      {st.message && (
        <div className={s.message}>
          <div>{st.message}</div>
        </div>
      )}
    </section>
  );
}

function roleVar(r: MarkerRole) {
  return (
    {
      start: '--start',
      hand: '--hand',
      top: '--top',
      foot: '--foot',
      off: '--off',
      tag: '--accent',
      marker: '--top',
    } as const
  )[r];
}

/** Controls that sit on the bottom of the 3D view. The picture is framed above them. */
export function StageDock({ children }: { children: ReactNode }) {
  const { slots, viewer, setDockActive } = useStageState();
  useLayoutEffect(() => {
    if (!slots.dock) return;
    setDockActive(true);
    const el = slots.dock;
    const ro = new ResizeObserver(() => viewer?.setBottomPad(el.offsetHeight + 16));
    ro.observe(el);
    viewer?.setBottomPad(el.offsetHeight + 16);
    return () => {
      ro.disconnect();
      setDockActive(false);
      viewer?.setBottomPad(0);
    };
  }, [slots.dock, viewer, setDockActive]);
  return slots.dock ? createPortal(children, slots.dock) : null;
}

/** Small buttons in the top-right corner of the 3D view. */
export function StageTools({ children }: { children: ReactNode }) {
  const { slots } = useStageState();
  return slots.tools ? createPortal(children, slots.tools) : null;
}
