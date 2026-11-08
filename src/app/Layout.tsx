import { useEffect, useRef } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { ui } from '@/components/uiStyles';
import { useBackend } from '@/data/context';
import { useSettings } from '@/data/queries';
import { Stage } from '@/viewer/stage';
import s from './Layout.module.css';

export function Layout() {
  const settings = useSettings();
  const backend = useBackend();
  const { pathname } = useLocation();
  const gym = settings.data?.gymName ?? '';
  const staff = pathname.startsWith('/staff');
  const panel = useRef<HTMLElement>(null);

  // Every new screen opens at the top: the page scrolls on phones, the side panel on wide screens.
  useEffect(() => {
    window.scrollTo(0, 0);
    panel.current?.scrollTo(0, 0);
  }, [pathname]);

  useEffect(() => {
    document.title = gym ? `Bloc+ · ${gym}` : 'Bloc+';
  }, [gym]);

  return (
    <div className={s.page}>
      <header className={s.bar}>
        <div className={s.brand}>
          <h1 className={s.logo}>
            Bloc<i>+</i>
          </h1>
          <span className={s.gym}>
            {gym}
            {backend.kind === 'demo' ? ' · demo' : ''}
          </span>
        </div>
        <nav className={`${ui.segInline} ${s.modes}`} aria-label="View as">
          <Link to="/" aria-current={staff ? undefined : 'page'}>
            Climber
          </Link>
          <Link to="/staff" aria-current={staff ? 'page' : undefined}>
            Staff
          </Link>
        </nav>
      </header>
      <main className={s.app}>
        <Stage />
        <aside className={s.panel} ref={panel}>
          <Outlet />
        </aside>
      </main>
    </div>
  );
}
