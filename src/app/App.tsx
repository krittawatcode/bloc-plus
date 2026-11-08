import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ToastProvider } from '@/components/Toast';
import { createBackend } from '@/data/createBackend';
import { BackendProvider } from '@/data/BackendProvider';
import { StageProvider } from '@/viewer/stage';
import { Layout } from './Layout';
import { StartsPage } from '@/features/climber/StartsPage';
import { SpotPage } from '@/features/climber/SpotPage';
import { RoutePage } from '@/features/climber/RoutePage';
import { StaffLayout } from '@/features/staff/StaffLayout';
import { RoutesTab } from '@/features/staff/RoutesTab';
import { StartTab } from '@/features/staff/StartTab';
import { RouteEditor } from '@/features/staff/RouteEditor';
import { WallsTab } from '@/features/staff/WallsTab';
import { QrTab } from '@/features/staff/QrTab';
import { CommentsTab } from '@/features/staff/CommentsTab';
import { GymTab } from '@/features/staff/GymTab';

/**
 * Routes use the URL hash (#/r/abc) so the site works on any static host without rewrites.
 * QR stickers point at #/r/<normal route id>.
 */
export function App() {
  const [backend] = useState(createBackend);
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false } },
      }),
  );
  return (
    <QueryClientProvider client={queryClient}>
      <BackendProvider backend={backend}>
        <ToastProvider>
          <StageProvider>
            <HashRouter>
              <Routes>
                <Route element={<Layout />}>
                  <Route index element={<StartsPage />} />
                  <Route path="r/:baseId" element={<SpotPage />} />
                  <Route path="x/:routeId" element={<RoutePage />} />
                  <Route path="staff" element={<StaffLayout />}>
                    <Route index element={<Navigate to="routes" replace />} />
                    <Route path="routes" element={<RoutesTab />} />
                    <Route path="routes/start/:baseId" element={<StartTab />} />
                    <Route path="routes/new" element={<RouteEditor />} />
                    <Route path="routes/new/:baseId/:type" element={<RouteEditor />} />
                    <Route path="routes/:routeId" element={<RouteEditor />} />
                    <Route path="walls" element={<WallsTab />} />
                    <Route path="qr" element={<QrTab />} />
                    <Route path="comments" element={<CommentsTab />} />
                    <Route path="gym" element={<GymTab />} />
                  </Route>
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Route>
              </Routes>
            </HashRouter>
          </StageProvider>
        </ToastProvider>
      </BackendProvider>
    </QueryClientProvider>
  );
}
