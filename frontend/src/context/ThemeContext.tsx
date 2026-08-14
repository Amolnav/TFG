import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { ThemeContext, type Theme } from './themeContextImpl';

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const location = useLocation();
  const isAdminPath = location.pathname.startsWith('/admin') && location.pathname !== '/admin/login';

  const [theme, setTheme] = useState<Theme>(() => {
    // If not admin path on initial load, always light
    const initialIsAdmin = window.location.pathname.startsWith('/admin') && window.location.pathname !== '/admin/login';
    if (!initialIsAdmin) return 'light';

    const saved = localStorage.getItem('admin_theme');
    if (saved === 'light' || saved === 'dark') return saved;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  // BUG-54: en lugar de resetear el estado con setState dentro de un efecto
  // (cascada de renders), el tema efectivo se deriva durante el render: fuera
  // del panel admin la web pública es siempre clara.
  const effectiveTheme: Theme = isAdminPath ? theme : 'light';

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', effectiveTheme);

    // Only save to localStorage if we are in admin and manually changed it
    if (isAdminPath) {
      localStorage.setItem('admin_theme', theme);
    }

    // Apply dark mode classes ONLY if in admin path AND theme is dark
    if (effectiveTheme === 'dark' && isAdminPath) {
      document.body.classList.add('dark-mode');
    } else {
      document.body.classList.remove('dark-mode');
    }
  }, [effectiveTheme, theme, isAdminPath]);

  const toggleTheme = () => {
    // Only allow toggling if we are in the admin area
    if (window.location.pathname.startsWith('/admin')) {
      setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
    }
  };

  return (
    <ThemeContext.Provider value={{ theme: effectiveTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};
