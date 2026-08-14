import React from 'react';
import { useTranslation } from 'react-i18next';
import { useConfig } from '../context/useConfig';

const Footer: React.FC = () => {
  const { t } = useTranslation();
  const { config } = useConfig();

  // M1: redes, mapa y copyright salen de la configuración
  const socialLinks = [
    { label: 'Instagram', href: config.social_instagram },
    { label: 'Facebook', href: config.social_facebook },
  ].filter((link) => link.href);

  const mapContent = config.map_image ? (
    <img src={config.map_image} alt={t('footer.googleMap')} className="footer-map__img" />
  ) : null;

  return (
    <footer className="footer">
      <div className="footer-container">
        <div className="footer-column">
          <h4>{t('footer.addressTitle')}</h4>
          <p>{config.restaurant_address}</p>
          {(mapContent || config.maps_url) && (
            <div className="footer-map mt-2">
              {config.maps_url ? (
                <a href={config.maps_url} target="_blank" rel="noreferrer">
                  {mapContent || t('footer.viewOnMap')}
                </a>
              ) : (
                mapContent
              )}
            </div>
          )}
        </div>

        <div className="footer-column">
          <h4>{t('footer.contactTitle')}</h4>
          {config.restaurant_phone && <p>Tel: {config.restaurant_phone}</p>}
          {config.restaurant_email && <p>Email: {config.restaurant_email}</p>}
        </div>

        {socialLinks.length > 0 && (
          <div className="footer-column">
            <h4>{t('footer.followTitle')}</h4>
            <div className="social-links">
              {socialLinks.map((link) => (
                <a key={link.label} href={link.href} className="social-icon" target="_blank" rel="noreferrer">
                  {link.label}
                </a>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="footer-bottom">
        <div className="footer-bottom-container">
          <p>{t('footer.copyright', { year: new Date().getFullYear(), name: config.restaurant_name })}</p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
