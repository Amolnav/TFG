import type { RestaurantSeedData } from './types'

/**
 * Dataset NEUTRO de ejemplo: "Bar Ejemplo".
 * Sirve como plantilla de alta de un restaurante nuevo y como prueba de fuego
 * del plan de modularidad (§5-M6): otra marca, otra carta, otro horario,
 * otros colores y otro idioma por defecto — sin tocar backend/src ni
 * frontend/src.
 */
const barEjemplo: RestaurantSeedData = {
  key: 'bar-ejemplo',

  demoAdmin: {
    email: 'admin@bar-ejemplo.example',
    name: 'Admin Bar Ejemplo'
  },

  config: {
    // Identidad
    restaurant_name: 'Bar Ejemplo',
    restaurant_tagline: 'Tapas y vermut de barrio',
    restaurant_address: 'Plaza Mayor, 1 — Ciudad Ejemplo',
    restaurant_phone: '900 000 000',
    restaurant_email: 'hola@bar-ejemplo.example',
    social_instagram: 'https://instagram.com/bar.ejemplo',
    social_facebook: '',
    maps_url: 'https://maps.google.com/?q=Plaza+Mayor+1',
    map_image: '',
    timezone: 'Europe/Madrid',
    currency: 'EUR',

    // Idiomas: por defecto inglés (M6: "otro idioma por defecto")
    languages_supported: 'es,en',
    language_default: 'en',

    // Marca visual: paleta verde/naranja y tipografías del sistema
    brand_logo: '🫒',
    theme_primary: '#14532D',
    theme_primary_light: '#166534',
    theme_accent: '#EA580C',
    theme_accent_hover: '#C2410C',
    theme_decor: '#65A30D',
    font_heading: 'Georgia, "Times New Roman", serif',
    font_body: 'system-ui, "Segoe UI", Roboto, sans-serif',
    fonts_url: '',

    // Reglas de negocio: bar de tapas — reservas cortas y poca antelación
    booking_durations: [{ maxPax: null, minutes: 60 }],
    booking_min_hours_ahead: '1',
    booking_max_days_ahead: '14',
    booking_suggestion_offsets: '-30,30',
    booking_max_suggestions: '2',
    no_show_threshold: '2',
    pax_min: '1',

    // Contenido editable
    hero_config: {
      title: { es: 'Tapas con alma de barrio', en: 'Neighbourhood tapas with soul' },
      subtitle: {
        es: 'Vermut de grifo, conservas escogidas y tapas de mercado en la plaza de siempre.',
        en: 'Vermouth on tap, hand-picked tinned delicacies and market tapas on the old town square.'
      },
      image: '/branding/hero.svg'
    },
    about_config: {
      title: { es: 'La casa', en: 'The house' },
      text: {
        es: 'Bar Ejemplo es un bar de barrio de toda la vida: barra de mármol, caña bien tirada y tapas que cambian con el mercado.',
        en: 'Bar Ejemplo is a lifelong neighbourhood bar: marble counter, well-poured beer and tapas that change with the market.'
      },
      image: '/branding/about.svg'
    },
    history_config: {
      title: { es: 'Nuestra Historia', en: 'Our Story' },
      subtitle: { es: 'Una barra abierta desde 2020.', en: 'A bar counter open since 2020.' },
      valuesTitle: { es: 'La casa por dentro', en: 'What we stand for' },
      sections: [
        {
          title: { es: 'La barra de la plaza', en: 'The counter on the square' },
          paragraphs: [
            {
              es: 'Bar Ejemplo abrió en 2020 con una idea sencilla: producto honesto, precios claros y una barra donde todo el mundo cabe.',
              en: 'Bar Ejemplo opened in 2020 with a simple idea: honest produce, clear prices and a counter with room for everyone.'
            }
          ]
        }
      ],
      values: [
        {
          title: { es: 'Mercado diario:', en: 'Daily market:' },
          text: { es: 'La pizarra cambia según lo que entra cada mañana.', en: 'The chalkboard changes with what arrives each morning.' }
        },
        {
          title: { es: 'Sin prisas:', en: 'No rush:' },
          text: { es: 'Aquí se viene a estar; la mesa es tuya mientras la disfrutes.', en: 'You come here to stay; the table is yours while you enjoy it.' }
        }
      ],
      visit: {
        title: { es: 'Pásate a vernos', en: 'Come around' },
        text: { es: 'Estamos en la Plaza Mayor, 1. La barra abre todos los días.', en: 'We are at Plaza Mayor, 1. The counter opens every day.' }
      }
    },
    reservation_config: {
      quote: {
        es: '"Una tapa, un vermut y la plaza de fondo."',
        en: '"A tapa, a vermouth and the square in the background."'
      },
      image: '/branding/reservation.svg'
    },
    menu_notes_config: {
      title: { es: 'De la casa', en: 'From the house' },
      text: {
        es: 'Todos nuestros precios incluyen pan y aceitunas de bienvenida.',
        en: 'All our prices include bread and welcome olives.'
      }
    },
    specialties_config: {
      title: { es: 'Los imprescindibles', en: 'The essentials' },
      items: [
        {
          id: 1,
          name: { es: 'Bravas Ejemplo', en: 'Bravas Ejemplo' },
          description: {
            es: 'Patatas bravas con nuestra salsa de la casa.',
            en: 'Crispy potatoes with our house brava sauce.'
          },
          image: '/branding/dish1.svg'
        },
        {
          id: 2,
          name: { es: 'Vermut de grifo', en: 'Vermouth on tap' },
          description: {
            es: 'Vermut rojo de elaboración local, con su naranja y su aceituna.',
            en: 'Locally made red vermouth, with orange and an olive.'
          },
          image: '/branding/dish2.svg'
        }
      ]
    }
  },

  // Otro horario: turno único continuo, abierto TODOS los días,
  // con límite de cocina por slot (M4)
  shifts: [
    {
      name: 'Servicio continuo',
      startTime: '12:00',
      endTime: '23:30',
      isActive: true,
      slotInterval: 30,
      daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
      maxBookingsPerSlot: 4
    }
  ],

  zones: [
    {
      name: 'Barra y sala',
      description: 'Mesas altas junto a la barra',
      displayOrder: 1,
      tables: [
        { name: 'T1', minCapacity: 1, maxCapacity: 2 },
        { name: 'T2', minCapacity: 1, maxCapacity: 2 },
        { name: 'T3', minCapacity: 2, maxCapacity: 4 },
        { name: 'T4', minCapacity: 2, maxCapacity: 4 }
      ]
    },
    {
      name: 'Terraza',
      description: 'Terraza en la plaza',
      displayOrder: 2,
      tables: [
        { name: 'T5', minCapacity: 2, maxCapacity: 4 },
        { name: 'T6', minCapacity: 2, maxCapacity: 6 },
        { name: 'T7', minCapacity: 4, maxCapacity: 6 }
      ]
    }
  ],

  menu: [
    {
      name: 'Tapas',
      items: [
        { name: 'Bravas Ejemplo', price: '5€' },
        { name: 'Ensaladilla rusa', price: '6€' },
        { name: 'Croqueta del día', price: '2€' },
        { name: 'Tortilla de patatas', price: '4€' }
      ]
    },
    {
      name: 'De la lata',
      items: [
        { name: 'Mejillones en escabeche', price: '8€' },
        { name: 'Berberechos al natural', price: '12€' }
      ]
    },
    {
      name: 'Para beber',
      items: [
        { name: 'Vermut de grifo', price: '3.5€' },
        { name: 'Caña', price: '2.5€' },
        { name: 'Vino de la casa (copa)', price: '3€' }
      ]
    }
  ]
}

export default barEjemplo
