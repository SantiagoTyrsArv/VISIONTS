import { QueryClientProvider } from '@tanstack/react-query';
import { AnimatePresence, MotionConfig } from 'motion/react';
import { useEffect } from 'react';
import { HashRouter, Navigate, Route, Routes, useLocation } from 'react-router';

import { queryClient } from '@/api/queryClient';
import { AppLayout } from '@/routes/AppLayout';
import Camera from '@/routes/Camera';
import { RequireAuth, RequireGuest } from '@/routes/Guard';
import Login from '@/routes/Login';
import Meeting from '@/routes/Meeting';
import Phrases from '@/routes/Phrases';
import Register from '@/routes/Register';
import Settings from '@/routes/Settings';
import { useSession } from '@/store/session';
import { BootOverlay } from '@/ui/loading/BootOverlay';
import { PageTransition } from '@/ui/motion/PageTransition';

/** Login, registro y reunión son pantallas aparte; todo lo demás vive en AppLayout. */
function routeGroup(pathname: string): string {
  return ['/login', '/register', '/reunion'].includes(pathname) ? pathname : 'app';
}

export function AppRoutes() {
  const location = useLocation();
  const group = routeGroup(location.pathname);
  return (
    <AnimatePresence mode="wait" initial={false}>
      <PageTransition key={group} instant={group === '/reunion'}>
        <Routes location={location}>
          <Route element={<RequireGuest />}>
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
          </Route>
          <Route element={<RequireAuth />}>
            <Route element={<AppLayout />}>
              <Route path="/camara" element={<Camera />} />
              <Route path="/frases" element={<Phrases />} />
              <Route path="/ajustes" element={<Settings />} />
            </Route>
            <Route path="/reunion" element={<Meeting />} />
          </Route>
          <Route path="*" element={<Navigate to="/camara" replace />} />
        </Routes>
      </PageTransition>
    </AnimatePresence>
  );
}

export function App() {
  useEffect(() => {
    void useSession.getState().restore();
  }, []);

  return (
    <MotionConfig reducedMotion="user">
      <QueryClientProvider client={queryClient}>
        <BootOverlay />
        <HashRouter>
          <AppRoutes />
        </HashRouter>
      </QueryClientProvider>
    </MotionConfig>
  );
}
