# Assets de marca (convención /branding)

Coloca aquí los assets del restaurante desplegado y refénciales desde la
configuración (panel de administración o fichero de seed):

| Fichero (sugerido)  | Se usa en                              | Clave de config              |
|---------------------|----------------------------------------|------------------------------|
| `logo.svg`          | Navbar, login y panel                  | `brand_logo`                 |
| `hero.jpg/svg`      | Portada de la home                     | `hero_config.image`          |
| `about.jpg/svg`     | Sección "Sobre nosotros"               | `about_config.image`         |
| `reservation.jpg`   | Panel lateral de la página de reservas | `reservation_config.image`   |
| `map.jpg`           | Mapa del pie de página                 | `map_image`                  |
| `dishN.jpg`         | Tarjetas de especialidades             | `specialties_config.items[].image` |

Los SVG de este directorio son *placeholders* neutros del dataset
"Bar Ejemplo"; sustitúyelos por los assets reales (idealmente WebP/JPEG
optimizados, < 300 KB por imagen).
