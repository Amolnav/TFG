import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { getBaseLanguage } from '../utils/i18n';
import { useConfig } from '../context/useConfig';
import './LanguageSwitcher.css';

const LanguageSwitcher: React.FC = () => {
  const { t, i18n } = useTranslation();
  const { config } = useConfig();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // M5: los idiomas activos son configuración del despliegue
  const languages = config.languages_supported
    .split(',')
    .map((code) => code.trim())
    .filter(Boolean)
    .map((code) => ({ code, label: code.toUpperCase() }));

  const activeLanguage = getBaseLanguage(i18n.language);
  const currentLanguage = languages.find(lang => lang.code === activeLanguage) || languages[0];

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const changeLanguage = (code: string) => {
    i18n.changeLanguage(code);
    setIsOpen(false);
  };

  // M5: con un único idioma activo el selector no aporta nada
  if (languages.length <= 1) return null;

  return (
    <div className="language-switcher-container" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="language-switcher-button"
        aria-label={t('languageSwitcher.label')}
      >
        <span>{currentLanguage.label}</span>
        <svg
          className={`dropdown-icon ${isOpen ? 'open' : ''}`}
          viewBox="0 0 24 24"
        >
          <path d="M7 10l5 5 5-5z" fill="currentColor" />
        </svg>
      </button>

      {isOpen && (
        <div className="language-switcher-dropdown">
          {languages.map((lang) => (
            <button
              key={lang.code}
              onClick={() => changeLanguage(lang.code)}
                className={`language-option ${activeLanguage === lang.code ? 'active' : ''}`}
              >
              {lang.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default LanguageSwitcher;
