
import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import ReservationPage from './pages/ReservationPage';
import { SocketProvider } from './context/SocketContext';
import ProtectedRoute from './components/admin/ProtectedRoute';
import Home from './pages/Home';
import ScrollToTop from './components/ScrollToTop';
import { ConfigProvider } from './context/ConfigContext';
import { ThemeProvider } from './context/ThemeContext';
import ErrorBoundary from './components/ErrorBoundary';

// BUG-24: code-splitting — el visitante público no descarga el panel admin
// (antes todo iba en un único bundle de 535 KB)
const MenuPage = lazy(() => import('./pages/MenuPage'));
const AboutPage = lazy(() => import('./pages/AboutPage'));
const ManageBookingPage = lazy(() => import('./pages/ManageBookingPage'));
const ReconfirmPage = lazy(() => import('./pages/ReconfirmPage'));
const LoginPage = lazy(() => import('./pages/admin/LoginPage'));
const AdminLayout = lazy(() => import('./pages/admin/AdminLayout'));
const DashboardPage = lazy(() => import('./pages/admin/DashboardPage'));
const ReservasPage = lazy(() => import('./pages/admin/ReservasPage'));
const MesasPage = lazy(() => import('./pages/admin/MesasPage'));
const CustomersPage = lazy(() => import('./pages/admin/CustomersPage'));
const ConfiguracionPage = lazy(() => import('./pages/admin/ConfiguracionPage'));
const CartaPage = lazy(() => import('./pages/admin/CartaPage'));
const ContenidoPage = lazy(() => import('./pages/admin/ContenidoPage'));
const EquipoPage = lazy(() => import('./pages/admin/EquipoPage'));
const EsperaPage = lazy(() => import('./pages/admin/EsperaPage'));
const ServicioPage = lazy(() => import('./pages/admin/ServicioPage'));
const InformesPage = lazy(() => import('./pages/admin/InformesPage'));
const SalaPage = lazy(() => import('./pages/admin/SalaPage'));

function RouteFallback() {
  return (
    <div style={{ minHeight: '40vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      ⏳
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
    <ConfigProvider>
      <BrowserRouter>
        <ThemeProvider>
          <ScrollToTop />
          <Suspense fallback={<RouteFallback />}>
          <Routes>
        {/* Public */}
        <Route path="/" element={<Home />} />
        <Route path="/reservar" element={<ReservationPage />} />
        {/* N1.1: autogestión de reserva por enlace del email */}
        <Route path="/reserva/:token" element={<ManageBookingPage />} />
        {/* N1.2: reconfirmación en un clic desde el recordatorio */}
        <Route path="/reconfirmar/:token" element={<ReconfirmPage />} />
        <Route path="/carta" element={<MenuPage />} />
        <Route path="/historia" element={<AboutPage />} />

        {/* Admin auth */}
        <Route path="/admin/login" element={<LoginPage />} />

        {/* Protected admin area */}
        <Route
          path="/admin"
          element={
            <ProtectedRoute>
              <SocketProvider>
                <AdminLayout />
              </SocketProvider>
            </ProtectedRoute>
          }
        >
          <Route index element={<DashboardPage />} />
          <Route path="reservas" element={<ReservasPage />} />
          <Route path="mesas" element={<MesasPage />} />
          <Route path="clientes" element={<CustomersPage />} />
          <Route path="configuracion" element={<ConfiguracionPage />} />
          <Route path="carta" element={<CartaPage />} />
          <Route path="contenido" element={<ContenidoPage />} />
          <Route path="equipo" element={<EquipoPage />} />
          <Route path="espera" element={<EsperaPage />} />
          <Route path="servicio" element={<ServicioPage />} />
          <Route path="informes" element={<InformesPage />} />
          <Route path="sala" element={<SalaPage />} />
        </Route>

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
          </Suspense>
    </ThemeProvider>
    </BrowserRouter>
    </ConfigProvider>
    </ErrorBoundary>
  );
}
