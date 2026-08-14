import React, { useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import LanguageSwitcher from './LanguageSwitcher';
import BrandLogo from './BrandLogo';
import { useConfig } from '../context/useConfig';

interface NavbarProps {
  showLinks?: boolean;
  isReservation?: boolean;
}

const Navbar: React.FC<NavbarProps> = ({ showLinks = true, isReservation = false }) => {
  const { t } = useTranslation();
  const { config } = useConfig();
  const [scrolled, setScrolled] = useState<boolean>(isReservation);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  React.useEffect(() => {
    const handleScroll = () => {
      if (isReservation) {
        setScrolled(true);
      } else {
        setScrolled(window.scrollY > 20);
      }
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [isReservation]);

  const toggleMobileMenu = () => setMobileMenuOpen(!mobileMenuOpen);
  const closeMobileMenu = () => setMobileMenuOpen(false);

  return (
    <header className={`sticky-navbar ${scrolled ? 'scrolled' : ''} ${mobileMenuOpen ? 'mobile-menu-active' : ''}`}>
      <div className="navbar-container">
        <div className="navbar-left">
          <Link to="/" className="logo-container" onClick={closeMobileMenu}>
            {/* M1: logo y subtítulo desde configuración, no hardcodeados */}
            <span className="logo-text"><BrandLogo /> {config.restaurant_name}</span>
            {config.restaurant_tagline && (
              <span className="logo-subtext">{config.restaurant_tagline}</span>
            )}
          </Link>
          <div className="desktop-only">
            <LanguageSwitcher />
          </div>
        </div>
        
        {showLinks && (
          <>
            <nav className="navbar-center desktop-only">
              <ul className="nav-links">
                <li>
                  <NavLink to="/" end className={({ isActive }) => isActive ? 'active' : ''}>
                    {t('navbar.home')}
                  </NavLink>
                </li>
                <li>
                  <NavLink to="/carta" className={({ isActive }) => isActive ? 'active' : ''}>
                    {t('navbar.menu')}
                  </NavLink>
                </li>
                <li>
                  <NavLink to="/historia" className={({ isActive }) => isActive ? 'active' : ''}>
                    {t('navbar.history')}
                  </NavLink>
                </li>
              </ul>
            </nav>

            {/* Hamburger Button */}
            {!isReservation && (
              <button 
                className={`mobile-menu-toggle ${mobileMenuOpen ? 'active' : ''}`}
                onClick={toggleMobileMenu}
                aria-label={t('navbar.toggleMenu')}
              >
                <span></span>
                <span></span>
                <span></span>
              </button>
            )}
          </>
        )}

        {isReservation && <div className="navbar-divider desktop-only" />}
        
        <div className="navbar-right">
          {isReservation ? (
            <div className="phone-info">
              {t('navbar.reservations')} · <a href={`tel:${config.restaurant_phone.replace(/\s/g, '')}`}>{config.restaurant_phone}</a>
            </div>
          ) : (
            <>
              <Link to="/reservar" className="btn btn-primary btn-navbar-res desktop-only">{t('navbar.bookTable')}</Link>
            </>
          )}
        </div>
      </div>

      {/* Mobile Menu Overlay */}
      {showLinks && (
        <div className={`mobile-menu-overlay ${mobileMenuOpen ? 'active' : ''}`}>
          <nav className="mobile-nav">
            <ul className="mobile-nav-links">
              <li>
                <NavLink to="/" end onClick={closeMobileMenu} className={({ isActive }) => isActive ? 'active' : ''}>
                  {t('navbar.home')}
                </NavLink>
              </li>
              <li>
                <NavLink to="/carta" onClick={closeMobileMenu} className={({ isActive }) => isActive ? 'active' : ''}>
                  {t('navbar.menu')}
                </NavLink>
              </li>
              <li>
                <NavLink to="/historia" onClick={closeMobileMenu} className={({ isActive }) => isActive ? 'active' : ''}>
                  {t('navbar.history')}
                </NavLink>
              </li>
              <li>
                <div className="mobile-language-switcher">
                   <LanguageSwitcher />
                </div>
              </li>
              {!isReservation && (
                <li className="mobile-nav-cta">
                  <Link to="/reservar" className="btn btn-primary" onClick={closeMobileMenu}>
                    {t('navbar.bookTable')}
                  </Link>
                </li>
              )}
            </ul>
          </nav>
        </div>
      )}
    </header>
  );
};

export default Navbar;
