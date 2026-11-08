import { useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { Loading } from '@/components/ui';
import { ui } from '@/components/uiStyles';
import { useBackend, useSession } from '@/data/context';
import { useComments, useCoreData } from '@/data/queries';
import { PRACTICE_WALL_ID } from '@/domain/types';
import { device } from '@/lib/device';
import { useStageScene } from '@/viewer/stageContext';
import { LoginForm } from '@/features/auth/LoginForm';
import { StaffWallContext } from './staffWall';
import s from './Staff.module.css';

const TABS = [
  ['routes', 'Routes'],
  ['walls', 'Walls'],
  ['qr', 'QR codes'],
  ['comments', 'Comments'],
  ['gym', 'Gym'],
] as const;

export function StaffLayout() {
  const { session, ready } = useSession();
  const backend = useBackend();
  const { walls } = useCoreData();
  const comments = useComments();
  const { pathname } = useLocation();
  const [chosen, setChosen] = useState(device.get().staffWall);
  const wallId =
    chosen === PRACTICE_WALL_ID || walls.some((w) => w.id === chosen)
      ? chosen!
      : (walls[0]?.id ?? PRACTICE_WALL_ID);
  const setWallId = (id: string) => {
    device.set({ staffWall: id });
    setChosen(id);
  };
  const editing = /\/staff\/routes\/.+/.test(pathname);
  const reported = (comments.data ?? []).filter((c) => c.reported && !c.hidden).length;

  const signedOut = !ready || !session?.isStaff;
  useStageScene(
    null,
    `staff-gate:${ready}`,
    ready ? 'Sign in as staff to manage walls and routes.' : 'Loading…',
    signedOut,
  );

  if (!ready) return <Loading />;
  if (!session?.isStaff) return <LoginForm />;

  return (
    <StaffWallContext.Provider value={{ wallId, setWallId }}>
      <div className={ui.head}>
        <div className={ui.frow}>
          <p className={ui.eyebrow}>Staff · {session.email}</p>
          <button type="button" className={ui.link} onClick={() => void backend.signOut()}>
            Sign out
          </button>
        </div>
        <h2>{editing ? 'Set a route' : 'Manage the gym'}</h2>
      </div>
      {!editing && (
        <nav className={s.tabs} aria-label="Staff sections">
          {TABS.map(([path, label]) => (
            <Link
              key={path}
              to={`/staff/${path}`}
              aria-current={pathname.startsWith(`/staff/${path}`) ? 'page' : undefined}
            >
              {label}
              {path === 'comments' && reported > 0 && <span className={s.badge}>{reported}</span>}
            </Link>
          ))}
        </nav>
      )}
      <Outlet />
    </StaffWallContext.Provider>
  );
}
