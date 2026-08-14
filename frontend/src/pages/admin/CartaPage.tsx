import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  getAdminMenu,
  createMenuCategory,
  updateMenuCategory,
  deleteMenuCategory,
  createMenuItem,
  updateMenuItem,
  deleteMenuItem,
  reorderMenuCategories,
  getSystemConfig,
  updateSystemConfig
} from '../../services/api';
import '../../styles/pages/admin/AdminPages.css';
import { DEFAULT_SPECIALTIES } from '../../constants/publicConfig';
import { EU_ALLERGENS, ALLERGEN_ICONS } from '../../constants/allergens';
import type { LocalizedText, MenuCategory, MenuItem, SpecialtiesConfig, SystemConfig } from '../../types';

// DnD Kit Imports
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';

// Sub-component for Sortable Category Card
function SortableCategoryCard({
  category,
  onEditCategory,
  onEditItem,
  onAddItem
}: {
  category: MenuCategory;
  onEditCategory: (c: MenuCategory) => void;
  onEditItem: (item: MenuItem, catId: number) => void;
  onAddItem: (catId: number) => void;
}) {
  const { t } = useTranslation();
  const {
    attributes,
    listeners,
    setNodeRef,
    transition,
    isDragging,
  } = useSortable({ id: category.id });

  const style = {
    transition,
    zIndex: isDragging ? 2 : 1,
    opacity: isDragging ? 0.3 : 1,
    border: isDragging ? '2px dashed var(--primary)' : undefined,
    pointerEvents: isDragging ? 'none' as const : 'auto' as const,
  };

  return (
    <div ref={setNodeRef} style={style} className="zone-card">
      <div
        className="zone-card__header"
        {...attributes}
        {...listeners}
        style={{ cursor: 'grab', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
      >
        <span className="zone-card__name">
          <span style={{ marginRight: '0.75rem', opacity: 0.5 }}>⠿</span>
          📂 {category.name}
          {!category.isActive && <span style={{ marginLeft: '0.5rem', fontSize: '0.75rem', opacity: 0.6, fontStyle: 'italic' }}>{t('admin.menu.inactiveCategory')}</span>}
        </span>
        <button
          onClick={(e) => {
            e.stopPropagation(); // Evitar disparar el drag
            onEditCategory(category);
          }}
          style={{ background: 'var(--input-bg)', border: '1px solid var(--border)', color: 'var(--primary)', cursor: 'pointer', fontSize: '0.75rem', padding: '0.2rem 0.5rem', borderRadius: '4px' }}
        >
          {t('admin.common.edit')}
        </button>
      </div>
      <ul className="zone-card__tables">
        {category.items.length === 0 ? (
          <li className="zone-table-row" style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>
            {t('admin.menu.noItems')}
          </li>
        ) : (
          category.items.map((item) => (
            <li key={item.id} className="zone-table-row" style={{ opacity: item.isActive ? 1 : 0.6 }}>
              <div style={{ flex: 1, paddingRight: '1rem' }}>
                <span className="zone-table-row__name">{item.name}</span>
                {!item.isActive && (
                  <span style={{ marginLeft: '0.4rem', fontSize: '0.72rem', color: 'var(--accent-action)' }}>{t('admin.menu.inactiveItem')}</span>
                )}
                {item.description && <p style={{ fontSize: '0.75rem', margin: 0, opacity: 0.7, color: 'var(--text-muted)' }}>{item.description}</p>}
              </div>
              <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexShrink: 0 }}>
                <span className="zone-table-row__cap" style={{ fontWeight: 'bold', color: 'var(--accent-action)', minWidth: '60px', textAlign: 'right' }}>
                  {item.price}
                </span>
                <button
                  onClick={() => onEditItem(item, category.id)}
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
          onClick={() => onAddItem(category.id)}
          style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontWeight: 'bold' }}
        >
          {t('admin.menu.addItem')}
        </button>
      </div>
    </div>
  );
}

export default function CartaPage() {
  const { t } = useTranslation();
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [systemConfig, setSystemConfig] = useState<SystemConfig>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeId, setActiveId] = useState<number | null>(null);
  const [overId, setOverId] = useState<number | null>(null);
  // BUG-50: deshabilita los botones de guardar durante el envío (evita duplicados)
  const [saving, setSaving] = useState(false);

  // Sensors for DnD
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // Avoid accidental drags when clicking buttons
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Modals state
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<MenuCategory | null>(null);

  const [isItemModalOpen, setIsItemModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [activeCategoryId, setActiveCategoryId] = useState<number | null>(null);

  const [editingSpecialties, setEditingSpecialties] = useState<boolean>(false);
  // BUG-46: el formulario trabaja SIEMPRE sobre una copia profunda. Con la
  // referencia directa, las ediciones (copias superficiales + mutación del
  // item) corrompían la constante DEFAULT_SPECIALTIES importada del módulo.
  const [specialtiesForm, setSpecialtiesForm] = useState<SpecialtiesConfig>(() => structuredClone(DEFAULT_SPECIALTIES));

  const loadMenu = useCallback(() => {
    setLoading(true);
    Promise.all([
      getAdminMenu(),
      getSystemConfig()
    ])
      .then(([menuData, configData]) => {
        setCategories(Array.isArray(menuData) ? menuData : []);
        setSystemConfig(configData);
        setError(''); // BUG-50: una recarga con éxito limpia el error anterior
      })
      .catch((err) => {
        console.error(err);
        setError(t('admin.menu.loadError'));
      })
      .finally(() => setLoading(false));
  }, [t]);

  // Carga inicial de datos: patrón idiomático de fetch dentro de un efecto
  useEffect(() => {
    loadMenu();
  }, [loadMenu]);

  // M5: los idiomas del editor salen de la configuración del despliegue
  const editorLanguages = (systemConfig.languages_supported || 'es,en,fr')
    .split(',')
    .map((lang) => lang.trim())
    .filter(Boolean);

  const handleEditSpecialtiesClick = () => {
    let parsedSpecialties: SpecialtiesConfig | null = null;
    try {
      if (systemConfig.specialties_config) {
        parsedSpecialties = JSON.parse(systemConfig.specialties_config);
      }
    } catch (e) {
      console.error(e);
    }

    // BUG-46: copia profunda para no mutar jamás DEFAULT_SPECIALTIES
    setSpecialtiesForm(structuredClone(parsedSpecialties || DEFAULT_SPECIALTIES));
    setEditingSpecialties(true);
  };

  // M2: N platos — añadir y quitar en vez de "los 3 platos" fijos
  const handleAddSpecialty = () => {
    const nextId = specialtiesForm.items.reduce((max, item) => Math.max(max, item.id), 0) + 1;
    setSpecialtiesForm({
      ...specialtiesForm,
      items: [...specialtiesForm.items, { id: nextId, name: {}, description: {}, image: '' }],
    });
  };

  const handleRemoveSpecialty = (index: number) => {
    setSpecialtiesForm({
      ...specialtiesForm,
      items: specialtiesForm.items.filter((_, i) => i !== index),
    });
  };

  const updateSpecialtyField = (index: number, field: 'name' | 'description', lang: string, value: string) => {
    const items = [...specialtiesForm.items];
    items[index] = { ...items[index], [field]: { ...items[index][field], [lang]: value } as LocalizedText };
    setSpecialtiesForm({ ...specialtiesForm, items });
  };

  const handleSaveSpecialties = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await updateSystemConfig({ specialties_config: JSON.stringify(specialtiesForm) });
      setEditingSpecialties(false);
      loadMenu();
    } catch (err) {
      console.error(err);
      alert(t('admin.menu.specialtiesUpdateError'));
    } finally {
      setSaving(false);
    }
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as number);
    setOverId(event.active.id as number);
  };

  const handleDragOver = (event: { over: { id: number | string } | null }) => {
    if (event.over) {
      setOverId(Number(event.over.id));
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    setOverId(null);

    if (over && active.id !== over.id) {
      const oldIndex = categories.findIndex((c) => c.id === active.id);
      const newIndex = categories.findIndex((c) => c.id === over.id);

      const newOrder = arrayMove(categories, oldIndex, newIndex);
      setCategories(newOrder);

      try {
        await reorderMenuCategories(newOrder.map(c => c.id));
      } catch (err) {
        console.error(err);
        alert(t('admin.menu.reorderError'));
        loadMenu(); // Rollback
      }
    }
  };

  const currentOverIndex = overId ? categories.findIndex(c => c.id === overId) : -1;

  const totalItems = categories.reduce((s, c) => s + c.items.length, 0);
  const activeItems = categories.reduce((s, c) => s + c.items.filter((i) => i.isActive).length, 0);

  const handleSaveCategory = async (e: React.FormEvent<HTMLFormElement>) => {
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
      if (editingCategory) {
        await updateMenuCategory(editingCategory.id, payload);
      } else {
        await createMenuCategory(payload);
      }
      setIsCategoryModalOpen(false);
      loadMenu();
    } catch (err) {
      console.error(err);
      alert(t('admin.menu.saveCategoryError'));
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCategory = async () => {
    if (!editingCategory) return;
    if (!window.confirm(t('admin.menu.deleteCategoryConfirm', { name: editingCategory.name }))) return;

    setSaving(true);
    try {
      await deleteMenuCategory(editingCategory.id);
      setIsCategoryModalOpen(false);
      loadMenu();
    } catch (err) {
      console.error(err);
      alert(t('admin.menu.deleteCategoryError'));
    } finally {
      setSaving(false);
    }
  };

  const handleSaveItem = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const payload = {
      name: formData.get('name') as string,
      description: formData.get('description') as string,
      price: formData.get('price') as string,
      isActive: formData.get('isActive') === 'on',
      displayOrder: Number(formData.get('displayOrder')) || 0,
      categoryId: activeCategoryId,
      // N3.3: alérgenos UE marcados + foto opcional
      allergens: formData.getAll('allergens') as string[],
      photoUrl: (formData.get('photoUrl') as string).trim() || null
    };

    setSaving(true);
    try {
      if (editingItem) {
        await updateMenuItem(editingItem.id, payload);
      } else {
        await createMenuItem(payload);
      }
      setIsItemModalOpen(false);
      loadMenu();
    } catch (err) {
      console.error(err);
      alert(t('admin.menu.saveItemError'));
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteItem = async () => {
    if (!editingItem) return;
    if (!window.confirm(t('admin.menu.deleteItemConfirm', { name: editingItem.name }))) return;

    setSaving(true);
    try {
      await deleteMenuItem(editingItem.id);
      setIsItemModalOpen(false);
      loadMenu();
    } catch (err) {
      console.error(err);
      alert(t('admin.menu.deleteItemError'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1>{t('admin.menu.title')}</h1>
          <p>{t('admin.menu.subtitle')}</p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button
            onClick={handleEditSpecialtiesClick}
            className="btn btn-secondary"
            style={{ padding: '0.6rem 1.25rem', background: 'var(--input-bg)', color: 'var(--text-dark)', border: '1px solid var(--border)', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
          >
            🌟 {t('admin.menu.featuredDishes')}
          </button>
          <button
            onClick={() => {
              setEditingCategory(null);
              setIsCategoryModalOpen(true);
            }}
            className="btn btn-primary"
            style={{ padding: '0.6rem 1.25rem', background: 'var(--accent-action)', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
          >
            {t('admin.menu.newCategory')}
          </button>
        </div>
      </div>

      {loading && <div className="state-loading"><span className="spinner">⏳</span> {t('admin.menu.loading')}</div>}
      {error && <div className="state-error"><span>⚠️</span>{error}</div>}

      {!loading && !error && (
        <>
          <div className="widgets-grid" style={{ marginBottom: '1.75rem' }}>
            <div className="widget-card accent-primary">
              <div className="widget-card__icon">📂</div>
              <div className="widget-card__label">{t('admin.menu.categoriesWidget')}</div>
              <div className="widget-card__value">{categories.length}</div>
              <div className="widget-card__sub">{t('admin.menu.activeCountF', { n: categories.filter(c => c.isActive).length })}</div>
            </div>
            <div className="widget-card accent-decor">
              <div className="widget-card__icon">🍽️</div>
              <div className="widget-card__label">{t('admin.menu.totalItemsWidget')}</div>
              <div className="widget-card__value">{totalItems}</div>
              <div className="widget-card__sub">{t('admin.menu.activeCountM', { n: activeItems })}</div>
            </div>
          </div>

          {categories.length === 0 ? (
            <div className="state-empty">
              <span style={{ fontSize: '2rem' }}>📜</span>
              {t('admin.menu.empty')}
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={categories.map(c => c.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="zones-grid">
                  {categories.map((category) => (
                    <SortableCategoryCard
                      key={category.id}
                      category={category}
                      onEditCategory={(c) => {
                        setEditingCategory(c);
                        setIsCategoryModalOpen(true);
                      }}
                      onEditItem={(item, catId) => {
                        setEditingItem(item);
                        setActiveCategoryId(catId);
                        setIsItemModalOpen(true);
                      }}
                      onAddItem={(catId) => {
                        setEditingItem(null);
                        setActiveCategoryId(catId);
                        setIsItemModalOpen(true);
                      }}
                    />
                  ))}
                </div>
              </SortableContext>

              <DragOverlay dropAnimation={null}>
                {activeId ? (
                  <div style={{
                    background: 'var(--accent-action)',
                    color: 'white',
                    padding: '0.75rem 1.5rem',
                    borderRadius: '50px',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
                    fontWeight: 900,
                    fontSize: '1.1rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    pointerEvents: 'none',
                    border: '2px solid white',
                    transform: 'scale(1.05)',
                    whiteSpace: 'nowrap'
                  }}>
                    <span style={{ fontSize: '1.4rem' }}>📍</span>
                    {t('admin.menu.movingToPosition', { position: currentOverIndex + 1 })}
                  </div>
                ) : null}
              </DragOverlay>
            </DndContext>
          )}
        </>
      )}

      {/* Category Modal */}
      {isCategoryModalOpen && (
        <div className="admin-modal-overlay">
          <div className="admin-modal">
            <div className="admin-modal__header">
              <h2>{editingCategory ? t('admin.menu.editCategory') : t('admin.menu.newCategoryTitle')}</h2>
              <button className="admin-modal__close" onClick={() => setIsCategoryModalOpen(false)}>×</button>
            </div>
            <form onSubmit={handleSaveCategory}>
              <div className="admin-modal__body">
                <div className="admin-modal__form-group">
                  <label>{t('admin.common.name')}</label>
                  <input type="text" name="name" required defaultValue={editingCategory?.name || ''} placeholder={t('admin.menu.categoryNamePlaceholder')} />
                </div>
                <div className="admin-modal__form-group">
                  <label>{t('admin.common.description')}</label>
                  <textarea name="description" rows={2} defaultValue={editingCategory?.description || ''}></textarea>
                </div>
                <div className="admin-modal__form-group">
                  <label>{t('admin.common.displayOrder')}</label>
                  <input type="number" name="displayOrder" defaultValue={editingCategory?.displayOrder || 0} />
                </div>
                <div className="admin-modal__form-group" style={{ flexDirection: 'row', alignItems: 'center', gap: '0.5rem' }}>
                  <input type="checkbox" name="isActive" id="catIsActive" defaultChecked={editingCategory ? editingCategory.isActive : true} />
                  <label htmlFor="catIsActive">{t('admin.menu.categoryActive')}</label>
                </div>
              </div>
              <div className="admin-modal__footer">
                {editingCategory && (
                  <button type="button" onClick={handleDeleteCategory} disabled={saving} style={{ padding: '0.5rem 1rem', background: 'var(--accent-danger)', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', marginRight: 'auto' }}>
                    {t('admin.common.delete')}
                  </button>
                )}
                <button type="button" onClick={() => setIsCategoryModalOpen(false)} style={{ padding: '0.5rem 1rem', background: 'var(--input-bg)', color: 'var(--text-dark)', border: '1px solid var(--border)', borderRadius: '4px', cursor: 'pointer' }}>
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

      {/* Item Modal */}
      {isItemModalOpen && (
        <div className="admin-modal-overlay">
          <div className="admin-modal">
            <div className="admin-modal__header">
              <h2>{editingItem ? t('admin.menu.editItem') : t('admin.menu.newItemTitle')}</h2>
              <button className="admin-modal__close" onClick={() => setIsItemModalOpen(false)}>×</button>
            </div>
            <form onSubmit={handleSaveItem}>
              <div className="admin-modal__body">
                <div className="admin-modal__form-group">
                  <label>{t('admin.menu.itemName')}</label>
                  <input type="text" name="name" required defaultValue={editingItem?.name || ''} placeholder={t('admin.menu.itemNamePlaceholder')} />
                </div>
                <div className="admin-modal__form-group">
                  <label>{t('admin.common.description')}</label>
                  <textarea name="description" rows={2} defaultValue={editingItem?.description || ''} placeholder={t('admin.menu.itemDescriptionPlaceholder')}></textarea>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div className="admin-modal__form-group">
                    <label>{t('admin.menu.price')}</label>
                    <input type="text" name="price" required defaultValue={editingItem?.price || ''} placeholder={t('admin.menu.pricePlaceholder')} />
                  </div>
                  <div className="admin-modal__form-group">
                    <label>{t('admin.menu.order')}</label>
                    <input type="number" name="displayOrder" defaultValue={editingItem?.displayOrder || 0} />
                  </div>
                </div>
                {/* N3.3: los 14 alérgenos UE como opciones */}
                <div className="admin-modal__form-group" style={{ marginTop: '1rem' }}>
                  <label>{t('admin.menu.allergensLabel')}</label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.35rem 1rem' }}>
                    {EU_ALLERGENS.map((key) => (
                      <label key={key} style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', fontWeight: 'normal', fontSize: '0.85rem' }}>
                        <input
                          type="checkbox"
                          name="allergens"
                          value={key}
                          defaultChecked={editingItem?.allergens?.includes(key) ?? false}
                        />
                        {ALLERGEN_ICONS[key]} {t(`allergens.${key}`)}
                      </label>
                    ))}
                  </div>
                </div>
                {/* N3.3: foto del plato por URL (sin subida de ficheros) */}
                <div className="admin-modal__form-group">
                  <label>{t('admin.menu.photoLabel')}</label>
                  <input
                    type="text"
                    name="photoUrl"
                    defaultValue={editingItem?.photoUrl || ''}
                    placeholder={t('admin.menu.photoPlaceholder')}
                  />
                </div>
                <div className="admin-modal__form-group" style={{ flexDirection: 'row', alignItems: 'center', gap: '0.5rem', marginTop: '1rem' }}>
                  <input type="checkbox" name="isActive" id="itemIsActive" defaultChecked={editingItem ? editingItem.isActive : true} />
                  <label htmlFor="itemIsActive">{t('admin.menu.itemActive')}</label>
                </div>
              </div>
              <div className="admin-modal__footer">
                {editingItem && (
                  <button type="button" onClick={handleDeleteItem} disabled={saving} style={{ padding: '0.5rem 1rem', background: 'var(--accent-danger)', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', marginRight: 'auto' }}>
                    {t('admin.common.delete')}
                  </button>
                )}
                <button type="button" onClick={() => setIsItemModalOpen(false)} style={{ padding: '0.5rem 1rem', background: 'var(--input-bg)', color: 'var(--text-dark)', border: '1px solid var(--border)', borderRadius: '4px', cursor: 'pointer' }}>
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

      {/* Modal Specialties */}
      {editingSpecialties && (
        <div className="admin-modal-overlay">
          <div className="admin-modal" style={{ maxWidth: '800px', width: '90%', maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="admin-modal__header">
              <h2>{t('admin.menu.specialtiesTitle')}</h2>
              <button className="admin-modal__close" type="button" onClick={() => setEditingSpecialties(false)}>×</button>
            </div>
            <div className="admin-modal__body">
              <form id="specialties-form" onSubmit={handleSaveSpecialties} className="admin-modal__form-group" style={{ gap: '1.25rem' }}>
                <div style={{ padding: '1rem', background: 'var(--bg-light)', borderRadius: '8px' }}>
                  <h3 style={{ marginTop: 0 }}>{t('admin.menu.sectionTitleLabel')}</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(editorLanguages.length, 3)}, 1fr)`, gap: '1rem' }}>
                    {editorLanguages.map((lang) => (
                      <div key={lang}>
                        <label style={{ fontSize: '0.8rem' }}>{t('admin.menu.titleLang', { lang: lang.toUpperCase() })}</label>
                        <input
                          required
                          type="text"
                          value={specialtiesForm.title?.[lang] || ''}
                          onChange={(e) => setSpecialtiesForm({ ...specialtiesForm, title: { ...specialtiesForm.title, [lang]: e.target.value } })}
                        />
                      </div>
                    ))}
                  </div>
                </div>

                {/* M2: N platos destacados, con añadir/quitar */}
                <h3 style={{ marginTop: '1rem', marginBottom: '0.5rem' }}>{t('admin.menu.specialDishes')}</h3>
                {specialtiesForm.items?.map((item, idx: number) => (
                  <div key={item.id} style={{ padding: '1rem', background: 'var(--bg-light)', borderRadius: '8px', marginBottom: '1rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <h4 style={{ marginTop: 0, marginBottom: 0 }}>{t('admin.menu.dishNumber', { number: idx + 1 })}</h4>
                      <button
                        type="button"
                        onClick={() => handleRemoveSpecialty(idx)}
                        style={{ background: 'var(--accent-danger)', color: 'white', border: 'none', borderRadius: '4px', padding: '0.25rem 0.6rem', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600 }}
                      >
                        {t('admin.menu.removeDish')}
                      </button>
                    </div>
                    <div style={{ margin: '0.75rem 0 1rem' }}>
                      <label style={{ fontSize: '0.8rem' }}>{t('admin.menu.imageUrl')}</label>
                      <input required type="text" value={item.image || ''} onChange={(e) => {
                        const newItems = [...specialtiesForm.items];
                        newItems[idx] = { ...newItems[idx], image: e.target.value };
                        setSpecialtiesForm({ ...specialtiesForm, items: newItems });
                      }} />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(editorLanguages.length, 3)}, 1fr)`, gap: '1rem', marginBottom: '1rem' }}>
                      {editorLanguages.map((lang) => (
                        <div key={lang}>
                          <label style={{ fontSize: '0.8rem' }}>{t('admin.menu.nameLang', { lang: lang.toUpperCase() })}</label>
                          <input
                            required
                            type="text"
                            value={item.name?.[lang] || ''}
                            onChange={(e) => updateSpecialtyField(idx, 'name', lang, e.target.value)}
                          />
                        </div>
                      ))}
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(editorLanguages.length, 3)}, 1fr)`, gap: '1rem' }}>
                      {editorLanguages.map((lang) => (
                        <div key={lang}>
                          <label style={{ fontSize: '0.8rem' }}>{t('admin.menu.descriptionLang', { lang: lang.toUpperCase() })}</label>
                          <textarea
                            rows={2}
                            required
                            value={item.description?.[lang] || ''}
                            onChange={(e) => updateSpecialtyField(idx, 'description', lang, e.target.value)}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={handleAddSpecialty}
                  style={{ alignSelf: 'flex-start', background: 'transparent', border: '1px solid var(--border)', borderRadius: '4px', padding: '0.4rem 0.9rem', cursor: 'pointer', fontWeight: 600 }}
                >
                  {t('admin.menu.addDish')}
                </button>
              </form>
            </div>
            <div className="admin-modal__footer">
              <button
                type="button"
                onClick={() => setEditingSpecialties(false)}
                style={{ padding: '0.5rem 1.25rem', background: 'transparent', border: '1px solid var(--border)', borderRadius: '4px', cursor: 'pointer', fontWeight: 600 }}
              >
                {t('admin.common.cancel')}
              </button>
              <button
                type="submit"
                form="specialties-form"
                disabled={saving}
                style={{ padding: '0.5rem 1.25rem', background: 'var(--accent-action)', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 600 }}
              >
                {saving ? t('admin.common.saving') : t('admin.common.saveChanges')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
