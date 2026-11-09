import { uid } from './format';

/**
 * Small things this phone remembers: an anonymous id for counting sends once, the climber's nickname,
 * routes they sent, and the wall staff last worked on. Nothing here is important if it is lost.
 */
interface Prefs {
  device: string;
  nick: string;
  sent: Record<string, true>;
  /** Stars this phone gave, by route id. */
  rated: Record<string, number>;
  staffWall: string | null;
  /** Route views: show rings and labels on holds. */
  rings: boolean;
  /** Theme picked in the header; null follows the phone's setting. */
  theme: 'light' | 'dark' | null;
}

const KEY = 'blocplus-device';

function read(): Prefs {
  let p: Partial<Prefs>;
  try {
    p = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Prefs>;
  } catch {
    p = {};
  }
  return {
    device: p.device ?? `d${uid()}${uid()}`,
    nick: p.nick ?? '',
    sent: p.sent ?? {},
    rated: p.rated ?? {},
    staffWall: p.staffWall ?? null,
    rings: p.rings ?? true,
    theme: p.theme ?? null,
  };
}

let prefs = read();

export const device = {
  get: () => prefs,
  set(patch: Partial<Prefs>) {
    prefs = { ...prefs, ...patch };
    try {
      localStorage.setItem(KEY, JSON.stringify(prefs));
    } catch {
      /* private mode or storage full: keep it in memory for this visit */
    }
  },
};
