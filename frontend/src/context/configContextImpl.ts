import { createContext } from 'react';
import type { PublicFrontendConfig } from '../types';

export interface ConfigContextValue {
  config: PublicFrontendConfig;
  loading: boolean;
}

// BUG-54: el contexto vive en un fichero sin componentes para que tanto el
// provider (ConfigContext.tsx) como el hook (useConfig.ts) puedan importarlo
// sin romper react-refresh/only-export-components.
export const ConfigContext = createContext<ConfigContextValue | undefined>(undefined);
