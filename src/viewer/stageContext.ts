import { createContext, useContext, useEffect, useRef } from 'react';
import { friendly } from '@/data/backend';
import type { SceneSpec, ViewerEvents, WallViewer } from './WallViewer';

/**
 * One 3D viewer lives for the whole visit. Pages describe what it should show with `useStageScene`,
 * listen to taps with `useViewerEvents`, and put controls on it with `<StageDock>` and `<StageTools>`.
 */
export interface StageState {
  viewer: WallViewer | null;
  setViewer: (v: WallViewer | null) => void;
  message: string | null;
  setMessage: (m: string | null) => void;
  slots: { dock: HTMLElement | null; tools: HTMLElement | null };
  setSlots: (s: { dock: HTMLElement | null; tools: HTMLElement | null }) => void;
  dockActive: boolean;
  setDockActive: (on: boolean) => void;
  /** Phones: hide the 3D area on screens that only show text there. */
  collapsed: boolean;
  setCollapsed: (on: boolean) => void;
  lastSpec: React.MutableRefObject<SceneSpec | null>;
}

export const StageContext = createContext<StageState | null>(null);

export function useStageState() {
  const ctx = useContext(StageContext);
  if (!ctx) throw new Error('Stage hooks must be used inside StageProvider');
  return ctx;
}

export const useViewer = () => useStageState().viewer;

/**
 * Show a scene. `key` must change whenever the scene should be rebuilt.
 * Pass `null` with an `empty` message to show text instead of 3D.
 */
export function useStageScene(
  spec: SceneSpec | null,
  key: string,
  empty = 'Nothing to show yet.',
  enabled = true,
) {
  const { viewer, setMessage, lastSpec } = useStageState();
  const specRef = useRef(spec);
  specRef.current = spec;
  useEffect(() => {
    if (!viewer || !enabled) return;
    const current = specRef.current;
    lastSpec.current = current;
    if (!current) {
      setMessage(empty);
      return;
    }
    let alive = true;
    setMessage(null);
    viewer.show(current).catch((e: unknown) => {
      if (alive) setMessage(friendly(e));
    });
    return () => {
      alive = false;
    };
  }, [viewer, key, empty, enabled, setMessage, lastSpec]);
}

/** Show text on the stage instead of 3D (for example while a scan downloads). */
export function useStageMessage(text: string | null) {
  const { setMessage } = useStageState();
  useEffect(() => {
    if (text) setMessage(text);
  }, [text, setMessage]);
}

/** Listen to taps on the 3D view while this component is mounted. */
export function useViewerEvents(
  handlers: Pick<ViewerEvents, 'holdTap' | 'scanTap'>,
  options: { zoomFirst?: boolean } = {},
) {
  const viewer = useViewer();
  const ref = useRef(handlers);
  ref.current = handlers;
  const zoomFirst = !!options.zoomFirst;
  useEffect(() => {
    if (!viewer) return;
    viewer.events.holdTap = (id) => ref.current.holdTap?.(id);
    viewer.events.scanTap = (p, n) => ref.current.scanTap?.(p, n);
    viewer.zoomFirst = zoomFirst;
    return () => {
      viewer.events.holdTap = undefined;
      viewer.events.scanTap = undefined;
      viewer.zoomFirst = false;
    };
  }, [viewer, zoomFirst]);
}

/** On phones, hide the 3D area while this component is mounted (screens with nothing to show in 3D). */
export function useStageCollapsed(enabled = true) {
  const { setCollapsed } = useStageState();
  useEffect(() => {
    if (!enabled) return;
    setCollapsed(true);
    return () => setCollapsed(false);
  }, [setCollapsed, enabled]);
}
