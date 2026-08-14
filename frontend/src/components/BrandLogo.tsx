import React from 'react';
import { useConfig } from '../context/useConfig';

/**
 * M3: logo configurable (clave brand_logo). Acepta un emoji ("⚓") o una
 * ruta/URL de imagen ("/branding/logo.svg"); se usa en Navbar, Login y panel.
 */
const BrandLogo: React.FC<{ className?: string }> = ({ className }) => {
  const { config } = useConfig();
  const logo = config.brand_logo;

  if (/^(\/|https?:\/\/)/.test(logo)) {
    return (
      <img
        src={logo}
        alt={config.restaurant_name}
        className={className}
        style={{ height: '1.2em', width: 'auto', verticalAlign: '-0.2em' }}
      />
    );
  }

  return <span className={className} aria-hidden="true">{logo}</span>;
};

export default BrandLogo;
