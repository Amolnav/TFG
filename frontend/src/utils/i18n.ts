import type { LocalizedText } from '../types';

export function getBaseLanguage(language?: string) {
  return language?.split('-')[0] || 'es';
}

/**
 * M2/M5: resuelve un texto multiidioma { es, en, ... } en cascada:
 * idioma activo → idioma por defecto → primer valor disponible.
 */
export function pickLocalized(
  text: LocalizedText | undefined,
  language: string,
  defaultLanguage = 'es'
): string {
  if (!text) return '';
  const lang = getBaseLanguage(language);
  return text[lang] ?? text[getBaseLanguage(defaultLanguage)] ?? Object.values(text)[0] ?? '';
}

/** Orden de presentación semanal (lunes primero); los valores son getDay() */
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

/**
 * M1: formatea los días de apertura DERIVADOS de los turnos reales.
 * Un tramo contiguo de 3+ días se muestra como rango ("Mar – Dom").
 * @param days - días getDay() (0=domingo)
 * @param dayNames - nombre corto por día, indexado 0-6 (0=domingo)
 * @param everyDayLabel - etiqueta para "todos los días"
 */
export function formatOpeningDays(days: number[], dayNames: string[], everyDayLabel: string): string {
  const set = new Set(days);
  if (set.size === 0) return '';
  if (set.size === 7) return everyDayLabel;

  const runs: number[][] = [];
  let current: number[] = [];
  for (const day of WEEK_ORDER) {
    if (set.has(day)) {
      current.push(day);
    } else if (current.length > 0) {
      runs.push(current);
      current = [];
    }
  }
  if (current.length > 0) runs.push(current);

  return runs
    .map((run) =>
      run.length >= 3
        ? `${dayNames[run[0]]} – ${dayNames[run[run.length - 1]]}`
        : run.map((day) => dayNames[day]).join(', ')
    )
    .join(' · ');
}

/**
 * M4: formatea un precio de carta. El precio es texto libre ("S. Mercado",
 * "4.5 / 6€"); solo los valores puramente numéricos se formatean con la
 * moneda configurada.
 */
export function formatPrice(price: string, currency: string, language: string): string {
  const trimmed = (price ?? '').trim();
  if (!/^\d+([.,]\d+)?$/.test(trimmed)) return trimmed;
  const amount = Number(trimmed.replace(',', '.'));
  try {
    return new Intl.NumberFormat(getBaseLanguage(language), {
      style: 'currency',
      currency,
      minimumFractionDigits: amount % 1 === 0 ? 0 : 2
    }).format(amount);
  } catch {
    return trimmed;
  }
}
