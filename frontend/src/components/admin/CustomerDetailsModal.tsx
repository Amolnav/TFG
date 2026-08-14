
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  getCustomerById,
  updateCustomer,
  addCustomerNote,
  toggleCustomerVip,
  toggleCustomerBlacklist,
  exportCustomerData,
  anonymizeCustomer,
} from '../../services/api';
import { getSessionRole } from '../../utils/session';
import type { Customer } from '../../types';

interface CustomerDetailsModalProps {
  customerId: string;
  onClose: () => void;
  onUpdate?: () => void;
}

export default function CustomerDetailsModal({
  customerId,
  onClose,
  onUpdate,
}: CustomerDetailsModalProps) {
  const { t, i18n } = useTranslation();
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [newNote, setNewNote] = useState('');
  const [isAddingNote, setIsAddingNote] = useState(false);
  // BUG-52: formulario inline para el motivo de blacklist (sustituye a prompt())
  const [showBlacklistForm, setShowBlacklistForm] = useState(false);
  const [blacklistReason, setBlacklistReason] = useState('');

  useEffect(() => {
    // BUG-52: guarda contra respuestas obsoletas si cambia el cliente
    // mientras la petición anterior sigue en vuelo
    let cancelled = false;
    const fetchDetails = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const details = await getCustomerById(customerId);
        if (cancelled) return;
        setEditingCustomer(details);
      } catch (err) {
        if (cancelled) return;
        console.error('Error fetching customer details:', err);
        setError(t('admin.customerModal.loadError'));
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    fetchDetails();
    return () => {
      cancelled = true;
    };
  }, [customerId, t]);

  const handleSaveCustomer = async () => {
    if (!editingCustomer) return;

    setIsSaving(true);
    try {
      const updateData = {
        allergens: editingCustomer.allergens,
        tags: editingCustomer.tags,
        preferences: editingCustomer.preferences,
        birthday: editingCustomer.birthday,
      };

      await updateCustomer(editingCustomer.id, updateData);
      if (onUpdate) onUpdate();

      // Close modal after success
      onClose();
    } catch (err) {
      const errorMessage =
        (err as { response?: { data?: { message: string } } })?.response?.data
          ?.message || t('admin.customerModal.saveError');
      setError(errorMessage);
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddNote = async () => {
    if (!editingCustomer || !newNote.trim()) return;

    setIsAddingNote(true);
    try {
      await addCustomerNote(editingCustomer.id, newNote);
      setNewNote('');
      // Refresh customer details to show new note
      const details = await getCustomerById(editingCustomer.id);
      setEditingCustomer(details);
      if (onUpdate) onUpdate();
    } catch (err) {
      const errorMessage =
        (err as { response?: { data?: { message: string } } })?.response?.data
          ?.message || t('admin.customerModal.noteError');
      setError(errorMessage);
    } finally {
      setIsAddingNote(false);
    }
  };

  const handleToggleVip = async () => {
    if (!editingCustomer) return;

    setIsSaving(true);
    try {
      const newVipStatus = !editingCustomer.isVip;
      await toggleCustomerVip(editingCustomer.id, newVipStatus);

      setEditingCustomer({
        ...editingCustomer,
        isVip: newVipStatus,
        tags: newVipStatus
          ? [...(editingCustomer.tags || []), 'VIP'].filter(
              (tag, i, a) => a.indexOf(tag) === i
            )
          : (editingCustomer.tags || []).filter((tag) => tag !== 'VIP'),
      });
      if (onUpdate) onUpdate();
    } catch (err) {
      const errorMessage =
        (err as { response?: { data?: { message: string } } })?.response?.data
          ?.message || t('admin.customerModal.vipError');
      setError(errorMessage);
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleBlacklist = () => {
    if (!editingCustomer) return;

    if (!editingCustomer.isBlacklisted) {
      // BUG-52: pedir el motivo con un formulario inline en el modal
      setBlacklistReason('');
      setShowBlacklistForm(true);
      return;
    }

    // Quitar de la blacklist no necesita motivo
    applyBlacklistChange(false, undefined);
  };

  const applyBlacklistChange = async (newBlacklistStatus: boolean, reason?: string) => {
    if (!editingCustomer) return;

    setIsSaving(true);
    try {
      await toggleCustomerBlacklist(
        editingCustomer.id,
        newBlacklistStatus,
        reason || undefined
      );

      setEditingCustomer({
        ...editingCustomer,
        isBlacklisted: newBlacklistStatus,
        blacklistReason: newBlacklistStatus ? reason : undefined,
        tags: newBlacklistStatus
          ? [...(editingCustomer.tags || []), 'BLACKLIST'].filter(
              (tag, i, a) => a.indexOf(tag) === i
            )
          : (editingCustomer.tags || []).filter((tag) => tag !== 'BLACKLIST'),
      });
      setShowBlacklistForm(false);
      setBlacklistReason('');
      if (onUpdate) onUpdate();
    } catch (err) {
      const errorMessage =
        (err as { response?: { data?: { message: string } } })?.response?.data
          ?.message || t('admin.customerModal.blacklistError');
      setError(errorMessage);
    } finally {
      setIsSaving(false);
    }
  };

  const updateEditingField = (
    field: keyof Customer,
    value: string | number | boolean | string[] | null | undefined
  ) => {
    if (editingCustomer) {
      setEditingCustomer({
        ...editingCustomer,
        [field]: value,
      });
    }
  };

  const toggleTag = (tag: string) => {
    if (!editingCustomer) return;

    const newTags = editingCustomer.tags?.includes(tag)
      ? editingCustomer.tags.filter((existing) => existing !== tag)
      : [...(editingCustomer.tags || []), tag];

    updateEditingField('tags', newTags);
  };

  // ── N4.4: RGPD — exportación y anonimización ─────────────────────────

  const handleGdprExport = async () => {
    if (!editingCustomer) return;
    try {
      const data = await exportCustomerData(editingCustomer.id);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `cliente-${editingCustomer.id.slice(0, 8)}.json`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      setError(t('admin.customerModal.gdprExportError'));
    }
  };

  const handleGdprAnonymize = async () => {
    if (!editingCustomer) return;
    if (!window.confirm(t('admin.customerModal.gdprAnonymizeConfirm'))) return;
    setIsSaving(true);
    try {
      await anonymizeCustomer(editingCustomer.id);
      if (onUpdate) onUpdate();
      onClose();
    } catch (err) {
      console.error(err);
      setError(t('admin.customerModal.gdprAnonymizeError'));
    } finally {
      setIsSaving(false);
    }
  };

  // BUG-52: el clic en el overlay ya NO cierra el modal (solo la X o los
  // botones), para no descartar cambios sin querer.
  if (isLoading) {
    return (
      <div className="modal-overlay">
        <div className="modal">
          <div className="modal-body">{t('admin.customerModal.loading')}</div>
        </div>
      </div>
    );
  }

  if (error && !editingCustomer) {
    return (
      <div className="modal-overlay">
        <div className="modal">
          <div className="modal-header">
            <h2>{t('admin.customerModal.errorTitle')}</h2>
            <button className="modal-close" onClick={onClose}>✕</button>
          </div>
          <div className="modal-body">{error}</div>
        </div>
      </div>
    );
  }

  if (!editingCustomer) return null;

  return (
    <div className="modal-overlay">
      <div className="modal modal--large">
        <div className="modal-header">
          <h2>
            {editingCustomer.firstName} {editingCustomer.lastName}
          </h2>
          <button className="modal-close" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="modal-body">
          {error && <div className="customers-error">❌ {error}</div>}

          {/* Datos de Contacto */}
          <div className="modal-section">
            <h3>📋 {t('admin.customerModal.contactData')}</h3>
            <div className="modal-grid">
              <div>
                <label>{t('admin.customerModal.emailLabel')}</label>
                <input
                  type="email"
                  value={editingCustomer.email}
                  disabled
                  className="form-input form-input--disabled"
                />
              </div>
              <div>
                <label>{t('admin.customerModal.phoneLabel')}</label>
                <input
                  type="tel"
                  value={editingCustomer.phone || ''}
                  disabled
                  className="form-input form-input--disabled"
                />
              </div>
            </div>

            {((editingCustomer.previousEmails?.length || 0) > 1 ||
               (editingCustomer.previousPhones?.length || 0) > 1 ||
               (editingCustomer.previousNames?.length || 0) > 1) && (
              <div className="modal-section-accent" style={{
                marginTop: '1.5rem',
                padding: '1rem',
                borderRadius: '12px',
                background: 'var(--accent-soft)',
                border: '1px solid var(--border)'
              }}>
                <h4 style={{ margin: '0 0 0.75rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem', color: 'var(--primary)' }}>
                  🕒 {t('admin.customerModal.identityHistory')}
                </h4>

                <div style={{ display: 'grid', gap: '1rem' }}>
                  {(editingCustomer.previousEmails?.length || 0) > 1 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                      <span style={{ fontSize: '0.75rem', fontWeight: 600, opacity: 0.6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        {t('admin.customerModal.otherEmails')}
                      </span>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                        {editingCustomer.previousEmails?.filter(e => e !== editingCustomer.email).map(e => (
                          <span key={e} className="customer-badge" style={{
                            background: 'var(--card-bg)',
                            color: 'var(--text-dark)',
                            border: '1px solid var(--border)',
                            fontSize: '0.75rem',
                            padding: '0.2rem 0.6rem',
                            borderRadius: '20px',
                            boxShadow: 'var(--shadow-sm)'
                          }}>{e}</span>
                        ))}
                      </div>
                    </div>
                  )}

                  {(editingCustomer.previousPhones?.length || 0) > 1 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                      <span style={{ fontSize: '0.75rem', fontWeight: 600, opacity: 0.6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        {t('admin.customerModal.otherPhones')}
                      </span>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                        {editingCustomer.previousPhones?.filter(p => p !== editingCustomer.phone).map(p => (
                          <span key={p} className="customer-badge" style={{
                            background: 'var(--card-bg)',
                            color: 'var(--text-dark)',
                            border: '1px solid var(--border)',
                            fontSize: '0.75rem',
                            padding: '0.2rem 0.6rem',
                            borderRadius: '20px',
                            boxShadow: 'var(--shadow-sm)'
                          }}>{p}</span>
                        ))}
                      </div>
                    </div>
                  )}

                  {(editingCustomer.previousNames?.length || 0) > 1 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                      <span style={{ fontSize: '0.75rem', fontWeight: 600, opacity: 0.6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        {t('admin.customerModal.otherNames')}
                      </span>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                        {editingCustomer.previousNames?.filter(n => n !== `${editingCustomer.firstName} ${editingCustomer.lastName}`.trim()).map(n => (
                          <span key={n} className="customer-badge" style={{
                            background: 'var(--card-bg)',
                            color: 'var(--text-dark)',
                            border: '1px solid var(--border)',
                            fontSize: '0.75rem',
                            padding: '0.2rem 0.6rem',
                            borderRadius: '20px',
                            boxShadow: 'var(--shadow-sm)'
                          }}>{n}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Estadísticas */}
          <div className="modal-section">
            <h3>📊 {t('admin.customerModal.stats')}</h3>
            <div className="modal-grid">
              <div>
                <label>{t('admin.customerModal.totalVisits')}</label>
                <input
                  type="number"
                  value={editingCustomer.totalVisits}
                  disabled
                  className="form-input form-input--disabled"
                />
              </div>
              <div>
                <label>{t('admin.customerModal.noShows')}</label>
                <input
                  type="number"
                  value={editingCustomer.totalNoShows}
                  disabled
                  className="form-input form-input--disabled"
                />
              </div>
            </div>
          </div>

          {/* Alergias */}
          <div className="modal-section">
            <h3>🚨 {t('admin.customerModal.allergies')}</h3>
            <textarea
              value={editingCustomer.allergens?.join(', ') || ''}
              onChange={(e) => {
                const val = e.target.value;
                const allergensArr = val.split(',').map(a => a.trim()).filter(a => a !== '');
                updateEditingField('allergens', allergensArr);
              }}
              placeholder={t('admin.customerModal.allergiesPlaceholder')}
              className="form-textarea"
              rows={2}
            />
            <p className="form-help-text" style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
               {t('admin.customerModal.allergiesHelp')}
            </p>
          </div>

          {/* Preferencias */}
          <div className="modal-section">
            <h3>📝 {t('admin.customerModal.preferences')}</h3>
            <textarea
              value={editingCustomer.preferences || ''}
              onChange={(e) =>
                updateEditingField('preferences', e.target.value)
              }
              placeholder={t('admin.customerModal.preferencesPlaceholder')}
              className="form-textarea"
              rows={4}
            />
          </div>

          {/* Cumpleaños */}
          <div className="modal-section">
            <h3>🎂 {t('admin.customerModal.birthday')}</h3>
            <input
              type="date"
              value={editingCustomer.birthday?.split('T')[0] || ''}
              onChange={(e) =>
                updateEditingField('birthday', e.target.value || null)
              }
              className="form-input"
            />
          </div>

          {/* VIP & Blacklist Toggle */}
          <div className="modal-section">
            <h3>⚡ {t('admin.customerModal.customerStatus')}</h3>
            <div className="status-toggles">
              <button
                className={`status-toggle ${
                  editingCustomer.isVip ? 'status-toggle--active' : ''
                }`}
                onClick={handleToggleVip}
                disabled={isSaving}
              >
                <span className="status-toggle__icon">⭐</span>
                <span className="status-toggle__label">
                  {editingCustomer.isVip ? t('admin.customerModal.isVip') : t('admin.customerModal.markVip')}
                </span>
              </button>

              <button
                className={`status-toggle ${
                  editingCustomer.isBlacklisted
                    ? 'status-toggle--blacklist'
                    : ''
                }`}
                onClick={handleToggleBlacklist}
                disabled={isSaving}
              >
                <span className="status-toggle__icon">🚫</span>
                <span className="status-toggle__label">
                  {editingCustomer.isBlacklisted
                    ? t('admin.customerModal.inBlacklist')
                    : t('admin.customerModal.addBlacklist')}
                </span>
              </button>
            </div>

            {/* BUG-52: formulario inline de motivo de blacklist */}
            {showBlacklistForm && !editingCustomer.isBlacklisted && (
              <div
                style={{
                  marginTop: '0.75rem',
                  padding: '0.75rem',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.5rem',
                }}
              >
                <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>
                  {t('admin.customerModal.blacklistFormTitle')}
                </label>
                <input
                  type="text"
                  className="form-input"
                  value={blacklistReason}
                  onChange={(e) => setBlacklistReason(e.target.value)}
                  placeholder={t('admin.customerModal.blacklistReasonPlaceholder')}
                  autoFocus
                />
                <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                  <button
                    className="btn btn--secondary btn--small"
                    onClick={() => {
                      setShowBlacklistForm(false);
                      setBlacklistReason('');
                    }}
                    disabled={isSaving}
                  >
                    {t('admin.common.cancel')}
                  </button>
                  <button
                    className="btn btn--primary btn--small"
                    onClick={() => applyBlacklistChange(true, blacklistReason.trim())}
                    disabled={isSaving || !blacklistReason.trim()}
                  >
                    {t('admin.customerModal.confirmBlacklist')}
                  </button>
                </div>
              </div>
            )}

            {editingCustomer.isBlacklisted && editingCustomer.blacklistReason && (
              <div className="blacklist-reason">
                <strong>{t('admin.customerModal.reasonLabel')}</strong> {editingCustomer.blacklistReason}
              </div>
            )}
          </div>

          {/* Etiquetas */}
          <div className="modal-section">
            <h3>🏷️ {t('admin.customerModal.tags')}</h3>
            <div className="tags-list">
              {['Cumpleaños', 'Evento Especial', 'Referencia'].map(
                (tag) => (
                  <label key={tag} className="tag-checkbox">
                    <input
                      type="checkbox"
                      checked={
                        editingCustomer.tags?.includes(tag) || false
                      }
                    onChange={() => {
                        if (tag === 'VIP' || tag === 'BLACKLIST') {
                          return;
                        }
                        toggleTag(tag);
                      }}
                    />
                    <span>{tag}</span>
                  </label>
                )
              )}
            </div>
          </div>

          {/* Notas del Staff */}
          <div className="modal-section">
            <h3>💬 {t('admin.customerModal.staffNotes')}</h3>
            <div className="notes-form">
              <textarea
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                placeholder={t('admin.customerModal.notePlaceholder')}
                className="form-textarea"
                rows={2}
              />
              <button
                className="btn btn--primary btn--small"
                onClick={handleAddNote}
                disabled={isAddingNote || !newNote.trim()}
              >
                {isAddingNote ? t('admin.customerModal.addingNote') : t('admin.customerModal.addNote')}
              </button>
            </div>

            {editingCustomer.notes &&
              editingCustomer.notes.length > 0 && (
                <div className="notes-list">
                  {editingCustomer.notes.map(
                    (note: { id: string; note: string; createdBy: string; createdAt: string }) => (
                    <div key={note.id} className="note-item">
                      <div className="note-header">
                        <strong>{note.createdBy}</strong>
                        <span className="note-date">
                          {new Date(note.createdAt).toLocaleDateString(
                            i18n.language
                          )}
                        </span>
                      </div>
                      <p className="note-content">{note.note}</p>
                    </div>
                  ))}
                </div>
              )}
          </div>
        </div>

        <div className="modal-footer">
          {/* N4.4: RGPD — exportar (todos) y anonimizar (solo ADMIN) */}
          <div style={{ display: 'flex', gap: '0.75rem', marginRight: 'auto' }}>
            <button
              className="btn btn--secondary"
              onClick={handleGdprExport}
              disabled={isSaving}
              title={t('admin.customerModal.gdprExportTitle')}
            >
              📦 {t('admin.customerModal.gdprExport')}
            </button>
            {getSessionRole() === 'ADMIN' && (
              <button
                className="btn btn--secondary"
                onClick={handleGdprAnonymize}
                disabled={isSaving}
                style={{ color: 'var(--accent-danger)' }}
                title={t('admin.customerModal.gdprAnonymizeTitle')}
              >
                🕵️ {t('admin.customerModal.gdprAnonymize')}
              </button>
            )}
          </div>
          <button
            className="btn btn--secondary"
            onClick={onClose}
          >
            {t('admin.common.cancel')}
          </button>
          <button
            className="btn btn--primary"
            onClick={handleSaveCustomer}
            disabled={isSaving}
          >
            {isSaving ? t('admin.common.saving') : t('admin.common.saveChanges')}
          </button>
        </div>
      </div>
    </div>
  );
}
