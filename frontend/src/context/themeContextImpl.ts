import { createContext } from 'react';

export type Theme = 'light' | 'dark';

export interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
}

// BUG-54: el contexto vive en un fichero sin componentes para que tanto el
// provider (ThemeContext.tsx) como el hook (useTheme.ts) puedan importarlo
// sin romper react-refresh/only-export-components.
export const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);
