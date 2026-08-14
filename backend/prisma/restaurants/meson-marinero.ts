import type { RestaurantSeedData } from './types'

/**
 * Dataset de DEMO: Mesón Marinero (marisquería de Alicante).
 * Este fichero es el ÚNICO lugar del repositorio donde viven los datos de
 * marca del Mesón; el código usa siempre defaults neutros.
 */
const mesonMarinero: RestaurantSeedData = {
  key: 'meson-marinero',

  demoAdmin: {
    email: 'admin@mesonmarinero.com',
    name: 'Administrador'
  },

  config: {
    // Identidad
    restaurant_name: 'Mesón Marinero',
    restaurant_tagline: 'Alicante, Mediterráneo',
    restaurant_address: 'Calle del Puerto, 12 — Alicante',
    restaurant_phone: '965 00 00 00',
    restaurant_email: 'info@mesonmarinero.es',
    social_instagram: '',
    social_facebook: '',
    maps_url: '',
    map_image: '/img/Mapa.jpg',
    timezone: 'Europe/Madrid',
    currency: 'EUR',

    // Idiomas
    languages_supported: 'es,en,fr',
    language_default: 'es',

    // Marca visual
    brand_logo: '⚓',
    theme_primary: '#0F172A',
    theme_primary_light: '#1E293B',
    theme_accent: '#E11D48',
    theme_accent_hover: '#BE123C',
    theme_decor: '#D97706',
    font_heading: "'Playfair Display', Georgia, serif",
    font_body: "'Lato', 'Helvetica Neue', sans-serif",
    fonts_url: 'https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,600;0,700;1,400&family=Lato:wght@300;400;700&display=swap',

    // Reglas de negocio
    booking_durations: [
      { maxPax: 2, minutes: 90 },
      { maxPax: 4, minutes: 120 },
      { maxPax: 6, minutes: 150 },
      { maxPax: null, minutes: 180 }
    ],
    booking_min_hours_ahead: '2',
    booking_max_days_ahead: '30',
    booking_suggestion_offsets: '-30,30,-60,60',
    booking_max_suggestions: '4',
    no_show_threshold: '3',
    pax_min: '1',

    // Contenido editable
    hero_config: {
      title: {
        es: 'Sabor a Mar, Tradición en la Mesa',
        en: 'Taste the Sea, Tradition on the Table',
        fr: 'Saveur de la mer, Tradition à table'
      },
      subtitle: {
        es: 'Disfruta de la mejor cocina mediterránea con un ambiente acogedor. Pescados frescos, mariscos seleccionados y arroces tradicionales.',
        en: 'Enjoy the best Mediterranean cuisine in a cozy atmosphere. Fresh fish, selected seafood, and traditional rice dishes.',
        fr: 'Profitez de la meilleure cuisine méditerranéenne dans une atmosphère chaleureuse. Poissons frais, fruits de mer sélectionnés et plats de riz traditionnels.'
      },
      image: '/img/Home.png'
    },
    about_config: {
      title: { es: 'Sobre Nosotros', en: 'About Us', fr: 'À Propos de Nous' },
      text: {
        es: 'Con más de 30 años de tradición, el Mesón Marinero nació de la pasión por el mar y la cocina auténtica. Nuestra historia es la de una familia dedicada a ofrecer lo mejor de nuestras costas en cada plato, manteniendo vivas las recetas de antaño.',
        en: 'With over 30 years of tradition, Mesón Marinero was born from a passion for the sea and authentic cuisine. Our story is that of a family dedicated to offering the best of our coasts in every dish, keeping old recipes alive.',
        fr: "Avec plus de 30 ans de tradition, le Mesón Marinero est né de la passion pour la mer et la cuisine authentique. Notre histoire est celle d'une famille dédiée à offrir le meilleur de nos côtes dans chaque plat, en gardant vivantes les vieilles recettes."
      },
      image: '/img/AboutUs.png'
    },
    history_config: {
      title: { es: 'Nuestra Historia', en: 'Our History', fr: 'Notre Histoire' },
      subtitle: {
        es: 'Tradición, mar y pasión desde 1990.',
        en: 'Tradition, sea, and passion since 1990.',
        fr: 'Tradition, mer et passion depuis 1990.'
      },
      valuesTitle: { es: 'Nuestros Valores', en: 'Our Values', fr: 'Nos Valeurs' },
      sections: [
        {
          title: {
            es: 'Tres décadas frente al mar',
            en: 'Three decades by the sea',
            fr: 'Trois décennies face à la mer'
          },
          paragraphs: [
            {
              es: 'El Mesón Marinero abrió sus puertas por primera vez en el verano de 1990. Lo que comenzó como un pequeño rincón para pescadores locales, pronto se convirtió en un referente de la gastronomía alicantina gracias a la dedicación de la familia Rodríguez.',
              en: 'Mesón Marinero opened its doors for the first time in the summer of 1990. What began as a small corner for local fishermen soon became a benchmark for Alicante gastronomy thanks to the dedication of the Rodriguez family.',
              fr: "Le Mesón Marinero a ouvert ses portes pour la première fois à l'été 1990. Ce qui a commencé comme un petit coin pour les pêcheurs locaux est rapidement devenu une référence de la gastronomie d'Alicante grâce au dévouement de la famille Rodríguez."
            },
            {
              es: 'Nuestra cocina se basa en un pilar fundamental: el respeto absoluto por el producto. Cada mañana, seleccionamos personalmente los mejores pescados y mariscos de la lonja para asegurar que solo lo más fresco llegue a su mesa.',
              en: 'Our cuisine is based on a fundamental pillar: absolute respect for the product. Every morning, we personally select the best fish and seafood from the fish market to ensure that only the freshest reaches your table.',
              fr: 'Notre cuisine repose sur un pilier fondamental : le respect absolu du produit. Chaque matin, nous sélectionnons personnellement les meilleurs poissons et fruits de mer de la criée pour nous assurer que seul le plus frais arrive à votre table.'
            }
          ]
        }
      ],
      values: [
        {
          title: { es: 'Producto de proximidad:', en: 'Local products:', fr: 'Produits locaux :' },
          text: {
            es: 'Trabajamos exclusivamente con proveedores locales y lonjas de la zona.',
            en: 'We work exclusively with local suppliers and fish markets in the area.',
            fr: 'Nous travaillons exclusivement avec des fournisseurs locaux et les criées de la région.'
          }
        },
        {
          title: { es: 'Recetas tradicionales:', en: 'Traditional recipes:', fr: 'Recettes traditionnelles :' },
          text: {
            es: 'Mantener vivos los sabores de siempre es nuestra razón de ser.',
            en: 'Keeping traditional flavors alive is our reason for being.',
            fr: "Garder vivantes les saveurs d'antan est notre raison d'être."
          }
        },
        {
          title: { es: 'Servicio cercano:', en: 'Close service:', fr: 'Service chaleureux :' },
          text: {
            es: 'Para nosotros, cada cliente es parte de la familia del Mesón.',
            en: 'For us, every customer is part of the Mesón family.',
            fr: 'Pour nous, chaque client fait partie de la famille du Mesón.'
          }
        }
      ],
      visit: {
        title: { es: 'Venga a visitarnos', en: 'Come visit us', fr: 'Venez nous rendre visite' },
        text: {
          es: 'Estamos en el corazón del puerto de Alicante. Le esperamos con la mesa puesta.',
          en: 'We are in the heart of the port of Alicante. We are waiting for you with the table set.',
          fr: "Nous sommes au cœur du port d'Alicante. Nous vous attendons avec la table dressée."
        }
      }
    },
    reservation_config: {
      quote: {
        es: '"El mar en tu mesa, la tradición en cada bocado."',
        en: '"The sea on your table, tradition in every bite."',
        fr: '"La mer à votre table, la tradition à chaque bouchée."'
      },
      image: '/img/Reserva.png'
    },
    menu_notes_config: {
      title: { es: 'Agradecimientos', en: 'Acknowledgments', fr: 'Remerciements' },
      text: {
        es: '"A nuestros padres, Eduardo y Alicia, que desde 1988 forjaron este sueño, que hasta hoy sus hijos intentamos mantener vivo día a día. Siéntate a la mesa, siéntete en tu casa, descorchemos un buen vino, y disfruta de nuestro precioso legado."',
        en: '"To our parents, Eduardo and Alicia, who forged this dream in 1988, which we, their children, try to keep alive every day. Sit at the table, feel at home, let\'s uncork a good wine, and enjoy our precious legacy."',
        fr: '"À nos parents, Eduardo et Alicia, qui ont forgé ce rêve en 1988, que nous, leurs enfants, essayons de garder vivant chaque jour. Asseyez-vous à table, sentez-vous chez vous, débouchons un bon vin et profitons de notre précieux héritage."'
      }
    },
    specialties_config: {
      title: { es: 'Nuestras Especialidades', en: 'Our Specialties', fr: 'Nos Spécialités' },
      items: [
        {
          id: 1,
          name: { es: 'Paella Marinera', en: 'Seafood Paella', fr: 'Paella aux fruits de mer' },
          description: {
            es: 'Nuestro arroz mas famoso con marisco fresco del dia.',
            en: 'Our most famous rice with fresh seafood.',
            fr: 'Notre riz le plus celebre avec des fruits de mer du jour.'
          },
          image: '/img/Paella.png'
        },
        {
          id: 2,
          name: { es: 'Pulpo a la Gallega', en: 'Galician style Octopus', fr: 'Poulpe a la galicienne' },
          description: {
            es: 'Tierno pulpo con pimenton y aceite de oliva virgen.',
            en: 'Tender octopus with paprika and extra virgin olive oil.',
            fr: "Poulpe tendre au paprika et a l'huile d'olive extra vierge."
          },
          image: '/img/Pulpo.png'
        },
        {
          id: 3,
          name: { es: 'Lubina al Horno', en: 'Baked Sea Bass', fr: 'Bar au four' },
          description: {
            es: 'Pescado salvaje preparado con el toque tradicional del meson.',
            en: 'Wild fish prepared with our traditional touch.',
            fr: 'Poisson sauvage prepare avec notre touche traditionnelle.'
          },
          image: '/img/Lubina.png'
        }
      ]
    }
  },

  shifts: [
    {
      name: 'Comidas',
      startTime: '13:30',
      endTime: '17:00',
      isActive: true,
      slotInterval: 30,
      daysOfWeek: [0, 2, 3, 4, 5, 6] // Martes a Domingo (lunes cerrado)
    },
    {
      name: 'Cenas',
      startTime: '20:30',
      endTime: '23:30',
      isActive: true,
      slotInterval: 30,
      daysOfWeek: [0, 2, 3, 4, 5, 6]
    }
  ],

  zones: [
    {
      name: 'Salón Principal',
      description: 'Salón interior del restaurante',
      displayOrder: 1,
      tables: [
        { name: 'Mesa 1', minCapacity: 1, maxCapacity: 2 },
        { name: 'Mesa 2', minCapacity: 1, maxCapacity: 2 },
        { name: 'Mesa 3', minCapacity: 1, maxCapacity: 2 },
        { name: 'Mesa 4', minCapacity: 1, maxCapacity: 2 },
        { name: 'Mesa 5', minCapacity: 2, maxCapacity: 4 },
        { name: 'Mesa 6', minCapacity: 2, maxCapacity: 4 },
        { name: 'Mesa 7', minCapacity: 2, maxCapacity: 4 },
        { name: 'Mesa 8', minCapacity: 2, maxCapacity: 4 },
        { name: 'Mesa 9', minCapacity: 2, maxCapacity: 4 },
        { name: 'Mesa 10', minCapacity: 4, maxCapacity: 6 },
        { name: 'Mesa 11', minCapacity: 4, maxCapacity: 6 },
        { name: 'Mesa 12', minCapacity: 4, maxCapacity: 6 },
        { name: 'Mesa 13', minCapacity: 6, maxCapacity: 8 },
        { name: 'Mesa 14', minCapacity: 6, maxCapacity: 10 },
        { name: 'Mesa 15', minCapacity: 8, maxCapacity: 12 }
      ]
    }
  ],

  menu: [
    {
      name: 'ENTRANTES FRÍOS',
      items: [
        { name: 'Carpaccio de ventresca de atún rojo', price: '20€' },
        { name: 'Hueva de mújol en semi salazón con almendra marcona', price: '11€' },
        { name: 'Anchoa de Lolin', price: '3€' },
        { name: 'Nuestra marinera', price: '4.5 / 6€' },
        { name: 'Ensaladilla de pulpo', price: '10 / 17€' },
        { name: 'Sardina ahumada', price: '5€' },
        { name: 'Ensalada de ventresca de bonito', price: '20€' },
        { name: 'Ensalada de sardina ahumada', price: '19.5€' },
        { name: 'Cecina de Astorga', price: '10 / 17€' },
        { name: 'Embutidos de Guadalest Casa Gloria', price: '8 / 12€' },
        { name: 'Tabla de quesos', price: '10 / 16€' }
      ]
    },
    {
      name: 'ENTRANTES CALIENTES',
      items: [
        { name: 'Croquetas caseras', price: '3€' },
        { name: 'Sepionet plancha', price: '12 / 20€' },
        { name: 'Puntilla encebollada / Chipirón plancha', price: '21 / 11€ unidad' },
        { name: 'Chipirón encebollado', price: '11€ unidad' },
        { name: 'Almejas a la marinera', price: '21€' },
        { name: 'Mejillones al vapor', price: '12€' },
        { name: 'Mejillones picantones', price: '12€' },
        { name: 'Pulpo dos cocciones', price: '22€' }
      ]
    },
    {
      name: 'LOS MÁS ESPECIALES',
      items: [
        { name: 'Quisquilla 100gr.', price: '17€' },
        { name: 'Gamba roja 1ª', price: 'S. Mercado' },
        { name: 'Salpicón de langosta', price: 'S. Mercado' }
      ]
    },
    {
      name: 'PARA DAR LA LATA',
      items: [
        { name: 'Caviar Tanit King Gold Lata 10 gr.', price: '30€' },
        { name: 'Navajas al natural Real Conservera Española', price: '22€' },
        { name: 'Mejillones en escabeche con papas', price: '16€' },
        { name: 'Sardinillas en aceite Real Conservera Española', price: '22€' }
      ]
    },
    {
      name: 'INDIVIDUALES',
      items: [
        { name: 'Merluza rebozada', price: '24€' },
        { name: 'Ventresca de atún rojo', price: '30€' },
        { name: 'Solomillo de ternera', price: '25€' }
      ]
    },
    {
      name: 'SEGUNDOS COMPARTIR (Precio por persona)',
      items: [
        { name: 'Rodaballo a la castreña', price: '30€' },
        { name: 'Cogote de merluza', price: '24€' },
        { name: 'Lubina a la espalda', price: '29€' },
        { name: 'Cherna al horno', price: '29€' },
        { name: 'Dentón a la espalda', price: '30€' },
        { name: 'Urta a la espalda', price: '29€' },
        { name: 'Besugo a la espalda', price: '35€' },
        { name: 'Cabracho al horno', price: '30€' },
        { name: 'Corvina a la espalda', price: '25€' },
        { name: 'Chuleta de vaca (Precio pieza)', price: '42€/kilo' }
      ]
    },
    {
      name: 'Acompañamientos y Extras',
      items: [
        { name: 'Pan de pueblo', price: '1€ P.P.' },
        { name: 'Salsas extra', price: '1€' },
        { name: 'Aceitunas', price: '1€' },
        { name: 'Almendras fritas', price: '2.5€' },
        { name: 'Aceite Verdeliss', price: '1.5€ P.P.' }
      ]
    }
  ]
}

export default mesonMarinero
