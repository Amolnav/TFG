
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getWaitlist, resolveWaitlistEntry, deleteWaitlistEntry } from '../../services/api';
import type { WaitlistEntry } from '../../services/api';
import { useSocket } from '../../context/useSocket';
import { translateApiError } from '../../utils/apiErrors';
import '../../styles/pages/admin/AdminPages.css';

// N1.4: pestaña de lista de espera del panel. El backend avisa por email al
// primero de la lista al liberarse un hueco; aquí el personal la consulta y
// puede resolver o eliminar entradas a mano.
export default function EsperaPage() {
  const { t, i18n } = useTranslation();
  const { socket } = useSocket();
  const [entries, setEntries] = useState<WaitlistEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [includeResolved, setIncludeResolved] = useState(false);
  const [working, setWorking] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    getWaitlist({ date: dateFilter || undefined, includeResolved })
      .then((data) => {
        setEntries(Array.isArray(data) ? data : []);
        setError('');
      })
      .catch((err) => {
        console.error(err);
        setError(t('admin.waitlist.loadError'));
      })
      .finally(() => setLoading(false));
  }, [dateFilter, includeResolved, t]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!socket) return undefined;
    const reload = () => load();
    socket.on('waitlist_joined', reload);
    return () => {
      socket.off('waitlist_joined', reload);
    };
  }, [socket, load]);

  const handleResolve = async (entry: WaitlistEntry) => {
    setWorking(true);
    try {
      await resolveWaitlistEntry(entry.id);
      load();
    } catch (err) {
      setError(translateApiError(err, 'admin.waitlist.actionError', t, i18n));
    } finally {
      setWorking(false);
    }
  };

  const handleDelete = async (entry: WaitlistEntry) => {
    if (!window.confirm(t('admin.waitlist.deleteConfirm', { name: `${entry.customer.firstName} ${entry.customer.lastName}` }))) return;
    setWorking(true);
    try {
      await deleteWaitlistEntry(entry.id);
      load();
    } catch (err) {
      setError(translateApiError(err, 'admin.waitlist.actionError', t, i18n));
    } finally {
      setWorking(false);
    }
  };

  const stateOf = (entry: WaitlistEntry) => {
    if (entry.isResolved) return `✅ ${t('admin.waitlist.stateResolved')}`;
    if (entry.notifiedAt) {
      const at = new Date(entry.notifiedAt).toLocaleTimeString(i18n.language, { hour: '2-digit', minute: '2-digit' });
      return `📣 ${t('admin.waitlist.stateNotified', { time: at })}`;
    }
    return `⏳ ${t('admin.waitlist.stateWaiting')}`;
  };

  return (
    <div>
      <div className="page-header">
        <h1>{t('admin.waitlist.title')}</h1>
        <p>{t('admin.waitlist.subtitle')}</p>
      </div>

      <div className="filters-bar" style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
        <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', fontSize: '0.85rem' }}>
          {t('admin.waitlist.filterDate')}
          <input type="date" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} />
        </label>
        <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', fontSize: '0.85rem' }}>
          <input
            type="checkbox"
            checked={includeResolved}
            onChange={(e) => setIncludeResolved(e.target.checked)}
          />
          {t('admin.waitlist.showResolved')}
        </label>
      </div>

      {loading && <div className="state-loading"><span className="spinner">⏳</span> {t('admin.waitlist.loading')}</div>}
      {error && <div className="state-error"><span>⚠️</span>{error}</div>}

      {!loading && !error && entries.length === 0 && (
        <div className="state-empty">
          <span style={{ fontSize: '2rem' }}>🕐</span>
          {t('admin.waitlist.empty')}
        </div>
      )}

      {!loading && !error && entries.length > 0 && (
        <div className="section-card">
          <div className="data-table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t('admin.waitlist.colDate')}</th>
                  <th>{t('admin.waitlist.colCustomer')}</th>
                  <th>{t('admin.waitlist.colContact')}</th>
                  <th>{t('admin.waitlist.colPax')}</th>
                  <th>{t('admin.waitlist.colState')}</th>
                  <th>{t('admin.waitlist.colActions')}</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.id} style={{ opacity: entry.isResolved ? 0.6 : 1 }}>
                    <td style={{ textTransform: 'capitalize' }}>
                      {new Date(entry.date).toLocaleDateString(i18n.language, { weekday: 'short', day: 'numeric', month: 'short' })}
                    </td>
                    <td>
                      {entry.customer.firstName} {entry.customer.lastName}
                      {entry.customer.isVip && ' ⭐'}
                    </td>
                    <td style={{ fontSize: '0.82rem' }}>
                      {entry.customer.email}
                      <br />
                      {entry.customer.phone}
                    </td>
                    <td>👥 {entry.pax}</td>
                    <td>{stateOf(entry)}</td>
                    <td>
                      {!entry.isResolved && (
                        <div style={{ display: 'flex', gap: '0.75rem' }}>
                          <button
                            onClick={() => handleResolve(entry)}
                            disabled={working}
                            style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', textDecoration: 'underline', fontSize: '0.8rem' }}
                          >
                            {t('admin.waitlist.resolve')}
                          </button>
                          <button
                            onClick={() => handleDelete(entry)}
                            disabled={working}
                            style={{ background: 'none', border: 'none', color: 'var(--accent-danger)', cursor: 'pointer', textDecoration: 'underline', fontSize: '0.8rem' }}
                          >
                            {t('admin.common.delete')}
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
