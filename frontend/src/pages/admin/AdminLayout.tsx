import { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../context/useTheme';
import { useSocket } from '../../context/useSocket';
import { useConfig } from '../../context/useConfig';
import BrandLogo from '../../components/BrandLogo';
import { clearToken, getSessionRole } from '../../utils/session';
import '../../styles/pages/admin/AdminLayout.css';

// BUG-53: las etiquetas del menú se resuelven vía i18n en el render
// N2.1: los enlaces adminOnly solo se muestran a ADMIN (la autorización real
// la aplica el backend; esto es solo UX)
const navLinks = [
  { to: '/admin', labelKey: 'admin.layout.navDashboard', icon: '📊', end: true },
  { to: '/admin/reservas', labelKey: 'admin.layout.navReservations', icon: '📅', end: false },
  { to: '/admin/sala', labelKey: 'admin.layout.navFloor', icon: '🪑', end: false },
  { to: '/admin/espera', labelKey: 'admin.layout.navWaitlist', icon: '🕐', end: false },
  { to: '/admin/mesas', labelKey: 'admin.layout.navTables', icon: '🍽️', end: false },
  { to: '/admin/clientes', labelKey: 'admin.layout.navCustomers', icon: '👥', end: false },
  { to: '/admin/informes', labelKey: 'admin.layout.navReports', icon: '📈', end: false },
  { to: '/admin/carta', labelKey: 'admin.layout.navMenu', icon: '📜', end: false },
  { to: '/admin/contenido', labelKey: 'admin.layout.navContent', icon: '🖼️', end: false },
  { to: '/admin/equipo', labelKey: 'admin.layout.navTeam', icon: '🧑‍🍳', end: false, adminOnly: true },
  { to: '/admin/configuracion', labelKey: 'admin.layout.navSettings', icon: '⚙️', end: false },
];

export default function AdminLayout() {
  const { t, i18n } = useTranslation();
  // M1: la marca del panel sale de la configuración, no de literales
  const { config } = useConfig();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { theme, toggleTheme } = useTheme();
  // BUG-39: el estado de la conexión en tiempo real se muestra en el topbar
  const { isConnected, connectionError } = useSocket();
  const navigate = useNavigate();

  const handleLogout = () => {
    clearToken();
    navigate('/admin/login');
  };

  const today = new Date().toLocaleDateString(i18n.language, {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  return (
    <div className="admin-shell">
      {/* Sidebar overlay (mobile) */}
      <div
        className={`sidebar-overlay${sidebarOpen ? ' visible' : ''}`}
        onClick={() => setSidebarOpen(false)}
      />

      {/* Sidebar */}
      <aside className={`admin-sidebar${sidebarOpen ? ' open' : ''}`}>
        <div className="sidebar-brand">
          <div className="sidebar-brand__name"><BrandLogo /> {config.restaurant_name}</div>
          <div className="sidebar-brand__tag">{t('admin.layout.brandTag')}</div>
        </div>

        <nav className="sidebar-nav">
          <div className="sidebar-nav__section-label">{t('admin.layout.menu')}</div>
          {navLinks.filter((link) => !link.adminOnly || getSessionRole() === 'ADMIN').map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.end}
              className={({ isActive }) =>
                `sidebar-nav__link${isActive ? ' active' : ''}`
              }
              onClick={() => setSidebarOpen(false)}
            >
              {({ isActive }) => (
                <>
                  <span className="sidebar-nav__icon">{link.icon}</span>
                  {t(link.labelKey)}
                  {isActive && <span style={{ marginLeft: 'auto', fontSize: '0.8rem' }}>➜</span>}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-footer__user">🔐 {t('admin.layout.user')}</div>
          <button className="sidebar-footer__logout" onClick={handleLogout}>
            ↩ {t('admin.layout.logout')}
          </button>
        </div>
      </aside>

      {/* Main area */}
      <div className="admin-main">
        <header className="admin-topbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <button
              className="admin-topbar__hamburger"
              onClick={() => setSidebarOpen((v) => !v)}
              aria-label={t('admin.layout.openMenu')}
            >
              ☰
            </button>
            <span className="admin-topbar__title">{config.restaurant_name}</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
            <span
              title={isConnected ? t('admin.layout.realtimeOnTitle') : (connectionError || t('admin.layout.realtimeOffTitle'))}
              style={{ fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
            >
              {isConnected ? '🟢' : '🔴'}
              <span className="admin-topbar__date">{isConnected ? t('admin.layout.realtimeOn') : t('admin.layout.realtimeOff')}</span>
            </span>
            <button
              className="theme-toggle-btn"
              onClick={toggleTheme}
              title={theme === 'light' ? t('admin.layout.enableDarkMode') : t('admin.layout.enableLightMode')}
            >
              {theme === 'light' ? '🌙' : '☀️'}
            </button>
            <span className="admin-topbar__date" style={{ textTransform: 'capitalize' }}>
              📅 {today}
            </span>
          </div>
        </header>

        <main className="admin-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
