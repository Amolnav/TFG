import type { RestaurantSeedData } from './types'
import mesonMarinero from './meson-marinero'
import barEjemplo from './bar-ejemplo'

/**
 * Registro de datasets de restaurante disponibles para el seed (M6).
 * Se selecciona con la variable de entorno RESTAURANT (p. ej.
 * `RESTAURANT=bar-ejemplo npm run db:seed`).
 */
export const RESTAURANTS: Record<string, RestaurantSeedData> = {
  [mesonMarinero.key]: mesonMarinero,
  [barEjemplo.key]: barEjemplo
}

export const DEFAULT_RESTAURANT = mesonMarinero.key
