/**
 * Reseñas de respaldo NEUTRAS (plan de modularidad M2): se muestran solo
 * cuando no hay GOOGLE_API_KEY/GOOGLE_PLACE_ID configurados o la API falla.
 * Sin nombres de platos ni referencias a un restaurante concreto: son
 * claramente contenido de ejemplo, no datos de un cliente real.
 */

const FALLBACK_REVIEWS = [
  {
    id: '1',
    name: 'Cliente de ejemplo',
    quote: 'Comida excelente y un servicio muy atento. Repetiremos sin duda.',
    rating: 5,
    relative_time_description: 'hace una semana',
    profile_photo_url: 'https://ui-avatars.com/api/?name=C+E&background=random'
  },
  {
    id: '2',
    name: 'Reseña de ejemplo',
    quote: 'Un local con mucho encanto y platos muy bien presentados.',
    rating: 5,
    relative_time_description: 'hace 3 días',
    profile_photo_url: 'https://ui-avatars.com/api/?name=R+E&background=random'
  },
  {
    id: '3',
    name: 'Visitante de ejemplo',
    quote: 'Buena relación calidad-precio y un trato cercano.',
    rating: 4,
    relative_time_description: 'hace un mes',
    profile_photo_url: 'https://ui-avatars.com/api/?name=V+E&background=random'
  }
];

module.exports = { FALLBACK_REVIEWS };
