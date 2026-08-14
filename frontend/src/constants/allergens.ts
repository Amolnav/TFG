// N3.3: los 14 alérgenos de declaración obligatoria en la UE
// (Reglamento (UE) 1169/2011, Anexo II). Las claves coinciden con las del
// backend (EU_ALLERGENS en backend/src/config/constants.js); los nombres se
// traducen vía i18n (allergens.<clave>).

export const EU_ALLERGENS = [
  'gluten',
  'crustaceos',
  'huevos',
  'pescado',
  'cacahuetes',
  'soja',
  'lacteos',
  'frutos_cascara',
  'apio',
  'mostaza',
  'sesamo',
  'sulfitos',
  'altramuces',
  'moluscos',
] as const;

export const ALLERGEN_ICONS: Record<string, string> = {
  gluten: '🌾',
  crustaceos: '🦐',
  huevos: '🥚',
  pescado: '🐟',
  cacahuetes: '🥜',
  soja: '🌱',
  lacteos: '🥛',
  frutos_cascara: '🌰',
  apio: '🥬',
  mostaza: '🟡',
  sesamo: '⚪',
  sulfitos: '🍷',
  altramuces: '🫘',
  moluscos: '🐚',
};
