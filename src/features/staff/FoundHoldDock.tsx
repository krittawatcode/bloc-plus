import d from '@/components/Dock.module.css';
import type { HoldKind } from '@/domain/types';
import type { HoldFinder } from './useHoldFinder';

/** Dock controls for a hold the app just found: kind, size, cancel and add. */
export function FoundHoldDock({
  finder,
  addLabel,
  onAdd,
}: {
  finder: HoldFinder;
  addLabel: string;
  onAdd: () => void;
}) {
  const p = finder.pending;
  if (!p) return null;
  return (
    <>
      <p className={d.msg}>{finder.message}</p>
      <div className={d.seg} role="group" aria-label="What was tapped">
        {(['hold', 'volume', 'marker'] as HoldKind[]).map((k) => (
          <button
            key={k}
            type="button"
            aria-pressed={p.kind === k}
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
        <span className={d.size}>{Math.round(p.r * 100)} cm</span>
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
          onClick={onAdd}
          disabled={!finder.cut || finder.saving || (p.kind === 'marker' && !p.onId)}
        >
          {addLabel}
        </button>
      </div>
    </>
  );
}
