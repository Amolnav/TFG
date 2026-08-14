
require('dotenv').config();
const http = require('http');
const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const pinoHttp = require('pino-http');
const prisma = require('./config/database');
const { initMonitoring } = require('./config/monitoring');
const { initSocketServer } = require('./socketManager');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
const { authMiddleware } = require('./middleware/authMiddleware');
const { publicLimiter, loginLimiter } = require('./middleware/rateLimiter');

// --- IMPORTACIÓN DE RUTAS ---
// Auth
const authRoutes = require('./routes/auth');

// Rutas públicas (Frontend cliente)
const publicReservationRoutes = require('./routes/public/reservations');
const publicMenuRoutes = require('./routes/public/menu');
const publicReviewsRoutes = require('./routes/public/reviews');
const publicConfigRoutes = require('./routes/public/config');

// Rutas back-office (Panel de gestión)
const backofficeBookingRoutes = require('./routes/backoffice/bookings');
const backofficeZoneRoutes = require('./routes/backoffice/zones');
const backofficeCustomerRoutes = require('./routes/backoffice/customers');
const backofficeShiftRoutes = require('./routes/backoffice/shifts');
const backofficeClosureRoutes = require('./routes/backoffice/closures');
const backofficeDashboardRoutes = require('./routes/backoffice/dashboard');
const backofficeConfigRoutes = require('./routes/backoffice/config');
const backofficeMenuRoutes = require('./routes/backoffice/menu');
const backofficeStaffRoutes = require('./routes/backoffice/staff');
const backofficeWaitlistRoutes = require('./routes/backoffice/waitlist');
const backofficeReportsRoutes = require('./routes/backoffice/reports');
const { logger } = require('./config/logger');

// --- CONFIGURACIÓN INICIAL ---
const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 4000;
const NODE_ENV = process.env.NODE_ENV || 'development';

// N4.3: Sentry opcional (no-op sin SENTRY_DSN)
initMonitoring();

// --- MIDDLEWARES GLOBALES ---
app.use(helmet()); // Seguridad HTTP
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true
}));

// N4.3: request-id por petición (se respeta el X-Request-Id entrante del
// proxy; si no llega, se genera). Visible en logs y en la respuesta.
app.use((req, res, next) => {
  req.id = req.get('x-request-id') || crypto.randomUUID();
  res.setHeader('X-Request-Id', req.id);
  next();
});

// N4.3: logging estructurado de peticiones (sustituye a morgan y al logger
// manual de desarrollo; la redacción de sensibles la aplica pino)
app.use(pinoHttp({
  logger: logger.pino,
  genReqId: (req) => req.id,
  autoLogging: {
    ignore: (req) => req.url === '/health' || req.url === '/'
  },
  customLogLevel: (req, res, err) => {
    if (err || res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  }
}));

app.use(express.json({ limit: '10mb' })); // Parser JSON
app.use(express.urlencoded({ extended: true, limit: '10mb' })); // Parser URL-encoded

// --- DEFINICIÓN DE RUTAS ---

// 1. Health Check
app.get('/', (req, res) => {
  res.json({
    status: 'online',
    service: 'Motor de Reservas API',
    version: '2.0.0',
    environment: NODE_ENV,
    timestamp: new Date().toISOString()
  });
});

// 2. Health Check avanzado (con DB)
app.get('/health', async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({
      status: 'healthy',
      database: 'connected',
      uptime: process.uptime(),
      memory: process.memoryUsage()
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      database: 'disconnected',
      error: error.message
    });
  }
});

// N3.5: sitemap.xml generado desde la configuración (idiomas activos) y la
// URL pública del despliegue. El nginx del frontend lo proxya a esta ruta.
app.get('/sitemap.xml', async (req, res) => {
  try {
    const configService = require('./services/configService');
    const base = (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '');
    const languages = String(await configService.getConfigValue('languages_supported') || 'es')
      .split(',').map((lang) => lang.trim()).filter(Boolean);
    const routes = ['/', '/reservar', '/carta', '/historia'];
    const today = new Date().toISOString().slice(0, 10);

    const urls = routes.map((route) => {
      const alternates = languages.length > 1
        ? languages.map((lang) =>
            `    <xhtml:link rel="alternate" hreflang="${lang}" href="${base}${route}?lng=${lang}"/>`
          ).join('\n')
        : '';
      return `  <url>\n    <loc>${base}${route}</loc>\n    <lastmod>${today}</lastmod>\n${alternates}${alternates ? '\n' : ''}  </url>`;
    }).join('\n');

    res.type('application/xml').send(
      `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls}\n</urlset>\n`
    );
  } catch (error) {
    logger.error('❌ Error generando sitemap:', error);
    res.status(500).type('text/plain').send('sitemap error');
  }
});

// N4.1: rate limiting. trust proxy=1 para que req.ip sea el cliente real
// detrás del proxy único del despliegue (nginx del compose o Render).
app.set('trust proxy', 1);
app.use('/api/auth/login', loginLimiter);
app.use('/api/public', publicLimiter);

// 3. Auth
app.use('/api/auth', authRoutes);

// 4. APIs PÚBLICAS (Frontend Cliente)
app.use('/api/public/reservations', publicReservationRoutes);
app.use('/api/public/menu', publicMenuRoutes);
app.use('/api/public/reviews', publicReviewsRoutes);
app.use('/api/public/config', publicConfigRoutes);

// 5. APIs BACK-OFFICE (Panel de Gestión) — protegidas con JWT
app.use('/api/backoffice', authMiddleware);
app.use('/api/backoffice/bookings', backofficeBookingRoutes);
app.use('/api/backoffice/zones', backofficeZoneRoutes);
app.use('/api/backoffice/customers', backofficeCustomerRoutes);
app.use('/api/backoffice/shifts', backofficeShiftRoutes);
app.use('/api/backoffice/closures', backofficeClosureRoutes);
app.use('/api/backoffice/dashboard', backofficeDashboardRoutes);
app.use('/api/backoffice/config', backofficeConfigRoutes);
app.use('/api/backoffice/menu', backofficeMenuRoutes);
app.use('/api/backoffice/staff', backofficeStaffRoutes);
app.use('/api/backoffice/waitlist', backofficeWaitlistRoutes);
app.use('/api/backoffice/reports', backofficeReportsRoutes);

// 5. Ruta de Debug - Ver zonas y mesas (Solo desarrollo)
if (NODE_ENV === 'development') {
  app.get('/api/debug/zones', async (req, res) => {
    try {
      const zones = await prisma.zone.findMany({
        include: { 
          tables: true,
          _count: { select: { tables: true } }
        }
      });
      res.json({
        status: 'success',
        data: zones
      });
    } catch (error) {
      logger.error(error);
      res.status(500).json({ error: 'Error obteniendo zonas' });
    }
  });

  app.get('/api/debug/customers', async (req, res) => {
    try {
      const customers = await prisma.customer.findMany({
        include: {
          _count: { select: { bookings: true } }
        },
        take: 20,
        orderBy: { createdAt: 'desc' }
      });
      res.json({
        status: 'success',
        data: customers
      });
    } catch (error) {
      logger.error(error);
      res.status(500).json({ error: 'Error obteniendo clientes' });
    }
  });
}

// --- MANEJO DE ERRORES ---
// Rutas no encontradas
app.use(notFoundHandler);

// Manejo global de errores
app.use(errorHandler);

// --- ARRANQUE DEL SERVIDOR ---
async function startServer() {
  try {
    // Comprobar la zona horaria del proceso (BUG-04)
    const { checkTimezone } = require('./config/timezone');
    const tzCheck = checkTimezone();
    tzCheck.warnings.forEach((warning) => logger.warn(`⚠️  ${warning}`));
    logger.info(`🕐 Zona horaria activa: ${tzCheck.timezone}`);

    // Conectar a la base de datos
    await prisma.$connect();
    logger.info('✅ Base de Datos PostgreSQL: CONECTADA');

    // M4: cargar las reglas de negocio configurables (SystemConfig) en caché
    const { loadBookingRules } = require('./config/bookingRules');
    await loadBookingRules();
    
    // Verificar que hay datos iniciales
    const zoneCount = await prisma.zone.count();
    const tableCount = await prisma.table.count();
    
    if (zoneCount === 0 || tableCount === 0) {
      logger.info('⚠️  ADVERTENCIA: No hay zonas o mesas en la base de datos.');
      logger.info('   Ejecuta: npm run db:seed');
    } else {
      logger.info(`📊 Datos: ${zoneCount} zonas, ${tableCount} mesas`);
    }

    // N1.2: scheduler de jobs (recordatorios/reconfirmación y derivados)
    const { startScheduler } = require('./jobs/scheduler');
    startScheduler();

    // Iniciar servidor Socket.io + HTTP
    initSocketServer(server);
    server.listen(PORT, () => {
      logger.info('');
      logger.info('═══════════════════════════════════════════');
      logger.info('🚀 MOTOR DE RESERVAS API v2.0');
      logger.info('═══════════════════════════════════════════');
      logger.info(`📍 Servidor: http://localhost:${PORT}`);
      logger.info(`🌍 Entorno: ${NODE_ENV}`);
      logger.info(`⏰ Iniciado: ${new Date().toLocaleString()}`);
      logger.info('');
      logger.info('📡 Endpoints disponibles:');
      logger.info('   🌐 Frontend Público:');
      logger.info('      POST /api/public/reservations/availability/check');
      logger.info('      GET  /api/public/reservations/availability/calendar');
      logger.info('      POST /api/public/reservations/availability/times');
      logger.info('      POST /api/public/reservations');
      logger.info('');
      logger.info('   🏢 Back-office:');
      logger.info('      GET  /api/backoffice/bookings');
      logger.info('      GET  /api/backoffice/dashboard');
      logger.info('      GET  /api/backoffice/customers');
      logger.info('      ... y más');
      logger.info('');
      logger.info('═══════════════════════════════════════════');
      logger.info('');
    });
  } catch (error) {
    logger.error('❌ Error fatal al iniciar el servidor:', error);
    process.exit(1);
  }
}

async function shutdown(signal) {
  logger.info(`\n⚠️  Cerrando servidor (${signal})...`);
  const { stopScheduler } = require('./jobs/scheduler');
  stopScheduler();
  await prisma.$disconnect();
  logger.info('✅ Conexión a BD cerrada');
  process.exit(0);
}

// Manejo de cierre graceful
process.on('SIGINT', async () => {
  await shutdown('SIGINT');
});

process.on('SIGTERM', async () => {
  await shutdown('SIGTERM');
});

// Iniciar solo si se ejecuta directamente
if (require.main === module) {
  startServer();
}

module.exports = app;
