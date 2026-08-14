
import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { authLogin } from '../../services/api';
import { setToken } from '../../utils/session';
import { useConfig } from '../../context/useConfig';
import BrandLogo from '../../components/BrandLogo';
import '../../styles/pages/admin/LoginPage.css';

export default function LoginPage() {
  const { t } = useTranslation();
  // M1: marca desde configuración
  const { config } = useConfig();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) { setError(t('admin.login.missingFields')); return; }
    setError('');
    setLoading(true);
    try {
      const token = await authLogin(email, password);
      setToken(token);
      // BUG-38: volver a la ruta que originó la redirección al login
      const from = (location.state as { from?: { pathname: string; search?: string } } | null)?.from;
      navigate(from ? `${from.pathname}${from.search ?? ''}` : '/admin', { replace: true });
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } } };
      setError(axiosErr?.response?.data?.message ?? t('admin.login.invalidCredentials'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-header">
          <div className="login-logo"><BrandLogo /></div>
          <h1 className="login-title">{config.restaurant_name}</h1>
          <p className="login-subtitle">{t('admin.login.subtitle')}</p>
        </div>

        <form className="login-form" onSubmit={handleSubmit} noValidate>
          <div className="form-group">
            <label htmlFor="login-email">{t('admin.login.emailLabel')}</label>
            <input
              id="login-email"
              type="email"
              placeholder="admin@ejemplo.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
            />
          </div>

          <div className="form-group">
            <label htmlFor="login-password">{t('admin.login.passwordLabel')}</label>
            <input
              id="login-password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>

          {error && <div className="error-msg">{error}</div>}

          <button
            type="submit"
            className="btn btn-primary w-full"
            disabled={loading}
            style={{ marginTop: '0.5rem' }}
          >
            {loading ? `⏳ ${t('admin.login.loggingIn')}` : t('admin.login.submit')}
          </button>
        </form>

        <div className="login-back">
          <Link to="/reservar" style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            ← {t('admin.login.backToReservations')}
          </Link>
        </div>
      </div>
    </div>
  );
}
