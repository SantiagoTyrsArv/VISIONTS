import { QueryClientProvider } from '@tanstack/react-query';
import { AnimatePresence, MotionConfig } from 'motion/react';
import { useEffect } from 'react';
import { HashRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router';

import { queryClient } from '@/api/queryClient';
import { useSignModelBoot } from '@/hooks/useSignModelBoot';
import { AppLayout } from '@/routes/AppLayout';
import Camera from '@/routes/Camera';
import Login from '@/routes/Login';
import Meeting from '@/routes/Meeting';
import Phrases from '@/routes/Phrases';
import Register from '@/routes/Register';
import Settings from '@/routes/Settings';
import { sessionRoute } from '@/routes/sessionRoute';
import { useSession } from '@/store/session';
import { BootOverlay } from '@/ui/loading/BootOverlay';
import { PageTransition } from '@/ui/motion/PageTransition';

export function AppRoutes() {
  const location = useLocation();
  const navigate = useNavigate();
  const status = useSession((s) => s.status);
  const { group, redirect } = sessionRoute(location.pathname, status);

  // La URL sigue a la sesión; mientras tanto la pantalla entrante ya pinta el destino.
  useEffect(() => {
    if (redirect) navigate(redirect, { replace: true });
  }, [redirect, navigate]);

  // La pantalla que sale conserva su último elemento (con su `location`): sigue pintando lo que
  // había hasta acabar el fundido aunque la sesión o la URL ya hayan cambiado.
  return (
    <AnimatePresence mode="wait" initial={false} custom={group === '/reunion'}>
      <PageTransition key={group} instant={group === '/reunion'}>
        {group === 'loading' ? null : (
          <Routes location={redirect ?? location}>
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route element={<AppLayout />}>
              <Route path="/camara" element={<Camera />} />
              <Route path="/frases" element={<Phrases />} />
              <Route path="/ajustes" element={<Settings />} />
            </Route>
            <Route path="/reunion" element={<Meeting />} />
            <Route path="*" element={<Navigate to="/camara" replace />} />
          </Routes>
        )}
      </PageTransition>
    </AnimatePresence>
  );
}

export function App() {
  useEffect(() => {
    void useSession.getState().restore();
  }, []);
  useSignModelBoot();

  return (
    <MotionConfig reducedMotion="user">
      <QueryClientProvider client={queryClient}>
        <BootOverlay>
          <HashRouter>
            <AppRoutes />
          </HashRouter>
        </BootOverlay>
      </QueryClientProvider>
    </MotionConfig>
  );
}
