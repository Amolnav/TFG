
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getZones, createZone, updateZone, createTable, updateTable, deleteTable, deleteZone } from '../../services/api';
import '../../styles/pages/admin/AdminPages.css';

interface TableItem {
  id: number;
  name: string;
  minCapacity: number;
  maxCapacity: number;
  isActive: boolean;
}

interface ZoneWithTables {
  id: number;
  name: string;
  description?: string;
  isActive: boolean;
  displayOrder?: number;
  tables: TableItem[];
}

export default function MesasPage() {
  const { t } = useTranslation();
  const [zones, setZones] = useState<ZoneWithTables[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // BUG-50: deshabilita los botones de guardar durante el envío (evita duplicados)
  const [saving, setSaving] = useState(false);

  // Modals state
  const [isZoneModalOpen, setIsZoneModalOpen] = useState(false);
  const [editingZone, setEditingZone] = useState<ZoneWithTables | null>(null);

  const [isTableModalOpen, setIsTableModalOpen] = useState(false);
  const [editingTable, setEditingTable] = useState<TableItem | null>(null);
  const [activeZoneId, setActiveZoneId] = useState<number | null>(null);

  const loadZones = useCallback(() => {
    setLoading(true);
    getZones(true)
      .then((data) => {
        setZones(Array.isArray(data) ? data : []);
        setError(''); // BUG-50: una recarga con éxito limpia el error anterior
      })
      .catch((err) => {
        console.error(err);
        setError(t('admin.tables.loadError'));
      })
      .finally(() => setLoading(false));
  }, [t]);

  // Carga inicial de datos: patrón idiomático de fetch dentro de un efecto
  useEffect(() => {
    loadZones();
  }, [loadZones]);

  const totalTables = zones.reduce((s, z) => s + z.tables.length, 0);
  const activeTables = zones.reduce((s, z) => s + z.tables.filter((tbl) => tbl.isActive).length, 0);

  const handleSaveZone = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const payload = {
      name: formData.get('name') as string,
      description: formData.get('description') as string,
      isActive: formData.get('isActive') === 'on',
      displayOrder: Number(formData.get('displayOrder')) || 0,
    };

    setSaving(true);
    try {
      if (editingZone) {
        await updateZone(editingZone.id, payload);
      } else {
        await createZone(payload);
      }
      setIsZoneModalOpen(false);
      loadZones();
    } catch (err) {
      console.error(err);
      alert(t('admin.tables.saveZoneError'));
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteZone = async () => {
    if (!editingZone) return;
    if (!window.confirm(t('admin.tables.deleteZoneConfirm', { name: editingZone.name }))) return;

    setSaving(true);
    try {
      await deleteZone(editingZone.id);
      setIsZoneModalOpen(false);
      loadZones();
    } catch (err) {
      console.error(err);
      alert(t('admin.tables.deleteZoneError'));
    } finally {
      setSaving(false);
    }
  };

  const handleSaveTable = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const payload = {
      name: formData.get('name') as string,
      minCapacity: Number(formData.get('minCapacity')),
      maxCapacity: Number(formData.get('maxCapacity')),
      isActive: formData.get('isActive') === 'on',
    };

    setSaving(true);
    try {
      if (editingTable) {
        await updateTable(editingTable.id, payload);
      } else if (activeZoneId) {
        await createTable(activeZoneId, payload);
      }
      setIsTableModalOpen(false);
      loadZones();
    } catch (err) {
      console.error(err);
      alert(t('admin.tables.saveTableError'));
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteTable = async () => {
    if (!editingTable) return;
    if (!window.confirm(t('admin.tables.deleteTableConfirm', { name: editingTable.name }))) return;

    setSaving(true);
    try {
      await deleteTable(editingTable.id);
      setIsTableModalOpen(false);
      loadZones();
    } catch (err) {
      console.error(err);
      alert(t('admin.tables.deleteTableError'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1>{t('admin.tables.title')}</h1>
          <p>{t('admin.tables.subtitle')}</p>
        </div>
        <button
          onClick={() => {
            setEditingZone(null);
            setIsZoneModalOpen(true);
          }}
          className="btn btn-primary"
          style={{ padding: '0.6rem 1.25rem', background: 'var(--accent-action)', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
        >
          {t('admin.tables.newZone')}
        </button>
      </div>

      {loading && <div className="state-loading"><span className="spinner">⏳</span> {t('admin.tables.loading')}</div>}
      {error && <div className="state-error"><span>⚠️</span>{error}</div>}

      {!loading && !error && (
        <>
          <div className="widgets-grid" style={{ marginBottom: '1.75rem' }}>
            <div className="widget-card accent-primary">
              <div className="widget-card__icon">🏢</div>
              <div className="widget-card__label">{t('admin.tables.zonesWidget')}</div>
              <div className="widget-card__value">{zones.length}</div>
              <div className="widget-card__sub">{t('admin.tables.activeCountF', { n: zones.filter(z => z.isActive).length })}</div>
            </div>
            <div className="widget-card accent-decor">
              <div className="widget-card__icon">🍽️</div>
              <div className="widget-card__label">{t('admin.tables.totalTablesWidget')}</div>
              <div className="widget-card__value">{totalTables}</div>
              <div className="widget-card__sub">{t('admin.tables.activeCountF', { n: activeTables })}</div>
            </div>
          </div>

          {zones.length === 0 ? (
            <div className="state-empty">
              <span style={{ fontSize: '2rem' }}>🏠</span>
              {t('admin.tables.empty')}
            </div>
          ) : (
            <div className="zones-grid">
              {zones.map((zone) => (
                <div key={zone.id} className="zone-card" style={{ opacity: zone.isActive ? 1 : 0.7 }}>
                  <div className="zone-card__header">
                    <span className="zone-card__name">
                      🏢 {zone.name}
                      {!zone.isActive && <span style={{ marginLeft: '0.5rem', fontSize: '0.75rem', opacity: 0.6 }}>{t('admin.tables.inactiveZone')}</span>}
                    </span>
                    <button
                      onClick={() => {
                        setEditingZone(zone);
                        setIsZoneModalOpen(true);
                      }}
                      style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', textDecoration: 'underline', fontSize: '0.8rem' }}
                    >
                      {t('admin.common.edit')}
                    </button>
                  </div>
                  {zone.description && (
                    <div style={{ padding: '0.6rem 1.25rem', fontSize: '0.82rem', color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>
                      {zone.description}
                    </div>
                  )}
                  <ul className="zone-card__tables">
                    {zone.tables.length === 0 ? (
                      <li className="zone-table-row" style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>
                        {t('admin.tables.noTables')}
                      </li>
                    ) : (
                      zone.tables.map((table) => (
                        <li key={table.id} className="zone-table-row" style={{ opacity: table.isActive ? 1 : 0.6 }}>
                          <div>
                            <span className="zone-table-row__name">{table.name}</span>
                            {!table.isActive && (
                              <span style={{ marginLeft: '0.4rem', fontSize: '0.72rem', color: 'var(--accent-action)' }}>{t('admin.tables.inactiveTable')}</span>
                            )}
                          </div>
                          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                            <span className="zone-table-row__cap">
                              👤 {table.minCapacity}–{table.maxCapacity} px
                            </span>
                            <button
                              onClick={() => {
                                setEditingTable(table);
                                setActiveZoneId(zone.id);
                                setIsTableModalOpen(true);
                              }}
                              style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontSize: '0.8rem', textDecoration: 'underline' }}
                            >
                              {t('admin.common.edit')}
                            </button>
                          </div>
                        </li>
                      ))
                    )}
                  </ul>
                  <div style={{ padding: '0.7rem', borderTop: '1px solid var(--border)', textAlign: 'center', background: 'var(--bg-light)' }}>
                    <button
                      onClick={() => {
                        setEditingTable(null);
                        setActiveZoneId(zone.id);
                        setIsTableModalOpen(true);
                      }}
                      style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontWeight: 'bold' }}
                    >
                      {t('admin.tables.addTable')}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Zone Modal */}
      {isZoneModalOpen && (
        <div className="admin-modal-overlay">
          <div className="admin-modal">
            <div className="admin-modal__header">
              <h2>{editingZone ? t('admin.tables.editZone') : t('admin.tables.newZoneTitle')}</h2>
              <button className="admin-modal__close" onClick={() => setIsZoneModalOpen(false)}>×</button>
            </div>
            <form onSubmit={handleSaveZone}>
              <div className="admin-modal__body">
                <div className="admin-modal__form-group">
                  <label>{t('admin.common.name')}</label>
                  <input type="text" name="name" required defaultValue={editingZone?.name || ''} placeholder={t('admin.tables.zoneNamePlaceholder')} />
                </div>
                <div className="admin-modal__form-group">
                  <label>{t('admin.common.description')}</label>
                  <textarea name="description" rows={2} defaultValue={editingZone?.description || ''}></textarea>
                </div>
                <div className="admin-modal__form-group">
                  <label>{t('admin.common.displayOrder')}</label>
                  <input type="number" name="displayOrder" defaultValue={editingZone?.displayOrder || 0} />
                </div>
                <div className="admin-modal__form-group" style={{ flexDirection: 'row', alignItems: 'center', gap: '0.5rem' }}>
                  <input type="checkbox" name="isActive" id="zoneIsActive" defaultChecked={editingZone ? editingZone.isActive : true} />
                  <label htmlFor="zoneIsActive">{t('admin.tables.zoneActive')}</label>
                </div>
              </div>
              <div className="admin-modal__footer">
                {editingZone && (
                  <button type="button" onClick={handleDeleteZone} disabled={saving} style={{ padding: '0.5rem 1rem', background: 'var(--accent-danger)', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', marginRight: 'auto' }}>
                    {t('admin.common.delete')}
                  </button>
                )}
                <button type="button" onClick={() => setIsZoneModalOpen(false)} style={{ padding: '0.5rem 1rem', background: 'var(--input-bg)', color: 'var(--text-dark)', border: '1px solid var(--border)', borderRadius: '4px', cursor: 'pointer' }}>
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

      {/* Table Modal */}
      {isTableModalOpen && (
        <div className="admin-modal-overlay">
          <div className="admin-modal">
            <div className="admin-modal__header">
              <h2>{editingTable ? t('admin.tables.editTable') : t('admin.tables.newTableTitle')}</h2>
              <button className="admin-modal__close" onClick={() => setIsTableModalOpen(false)}>×</button>
            </div>
            <form onSubmit={handleSaveTable}>
              <div className="admin-modal__body">
                <div className="admin-modal__form-group">
                  <label>{t('admin.tables.tableName')}</label>
                  <input type="text" name="name" required defaultValue={editingTable?.name || ''} placeholder={t('admin.tables.tableNamePlaceholder')} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div className="admin-modal__form-group">
                    <label>{t('admin.tables.minCapacity')}</label>
                    <input type="number" name="minCapacity" required min="1" defaultValue={editingTable?.minCapacity || 1} />
                  </div>
                  <div className="admin-modal__form-group">
                    <label>{t('admin.tables.maxCapacity')}</label>
                    <input type="number" name="maxCapacity" required min="1" defaultValue={editingTable?.maxCapacity || 4} />
                  </div>
                </div>
                <div className="admin-modal__form-group" style={{ flexDirection: 'row', alignItems: 'center', gap: '0.5rem', marginTop: '1rem' }}>
                  <input type="checkbox" name="isActive" id="tableIsActive" defaultChecked={editingTable ? editingTable.isActive : true} />
                  <label htmlFor="tableIsActive">{t('admin.tables.tableActive')}</label>
                </div>
              </div>
              <div className="admin-modal__footer">
                {editingTable && (
                  <button type="button" onClick={handleDeleteTable} disabled={saving} style={{ padding: '0.5rem 1rem', background: 'var(--accent-danger)', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', marginRight: 'auto' }}>
                    {t('admin.common.delete')}
                  </button>
                )}
                <button type="button" onClick={() => setIsTableModalOpen(false)} style={{ padding: '0.5rem 1rem', background: 'var(--input-bg)', color: 'var(--text-dark)', border: '1px solid var(--border)', borderRadius: '4px', cursor: 'pointer' }}>
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
