import { Link } from 'react-router-dom';
import type { Grading, Route } from '@/domain/types';
import { GradeBadge, TypePill } from './ui';
import s from './RouteTag.module.css';

interface Props {
  route: Route | undefined;
  /** The normal route an extra starts from. Its tape colour shows which start this is. */
  base?: Route;
  grading?: Grading;
  wallName?: string;
  /** Open the route as a climber. */
  to?: string;
  /** Do something in place, for example show the route on the wall. */
  onClick?: () => void;
  pressed?: boolean;
}

/** A compact label that says which route something belongs to. */
export function RouteTag({ route, base, grading, wallName, to, onClick, pressed }: Props) {
  if (!route) return <span className={s.tag}>A route that was removed</span>;
  const colour = (route.type === 'base' ? route.color : base?.color) ?? '#999';
  const where = [route.type !== 'base' && base ? `from ${base.name}` : null, wallName]
    .filter(Boolean)
    .join(' · ');
  const body = (
    <>
      <span className={s.tape} style={{ background: colour }} />
      <span className={s.text}>
        <span className={s.line}>
          <strong>{route.name}</strong>
          {route.type !== 'base' && <TypePill type={route.type} />}
          <GradeBadge grading={grading} id={route.grade} />
        </span>
        {where && <span className={s.where}>{where}</span>}
      </span>
    </>
  );
  if (to)
    return (
      <Link to={to} className={`${s.tag} ${s.action}`}>
        {body}
      </Link>
    );
  if (onClick)
    return (
      <button type="button" className={`${s.tag} ${s.action}`} aria-pressed={pressed} onClick={onClick}>
        {body}
      </button>
    );
  return <span className={s.tag}>{body}</span>;
}
