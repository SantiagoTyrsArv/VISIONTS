import { QueryClientProvider } from '@tanstack/react-query';
import { useEffect } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router';

import { queryClient } from '@/api/queryClient';
import { AppLayout } from '@/routes/AppLayout';
import Camera from '@/routes/Camera';
import ForgotPassword from '@/routes/ForgotPassword';
import { RequireAuth, RequireGuest } from '@/routes/Guard';
import Login from '@/routes/Login';
import Phrases from '@/routes/Phrases';
import Register from '@/routes/Register';
import Settings from '@/routes/Settings';
import { useSession } from '@/store/session';

export function App() {
  useEffect(() => {
    void useSession.getState().restore();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <HashRouter>
        <Routes>
          <Route element={<RequireGuest />}>
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
          </Route>
          <Route element={<RequireAuth />}>
            <Route element={<AppLayout />}>
              <Route path="/frases" element={<Phrases />} />
              <Route path="/camara" element={<Camera />} />
              <Route path="/ajustes" element={<Settings />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/frases" replace />} />
        </Routes>
      </HashRouter>
    </QueryClientProvider>
  );
}
