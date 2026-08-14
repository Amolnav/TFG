const axios = require('axios');
const { asyncHandler } = require('../middleware/errorHandler');
const configService = require('../services/configService');
// BUG-21 + M2: reseñas de respaldo definidas una sola vez, en un fichero de
// datos neutro sin contenido de marca.
const { FALLBACK_REVIEWS } = require('../config/defaultReviews');
const { logger } = require('../config/logger');

// BUG-21: caché en memoria — antes cada visita pública disparaba una llamada
// a la API de Google Places (coste, cuota y latencia).
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 horas
let reviewsCache = { data: null, timestamp: 0 };

/**
 * Obtener las últimas 5 reseñas de Google Places
 * GET /api/public/reviews
 */
exports.getGoogleReviews = asyncHandler(async (req, res) => {
  const apiKey = process.env.GOOGLE_API_KEY;
  const placeId = process.env.GOOGLE_PLACE_ID;

  // Fallback a datos estáticos si no hay configuración
  if (!apiKey || !placeId) {
    return res.json({
      status: 'success',
      source: 'mock',
      data: FALLBACK_REVIEWS
    });
  }

  if (reviewsCache.data && Date.now() - reviewsCache.timestamp < CACHE_TTL_MS) {
    return res.json({
      status: 'success',
      source: 'google-cache',
      data: reviewsCache.data
    });
  }

  try {
    // M2: el idioma de las reseñas de Google sale de la configuración
    const language = await configService.getConfigValue('language_default');
    const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=reviews&key=${apiKey}&language=${language}`;
    const response = await axios.get(url);

    if (response.data.status !== 'OK') {
      throw new Error(`Google API Error: ${response.data.status} - ${response.data.error_message || ''}`);
    }

    const reviews = response.data.result?.reviews || [];

    const formattedReviews = reviews.map((rev, index) => ({
      id: `google-${index}`,
      name: rev.author_name,
      quote: rev.text,
      rating: rev.rating,
      profile_photo_url: rev.profile_photo_url,
      relative_time_description: rev.relative_time_description
    })).slice(0, 5);

    reviewsCache = { data: formattedReviews, timestamp: Date.now() };

    res.json({
      status: 'success',
      source: 'google',
      data: formattedReviews
    });
  } catch (error) {
    logger.error('Error fetching Google reviews:', error.message);
    // En caso de error de la API, devolvemos el fallback para no romper el frontend
    res.json({
      status: 'success',
      source: 'fallback',
      data: FALLBACK_REVIEWS
    });
  }
});
