import { useEffect, useRef, useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { ui } from '@/components/uiStyles';
import { useBackend } from '@/data/context';
import { useSettings } from '@/data/queries';
import { device } from '@/lib/device';
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
        <div className={s.actions}>
          <ThemeToggle />
          <nav className={`${ui.segInline} ${s.modes}`} aria-label="View as">
            <Link to="/" aria-current={staff ? undefined : 'page'}>
              Climber
            </Link>
            <Link to="/staff" aria-current={staff ? 'page' : undefined}>
              Staff
            </Link>
          </nav>
        </div>
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

function currentTheme(): 'light' | 'dark' {
  return device.get().theme ?? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
}

function ThemeToggle() {
  const [theme, setTheme] = useState(currentTheme);
  const dark = theme === 'dark';

  const toggle = () => {
    const next = dark ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    device.set({ theme: next });
    setTheme(next);
  };

  return (
    <button
      type="button"
      className={s.theme}
      onClick={toggle}
      aria-label={dark ? 'Light theme' : 'Dark theme'}
      title={dark ? 'Light theme' : 'Dark theme'}
    >
      {dark ? (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="4.5" />
          <path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" />
        </svg>
      )}
    </button>
  );
}
