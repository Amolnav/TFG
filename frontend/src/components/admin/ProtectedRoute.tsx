
import { Navigate, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { getToken, isTokenValid, clearToken } from '../../utils/session';

interface Props {
  children: ReactNode;
}

// BUG-38: antes solo se comprobaba que existiera una cadena en localStorage.
// Ahora se valida la expiración del JWT y se preserva la ruta de destino
// para volver a ella tras el login.
export default function ProtectedRoute({ children }: Props) {
  const location = useLocation();
  const token = getToken();

  if (!isTokenValid(token)) {
    clearToken();
    return <Navigate to="/admin/login" replace state={{ from: location }} />;
  }

  return <>{children}</>;
}
