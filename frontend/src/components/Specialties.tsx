import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useReveal } from '../services/useReveal';
import { useConfig } from '../context/useConfig';
import { pickLocalized } from '../utils/i18n';
import type { SpecialtiesItem } from '../types';

const Specialties: React.FC = () => {
  const revealRef = useReveal();
  const { t, i18n } = useTranslation();
  const { config } = useConfig();

  // M2: N platos (0 incluidos) e idiomas abiertos; sin especialidades
  // configuradas la sección no se muestra
  const title = pickLocalized(config.specialties?.title, i18n.language, config.language_default);
  const items = config.specialties?.items || [];

  if (items.length === 0) return null;

  return (
    <section className="specialties" id="menu" ref={revealRef}>
      <div className="section-header reveal">
        <h2>{title}</h2>
      </div>
      <div className="specialties-grid">
        {items.map((item: SpecialtiesItem) => (
          <div key={item.id} className="specialty-card reveal">
            <div className="card-image">
              <img src={item.image} alt={pickLocalized(item.name, i18n.language, config.language_default)} />
            </div>
            <div className="card-content">
              <h3>{pickLocalized(item.name, i18n.language, config.language_default)}</h3>
              <p>{pickLocalized(item.description, i18n.language, config.language_default)}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="section-footer reveal delay-3">
        <Link to="/carta" className="btn btn-primary">
          {t('specialties.viewFullMenu')}
        </Link>
      </div>
    </section>
  );
};

export default Specialties;
