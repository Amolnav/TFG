import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { getPublicMenu } from '../services/api';
import { useConfig } from '../context/useConfig';
import { pickLocalized, formatPrice } from '../utils/i18n';
import { ALLERGEN_ICONS } from '../constants/allergens';
import type { MenuCategory } from '../types';
import '../styles/pages/PageHero.css';
import '../styles/pages/MenuPage.css';

const MenuPage: React.FC = () => {
  const { t, i18n } = useTranslation();
  const { config } = useConfig();
  const [sections, setSections] = useState<MenuCategory[]>([]);
  const [loading, setLoading] = useState(true);

  // M2: el bloque final ("Agradecimientos"...) es contenido de marca editable
  const notesTitle = pickLocalized(config.menuNotes.title, i18n.language, config.language_default);
  const notesText = pickLocalized(config.menuNotes.text, i18n.language, config.language_default);

  useEffect(() => {
    getPublicMenu()
      .then(data => setSections(data))
      .catch(err => console.error("Error loading menu", err))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="menu-page">
      <Navbar />
      <header
        className="page-hero"
        style={config.hero.image ? { backgroundImage: `url("${config.hero.image}")` } : undefined}
      >
        <div className="page-hero__overlay" />
        <div className="page-hero__content">
          <h1>{t('menu.title')}</h1>
          <p>{t('menu.subtitle')}</p>
        </div>
      </header>
      <main className="menu-container">
        {loading ? (
          <div className="menu-loading">
            <div className="spinner">⏳</div>
            <p>{t('menu.loading')}</p>
          </div>
        ) : sections.length === 0 ? (
          <div className="menu-empty">
            <p className="menu-empty__title">{t('menu.emptyTitle')}</p>
            <p className="menu-empty__desc">{t('menu.emptyDesc')}</p>
          </div>
        ) : (
          sections.map((section, idx) => (
            <div key={idx} className="menu-section">
              <h2>{section.name}</h2>
              {section.description && (
                <p className="menu-section__desc">{section.description}</p>
              )}
              <div className="menu-items">
                {section.items.map((item, iIdx) => (
                  <div key={iIdx} className="menu-item">
                    {/* N3.3: foto opcional del plato */}
                    {item.photoUrl && (
                      <img
                        className="menu-item__photo"
                        src={item.photoUrl}
                        alt={item.name}
                        loading="lazy"
                      />
                    )}
                    <div className="menu-item__content">
                      <div className="menu-item__row">
                        <span className="menu-item__name">{item.name}</span>
                        <div className="menu-item__divider"></div>
                        {/* M4: los precios numéricos se formatean con la moneda configurada */}
                        <span className="menu-item__price">{formatPrice(item.price, config.currency, i18n.language)}</span>
                      </div>
                      {item.description && (
                        <p className="menu-item__desc">{item.description}</p>
                      )}
                      {/* N3.3: alérgenos UE (Reglamento 1169/2011) */}
                      {item.allergens && item.allergens.length > 0 && (
                        <div className="menu-item__allergens">
                          {item.allergens.map((key) => (
                            <span key={key} className="menu-item__allergen" title={t(`allergens.${key}`)}>
                              {ALLERGEN_ICONS[key] || '⚠️'} {t(`allergens.${key}`)}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}

        {(notesTitle || notesText) && (
          <footer className="menu-thanks">
            {notesTitle && <h3>{notesTitle}</h3>}
            {notesText && <p>{notesText}</p>}
          </footer>
        )}
      </main>
      <Footer />
    </div>
  );
};

export default MenuPage;
