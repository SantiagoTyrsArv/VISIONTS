import { Navigate, Outlet } from 'react-router';

import { useSession } from '@/store/session';
import { Splash } from '@/ui/Splash';

export function RequireAuth() {
  const status = useSession((s) => s.status);
  if (status === 'loading') return <Splash />;
  return status === 'authenticated' ? <Outlet /> : <Navigate to="/login" replace />;
}

export function RequireGuest() {
  const status = useSession((s) => s.status);
  if (status === 'loading') return <Splash />;
  return status === 'authenticated' ? <Navigate to="/frases" replace /> : <Outlet />;
}
