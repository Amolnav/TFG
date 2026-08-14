import React from 'react';
import { useTranslation } from 'react-i18next';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { useConfig } from '../context/useConfig';
import { pickLocalized } from '../utils/i18n';
import '../styles/pages/PageHero.css';
import '../styles/pages/AboutPage.css';

// M2: toda la historia (secciones, valores, bloque de visita) sale de la
// clave history_config de SystemConfig, editable desde el panel.
const AboutPage: React.FC = () => {
  const { i18n } = useTranslation();
  const { config } = useConfig();
  const history = config.history;
  const lang = i18n.language;
  const fallback = config.language_default;

  const subtitle = pickLocalized(history.subtitle, lang, fallback);
  const sections = history.sections ?? [];
  const values = history.values ?? [];

  return (
    <div className="about-page">
      <Navbar />
      <header
        className="page-hero"
        style={config.hero.image ? { backgroundImage: `url("${config.hero.image}")` } : undefined}
      >
        <div className="page-hero__overlay" />
        <div className="page-hero__content">
          <h1>{pickLocalized(history.title, lang, fallback)}</h1>
          {subtitle && <p>{subtitle}</p>}
        </div>
      </header>
      <main className="about-container-page">
        {sections.map((section, index) => (
          <section className="about-section" key={index}>
            <h2>{pickLocalized(section.title, lang, fallback)}</h2>
            {section.paragraphs.map((paragraph, pIndex) => (
              <p key={pIndex}>{pickLocalized(paragraph, lang, fallback)}</p>
            ))}
          </section>
        ))}

        {values.length > 0 && (
          <section className="about-section">
            <h2>{pickLocalized(history.valuesTitle, lang, fallback)}</h2>
            <ul className="about-values">
              {values.map((value, index) => (
                <li key={index}>
                  <strong>{pickLocalized(value.title, lang, fallback)}</strong>{' '}
                  {pickLocalized(value.text, lang, fallback)}
                </li>
              ))}
            </ul>
          </section>
        )}

        {history.visit && (
          <section className="about-visit-cta">
            <h2>{pickLocalized(history.visit.title, lang, fallback)}</h2>
            <p>{pickLocalized(history.visit.text, lang, fallback)}</p>
          </section>
        )}
      </main>
      <Footer />
    </div>
  );
};

export default AboutPage;
