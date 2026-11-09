import { useIsPresent } from 'motion/react';
import { Navigate, Outlet } from 'react-router';

import { useSession } from '@/store/session';

// Mientras la pantalla se está yendo (`isPresent` falso) sigue pintando su contenido: si
// redirigiera, el fundido de salida sería sobre una capa vacía y la pantalla desaparecería de golpe.

export function RequireAuth() {
  const status = useSession((s) => s.status);
  const isPresent = useIsPresent();
  if (status === 'loading') return null;
  return status === 'authenticated' || !isPresent ? <Outlet /> : <Navigate to="/login" replace />;
}

export function RequireGuest() {
  const status = useSession((s) => s.status);
  const isPresent = useIsPresent();
  if (status === 'loading') return null;
  return status === 'authenticated' && isPresent ? <Navigate to="/camara" replace /> : <Outlet />;
}
