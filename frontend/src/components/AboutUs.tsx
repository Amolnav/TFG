import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useReveal } from '../services/useReveal';
import { useConfig } from '../context/useConfig';
import { pickLocalized } from '../utils/i18n';

const AboutUs: React.FC = () => {
  const { t, i18n } = useTranslation();
  const revealRef = useReveal();
  const { config } = useConfig();

  // M2: título, texto e imagen de la sección salen de la configuración
  const title = pickLocalized(config.about.title, i18n.language, config.language_default);
  const text = pickLocalized(config.about.text, i18n.language, config.language_default);

  return (
    <section className="about-us" id="story" ref={revealRef}>
      <div className="about-container">
        <div className="about-content reveal">
          <h2>{title}</h2>
          <p>
            {text}
          </p>
          <Link to="/historia" className="btn btn-outline">{t('about.historyBtn')}</Link>
        </div>
        {config.about.image && (
          <div className="about-image reveal delay-1">
            <img
              src={config.about.image}
              alt={title}
              style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'var(--radius-md)' }}
            />
          </div>
        )}
      </div>
    </section>
  );
};

export default AboutUs;
