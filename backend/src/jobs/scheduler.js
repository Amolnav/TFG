
const cron = require('node-cron');
const { runReminderSweep } = require('./reminderJobs');
const { runWaitlistSweep } = require('../services/waitlistService');
const { runGdprSweep } = require('../services/gdprService');
const { logger } = require('../config/logger');

// N1.2: scheduler del backend (node-cron, misma instancia que la API).
// Los jobs son idempotentes (guardas en BD), así que un reinicio a mitad de
// barrido no duplica envíos. Desactivable con DISABLE_SCHEDULER=true.
//
// Diseño single-instance (una instancia por restaurante). Si algún día se
// escala a varias instancias, el barrido debe protegerse con el advisory
// lock de PostgreSQL (como hace withBookingTransaction).

const tasks = [];

function startScheduler() {
  if (process.env.DISABLE_SCHEDULER === 'true') {
    logger.info('⏰ Scheduler desactivado (DISABLE_SCHEDULER=true)');
    return [];
  }

  // Recordatorios/reconfirmación y lista de espera: cada 10 minutos
  tasks.push(
    cron.schedule('*/10 * * * *', () => {
      runReminderSweep().catch((error) => {
        logger.error('❌ Error en el barrido de recordatorios:', error);
      });
      runWaitlistSweep().catch((error) => {
        logger.error('❌ Error en el barrido de la lista de espera:', error);
      });
    })
  );

  // Retención RGPD (N4.4): diario a las 04:30 (no-op con gdpr_retention_months=0)
  tasks.push(
    cron.schedule('30 4 * * *', () => {
      runGdprSweep().catch((error) => {
        logger.error('❌ Error en el barrido de retención RGPD:', error);
      });
    })
  );

  logger.info('⏰ Scheduler iniciado (recordatorios y lista de espera cada 10 min; retención RGPD diaria)');
  return tasks;
}

function stopScheduler() {
  for (const task of tasks) {
    try {
      task.stop();
    } catch {
      // parar un task ya detenido no debe romper el shutdown
    }
  }
  tasks.length = 0;
}

module.exports = { startScheduler, stopScheduler };
