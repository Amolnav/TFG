/**
 * Fichero de datos de restaurante (plan de modularidad M6).
 *
 * Un despliegue nuevo = un fichero con esta forma + variables de entorno +
 * assets en frontend/public/branding/. El seed no contiene ningún dato de
 * marca: todo sale de aquí.
 */

/** Texto multiidioma: { es: '...', en: '...' } — idiomas libres (M5). */
export type LocalizedText = Record<string, string>

export interface RestaurantSeedData {
  /** Clave interna (nombre de fichero) */
  key: string

  /** Admin de DEMO (en producción el admin sale de SEED_ADMIN_EMAIL/PASSWORD) */
  demoAdmin: {
    email: string
    name: string
  }

  /**
   * Claves de SystemConfig. Los valores objeto se serializan a JSON.
   * Deben existir en backend/src/config/configSchema.js y pasar su validador.
   */
  config: Record<string, string | object>

  shifts: Array<{
    name: string
    startTime: string
    endTime: string
    slotInterval: number
    daysOfWeek: number[]
    isActive: boolean
    maxBookingsPerSlot?: number | null
  }>

  zones: Array<{
    name: string
    description?: string
    displayOrder: number
    tables: Array<{
      name: string
      minCapacity: number
      maxCapacity: number
    }>
  }>

  menu: Array<{
    name: string
    description?: string | null
    items: Array<{
      name: string
      description?: string | null
      price: string
    }>
  }>
}
