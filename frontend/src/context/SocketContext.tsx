import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import type { ReactNode } from 'react';
import { SocketContext } from './socketContextImpl';
import { getToken } from '../utils/session';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || window.location.origin;

// BUG-39: el socket se crea dentro del efecto (no en un useMemo, cuyo valor
// React puede descartar y que en StrictMode creaba instancias huérfanas sin
// disconnect). El token se lee al montar el provider, que vive dentro de
// ProtectedRoute: tras cada login el provider se remonta con el token nuevo.
export function SocketProvider({ children }: { children: ReactNode }) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      return undefined;
    }

    const instance = io(SOCKET_URL, {
      auth: { token },
      autoConnect: false,
      transports: ['websocket', 'polling'],
      path: '/socket.io'
    });

    const handleConnect = () => {
      setIsConnected(true);
      setConnectionError(null);
    };

    const handleDisconnect = () => {
      setIsConnected(false);
    };

    const handleConnectError = (error: Error | string) => {
      const message = typeof error === 'string' ? error : error.message;
      setConnectionError(message);
      console.warn('Socket.io error de conexión:', message);
    };

    instance.on('connect', handleConnect);
    instance.on('disconnect', handleDisconnect);
    instance.on('connect_error', handleConnectError);

    instance.connect();
    // Guardar la instancia en estado es el patrón de suscripción a un sistema
    // externo; el efecto es el lugar correcto para crear/destruir el socket.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSocket(instance);

    return () => {
      instance.off('connect', handleConnect);
      instance.off('disconnect', handleDisconnect);
      instance.off('connect_error', handleConnectError);
      instance.disconnect();
      setSocket(null);
    };
  }, []);

  return (
    <SocketContext.Provider value={{ socket, isConnected, connectionError }}>
      {children}
    </SocketContext.Provider>
  );
}
