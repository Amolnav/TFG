import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useReveal } from '../services/useReveal';
import { useConfig } from '../context/useConfig';
import { pickLocalized } from '../utils/i18n';

const Hero: React.FC = () => {
  const { t, i18n } = useTranslation();
  const revealRef = useReveal();
  const { config } = useConfig();

  // M2: título, subtítulo e imagen del hero salen de la configuración
  const title = pickLocalized(config.hero.title, i18n.language, config.language_default);
  const subtitle = pickLocalized(config.hero.subtitle, i18n.language, config.language_default);

  const heroStyle = config.hero.image
    ? { backgroundImage: `linear-gradient(rgba(0,0,0,0.45), rgba(0,0,0,0.45)), url("${config.hero.image}")` }
    : undefined;

  return (
    <section className="hero" id="home" ref={revealRef} style={heroStyle}>
      <div className="hero-overlay"></div>
      <div className="hero-content">
        <h1 className="reveal">{title}</h1>
        {subtitle && (
          <p className="hero-subtitle reveal">
            {subtitle}
          </p>
        )}
        <div className="hero-ctas reveal">
          <Link to="/reservar" className="btn btn-primary">{t('hero.bookNow')}</Link>
          <Link to="/carta" className="btn btn-outline-light">{t('hero.viewMenu')}</Link>
        </div>
      </div>
    </section>
  );
};

export default Hero;
