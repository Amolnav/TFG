
import { useCallback, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getStaff, createStaff, updateStaff, deleteStaff } from '../../services/api';
import type { StaffMember } from '../../services/api';
import { getSessionUser } from '../../utils/session';
import { translateApiError } from '../../utils/apiErrors';
import '../../styles/pages/admin/AdminPages.css';

// N2.1: gestión del equipo (solo ADMIN). El backend aplica la autorización
// real y las guardas (último ADMIN, auto-modificación); aquí solo UX.
export default function EquipoPage() {
  const { t, i18n } = useTranslation();
  const sessionUser = getSessionUser();
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState('');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<StaffMember | null>(null);

  const loadStaff = useCallback(() => {
    setLoading(true);
    getStaff()
      .then((data) => {
        setStaff(Array.isArray(data) ? data : []);
        setError('');
      })
      .catch((err) => {
        console.error(err);
        setError(t('admin.team.loadError'));
      })
      .finally(() => setLoading(false));
  }, [t]);

  useEffect(() => {
    loadStaff();
  }, [loadStaff]);

  if (sessionUser?.role !== 'ADMIN') {
    return <Navigate to="/admin" replace />;
  }

  const activeCount = staff.filter((m) => m.isActive).length;
  const adminCount = staff.filter((m) => m.role === 'ADMIN' && m.isActive).length;

  const openCreate = () => {
    setEditingMember(null);
    setModalError('');
    setIsModalOpen(true);
  };

  const openEdit = (member: StaffMember) => {
    setEditingMember(member);
    setModalError('');
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const name = (formData.get('name') as string).trim();
    const role = formData.get('role') as 'ADMIN' | 'STAFF';
    const password = (formData.get('password') as string) || '';

    setSaving(true);
    setModalError('');
    try {
      if (editingMember) {
        const payload: { name?: string; role?: 'ADMIN' | 'STAFF'; password?: string } = { name, role };
        if (password) payload.password = password;
        await updateStaff(editingMember.id, payload);
      } else {
        await createStaff({
          email: (formData.get('email') as string).trim(),
          name,
          role,
          password,
        });
      }
      setIsModalOpen(false);
      loadStaff();
    } catch (err) {
      console.error(err);
      setModalError(translateApiError(err, 'admin.team.saveError', t, i18n));
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (member: StaffMember) => {
    setSaving(true);
    try {
      await updateStaff(member.id, { isActive: !member.isActive });
      setError('');
      loadStaff();
    } catch (err) {
      console.error(err);
      setError(translateApiError(err, 'admin.team.saveError', t, i18n));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (member: StaffMember) => {
    if (!window.confirm(t('admin.team.deleteConfirm', { name: member.name }))) return;
    setSaving(true);
    try {
      await deleteStaff(member.id);
      setError('');
      loadStaff();
    } catch (err) {
      console.error(err);
      setError(translateApiError(err, 'admin.team.deleteError', t, i18n));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1>{t('admin.team.title')}</h1>
          <p>{t('admin.team.subtitle')}</p>
        </div>
        <button
          onClick={openCreate}
          className="btn btn-primary"
          style={{ padding: '0.6rem 1.25rem', background: 'var(--accent-action)', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
        >
          {t('admin.team.newMember')}
        </button>
      </div>

      {loading && <div className="state-loading"><span className="spinner">⏳</span> {t('admin.team.loading')}</div>}
      {error && <div className="state-error"><span>⚠️</span>{error}</div>}

      {!loading && (
        <>
          <div className="widgets-grid" style={{ marginBottom: '1.75rem' }}>
            <div className="widget-card accent-primary">
              <div className="widget-card__icon">🧑‍🍳</div>
              <div className="widget-card__label">{t('admin.team.membersWidget')}</div>
              <div className="widget-card__value">{staff.length}</div>
              <div className="widget-card__sub">{t('admin.team.activeCount', { n: activeCount })}</div>
            </div>
            <div className="widget-card accent-decor">
              <div className="widget-card__icon">🔑</div>
              <div className="widget-card__label">{t('admin.team.adminsWidget')}</div>
              <div className="widget-card__value">{adminCount}</div>
              <div className="widget-card__sub">{t('admin.team.adminsSub')}</div>
            </div>
          </div>

          <div className="section-card">
            <div className="data-table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{t('admin.team.colName')}</th>
                    <th>{t('admin.team.colEmail')}</th>
                    <th>{t('admin.team.colRole')}</th>
                    <th>{t('admin.team.colStatus')}</th>
                    <th>{t('admin.team.colActions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {staff.map((member) => {
                    const isSelf = member.id === sessionUser?.id;
                    return (
                      <tr key={member.id} style={{ opacity: member.isActive ? 1 : 0.6 }}>
                        <td>
                          {member.name}
                          {isSelf && (
                            <span style={{ marginLeft: '0.4rem', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                              ({t('admin.team.you')})
                            </span>
                          )}
                        </td>
                        <td>{member.email}</td>
                        <td>
                          <span className={`customer-badge ${member.role === 'ADMIN' ? 'customer-badge--vip' : 'customer-badge--tag'}`}>
                            {member.role === 'ADMIN' ? t('admin.team.roleAdmin') : t('admin.team.roleStaff')}
                          </span>
                        </td>
                        <td>
                          {member.isActive ? `🟢 ${t('admin.team.statusActive')}` : `⚪ ${t('admin.team.statusInactive')}`}
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                            <button
                              onClick={() => openEdit(member)}
                              style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', textDecoration: 'underline', fontSize: '0.8rem' }}
                            >
                              {t('admin.common.edit')}
                            </button>
                            {!isSelf && (
                              <>
                                <button
                                  onClick={() => handleToggleActive(member)}
                                  disabled={saving}
                                  style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', textDecoration: 'underline', fontSize: '0.8rem' }}
                                >
                                  {member.isActive ? t('admin.team.deactivate') : t('admin.team.activate')}
                                </button>
                                <button
                                  onClick={() => handleDelete(member)}
                                  disabled={saving}
                                  style={{ background: 'none', border: 'none', color: 'var(--accent-danger)', cursor: 'pointer', textDecoration: 'underline', fontSize: '0.8rem' }}
                                >
                                  {t('admin.common.delete')}
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {isModalOpen && (
        <div className="admin-modal-overlay">
          <div className="admin-modal">
            <div className="admin-modal__header">
              <h2>{editingMember ? t('admin.team.editTitle') : t('admin.team.newTitle')}</h2>
              <button className="admin-modal__close" onClick={() => setIsModalOpen(false)}>×</button>
            </div>
            <form onSubmit={handleSave}>
              <div className="admin-modal__body">
                {!editingMember && (
                  <div className="admin-modal__form-group">
                    <label>{t('admin.team.emailLabel')}</label>
                    <input type="email" name="email" required placeholder="nombre@ejemplo.com" autoComplete="off" />
                  </div>
                )}
                {editingMember && (
                  <div className="admin-modal__form-group">
                    <label>{t('admin.team.emailLabel')}</label>
                    <input type="email" value={editingMember.email} disabled />
                  </div>
                )}
                <div className="admin-modal__form-group">
                  <label>{t('admin.team.nameLabel')}</label>
                  <input type="text" name="name" required minLength={2} defaultValue={editingMember?.name || ''} />
                </div>
                <div className="admin-modal__form-group">
                  <label>{t('admin.team.roleLabel')}</label>
                  <select
                    name="role"
                    defaultValue={editingMember?.role || 'STAFF'}
                    disabled={editingMember?.id === sessionUser?.id}
                  >
                    <option value="STAFF">{t('admin.team.roleStaff')}</option>
                    <option value="ADMIN">{t('admin.team.roleAdmin')}</option>
                  </select>
                </div>
                <div className="admin-modal__form-group">
                  <label>{editingMember ? t('admin.team.passwordResetLabel') : t('admin.team.passwordLabel')}</label>
                  <input
                    type="password"
                    name="password"
                    required={!editingMember}
                    minLength={8}
                    placeholder={editingMember ? t('admin.team.passwordKeepPlaceholder') : ''}
                    autoComplete="new-password"
                  />
                  <small style={{ color: 'var(--text-muted)' }}>{t('admin.team.passwordHint')}</small>
                </div>
                {modalError && <div className="state-error" style={{ marginTop: '0.5rem' }}><span>⚠️</span>{modalError}</div>}
              </div>
              <div className="admin-modal__footer">
                <button type="button" onClick={() => setIsModalOpen(false)} style={{ padding: '0.5rem 1rem', background: 'var(--input-bg)', color: 'var(--text-dark)', border: '1px solid var(--border)', borderRadius: '4px', cursor: 'pointer' }}>
                  {t('admin.common.cancel')}
                </button>
                <button type="submit" disabled={saving} style={{ padding: '0.5rem 1rem', background: 'var(--accent-action)', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
                  {saving ? t('admin.common.saving') : t('admin.common.save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
