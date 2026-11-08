import { useEffect, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Backend, Session } from './backend';
import { BackendContext, SessionContext } from './context';

export function BackendProvider({ backend, children }: { backend: Backend; children: ReactNode }) {
  const qc = useQueryClient();
  const [state, setState] = useState<{ session: Session | null; ready: boolean }>({
    session: null,
    ready: false,
  });

  useEffect(() => {
    let alive = true;
    void backend.getSession().then((session) => alive && setState({ session, ready: true }));
    const off = backend.onAuthChange((session) => {
      setState((prev) => {
        // Staff see hidden comments; refetch them when that changes.
        if (prev.session?.isStaff !== session?.isStaff) void qc.invalidateQueries({ queryKey: ['comments'] });
        return { session, ready: true };
      });
    });
    return () => {
      alive = false;
      off();
    };
  }, [backend, qc]);

  return (
    <BackendContext.Provider value={backend}>
      <SessionContext.Provider value={state}>{children}</SessionContext.Provider>
    </BackendContext.Provider>
  );
}
