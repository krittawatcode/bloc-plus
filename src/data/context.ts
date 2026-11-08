import { createContext, useContext } from 'react';
import type { Backend, Session } from './backend';

export const BackendContext = createContext<Backend | null>(null);
export const SessionContext = createContext<{ session: Session | null; ready: boolean }>({
  session: null,
  ready: false,
});

export function useBackend(): Backend {
  const b = useContext(BackendContext);
  if (!b) throw new Error('useBackend must be used inside BackendProvider');
  return b;
}

export const useSession = () => useContext(SessionContext);
