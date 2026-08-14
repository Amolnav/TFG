
const nodemailer = require('nodemailer');
const configService = require('./configService');
const { resolveEmailTexts } = require('../locales/emailTexts');
const { logger } = require('../config/logger');

// BUG-19: si SMTP_PORT no estaba definida, el puerto caía a 465 pero
// `secure` evaluaba false (undefined == 465) → STARTTLS contra un puerto
// de TLS implícito y el envío colgaba. Se normaliza el puerto a número y
// secure se deriva del valor efectivo.
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '465', 10);

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: SMTP_PORT,
  secure: SMTP_PORT === 465, // true para 465 (TLS implícito), false para el resto
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

const OVERRIDE_RECIPIENT = process.env.EMAIL_OVERRIDE_RECIPIENT;

// M1: la identidad y el tema del email salen de SystemConfig, no de
// constantes de módulo. El backend no conoce assets del frontend: la
// plantilla solo usa texto y colores.
const IDENTITY_KEYS = [
  'restaurant_name',
  'restaurant_address',
  'restaurant_phone',
  'theme_primary',
  'theme_primary_light',
  'font_body',
  'language_default'
];

/**
 * Plantilla base para los correos (colores y fuente desde config — M3)
 */
const getBaseTemplate = (content, identity, texts) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body {
      font-family: ${identity.font_body};
      line-height: 1.6;
      color: #333;
      margin: 0;
      padding: 0;
      background-color: #f4f7f9;
    }
    .container {
      max-width: 600px;
      margin: 20px auto;
      background: #ffffff;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 10px 30px rgba(0,0,0,0.1);
    }
    .header {
      background: linear-gradient(135deg, ${identity.theme_primary_light} 0%, ${identity.theme_primary} 100%);
      padding: 40px 20px;
      text-align: center;
      color: white;
    }
    .header h1 {
      margin: 0;
      font-size: 28px;
      letter-spacing: 2px;
      text-transform: uppercase;
    }
    .content {
      padding: 30px;
    }
    .booking-details {
      background: #fdfdfd;
      border: 1px solid #eee;
      border-radius: 8px;
      padding: 20px;
      margin: 20px 0;
    }
    .detail-item {
      display: flex;
      justify-content: space-between;
      margin-bottom: 10px;
      border-bottom: 1px dashed #eee;
      padding-bottom: 8px;
    }
    .detail-item:last-child {
      border-bottom: none;
    }
    .label {
      font-weight: bold;
      color: ${identity.theme_primary_light};
    }
    .footer {
      background: #f9f9f9;
      padding: 20px;
      text-align: center;
      font-size: 12px;
      color: #777;
    }
    .button {
        display: inline-block;
        padding: 12px 24px;
        background: ${identity.theme_primary_light};
        color: white !important;
        text-decoration: none;
        border-radius: 6px;
        margin-top: 20px;
        font-weight: bold;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>${identity.restaurant_name}</h1>
    </div>
    <div class="content">
      ${content}
    </div>
    <div class="footer">
      <p>&copy; ${new Date().getFullYear()} ${identity.restaurant_name}</p>
      ${identity.restaurant_address ? `<p>${identity.restaurant_address}</p>` : ''}
      <p>${texts.autoNotice}</p>
    </div>
  </div>
</body>
</html>
`;

/**
 * Contexto común de todos los emails: identidad+tema de SystemConfig, textos
 * en el idioma del cliente (cascada M5) y fecha/hora localizadas.
 */
async function buildEmailContext(booking, customer) {
  const identity = await configService.getConfigValues(IDENTITY_KEYS);
  const { texts, language } = resolveEmailTexts(customer.language, identity.language_default);

  const dateStr = new Date(booking.date).toLocaleDateString(language, {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });
  const timeStr = new Date(booking.date).toLocaleTimeString(language, {
    hour: '2-digit', minute: '2-digit'
  });

  return { identity, texts, language, dateStr, timeStr };
}

/** Tarjeta con los datos de la reserva (compartida por todas las plantillas) */
function bookingDetailsCard(booking, { texts, dateStr, timeStr }) {
  return `
    <div class="booking-details">
      <div class="detail-item">
        <span class="label">${texts.dateLabel}</span>
        <span>${dateStr}</span>
      </div>
      <div class="detail-item">
        <span class="label">${texts.timeLabel}</span>
        <span>${timeStr}</span>
      </div>
      <div class="detail-item">
        <span class="label">${texts.paxLabel}</span>
        <span>${texts.paxValue(booking.pax)}</span>
      </div>
      <div class="detail-item">
        <span class="label">${texts.tableLabel}</span>
        <span>${booking.table?.zone?.name ?? booking.table?.name ?? '—'}</span>
      </div>
    </div>`;
}

function emailEnvelope(ctx, subject, content) {
  return {
    language: ctx.language,
    subject,
    html: getBaseTemplate(content, ctx.identity, ctx.texts),
    from: process.env.SMTP_FROM || `"${ctx.identity.restaurant_name}" <${process.env.SMTP_USER}>`
  };
}

function phoneBlock(ctx) {
  return ctx.identity.restaurant_phone ? `
    <div style="text-align: center; margin-top: 20px; color: #777;">
        <p>${ctx.texts.phoneLine(ctx.identity.restaurant_phone)}</p>
    </div>` : '';
}

/**
 * Construye el email de confirmación (asunto + HTML) con la identidad de
 * SystemConfig y en el idioma del cliente. Puro salvo la lectura de config:
 * lo usan el envío real, los tests y la generación de evidencias.
 */
async function buildBookingConfirmationEmail(booking, customer) {
  const ctx = await buildEmailContext(booking, customer);
  const { texts, identity } = ctx;

  // N1.1: botón "Gestionar mi reserva" hacia la página pública /reserva/:token
  const manageBlock = booking.confirmationToken
    ? `
    <p>${texts.manageText}</p>
    <div style="text-align: center;">
      <a class="button" href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/reserva/${booking.confirmationToken}">${texts.manageCta}</a>
    </div>`
    : '';

  const content = `
    <h2>${texts.greeting(customer.firstName)}</h2>
    <p>${texts.confirmedText}</p>
    ${bookingDetailsCard(booking, ctx)}
    <p>${texts.seeYou(identity.restaurant_name)}</p>
    ${manageBlock}
    ${phoneBlock(ctx)}
  `;

  return emailEnvelope(ctx, texts.confirmationSubject(identity.restaurant_name), content);
}

/**
 * N1.3: email de cancelación. byRestaurant distingue el tono: cancelación
 * iniciada por el restaurante (disculpa) o por el propio cliente.
 */
async function buildBookingCancellationEmail(booking, customer, { byRestaurant = false } = {}) {
  const ctx = await buildEmailContext(booking, customer);
  const { texts, identity } = ctx;

  const rebookUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/reservar`;
  const content = `
    <h2>${texts.greeting(customer.firstName)}</h2>
    <p>${byRestaurant ? texts.cancelledByRestaurantText : texts.cancelledText}</p>
    ${bookingDetailsCard(booking, ctx)}
    <div style="text-align: center;">
      <a class="button" href="${rebookUrl}">${texts.rebookCta}</a>
    </div>
    ${phoneBlock(ctx)}
  `;

  return emailEnvelope(ctx, texts.cancellationSubject(identity.restaurant_name), content);
}

/**
 * N1.3: email de modificación (nueva fecha/hora/mesa de la reserva).
 */
async function buildBookingModificationEmail(booking, customer) {
  const ctx = await buildEmailContext(booking, customer);
  const { texts, identity } = ctx;

  const content = `
    <h2>${texts.greeting(customer.firstName)}</h2>
    <p>${texts.modifiedText}</p>
    ${bookingDetailsCard(booking, ctx)}
    <p>${texts.seeYou(identity.restaurant_name)}</p>
    ${phoneBlock(ctx)}
  `;

  return emailEnvelope(ctx, texts.modificationSubject(identity.restaurant_name), content);
}

/**
 * N1.2: recordatorio con reconfirmación en un clic. Requiere que la reserva
 * tenga reconfirmToken (lo genera el job) y confirmationToken (autogestión).
 */
async function buildBookingReminderEmail(booking, customer) {
  const ctx = await buildEmailContext(booking, customer);
  const { texts, identity } = ctx;
  const base = process.env.FRONTEND_URL || 'http://localhost:5173';

  const content = `
    <h2>${texts.greeting(customer.firstName)}</h2>
    <p>${texts.reminderText}</p>
    ${bookingDetailsCard(booking, ctx)}
    <div style="text-align: center;">
      <a class="button" href="${base}/reconfirmar/${booking.reconfirmToken}">${texts.reminderConfirmCta}</a>
    </div>
    ${booking.confirmationToken ? `
    <p style="margin-top: 24px;">${texts.reminderManageText}</p>
    <div style="text-align: center;">
      <a href="${base}/reserva/${booking.confirmationToken}">${texts.manageCta}</a>
    </div>` : ''}
    ${phoneBlock(ctx)}
  `;

  return emailEnvelope(ctx, texts.reminderSubject(identity.restaurant_name), content);
}

/**
 * N3.4: petición de reseña tras completarse la visita ({ reviewUrl }).
 */
async function buildReviewRequestEmail(booking, customer, { reviewUrl } = {}) {
  const ctx = await buildEmailContext(booking, customer);
  const { texts, identity } = ctx;

  const content = `
    <h2>${texts.greeting(customer.firstName)}</h2>
    <p>${texts.reviewText(identity.restaurant_name)}</p>
    <div style="text-align: center;">
      <a class="button" href="${reviewUrl}">${texts.reviewCta}</a>
    </div>
    ${phoneBlock(ctx)}
  `;

  return emailEnvelope(ctx, texts.reviewSubject(identity.restaurant_name), content);
}

/**
 * N1.4: aviso de hueco libre para la lista de espera.
 * `entry` tiene forma de reserva ({date, pax}) para reutilizar la tarjeta.
 * options: { holdHours, bookUrl }
 */
async function buildWaitlistAvailableEmail(entry, customer, { holdHours = 2, bookUrl } = {}) {
  const ctx = await buildEmailContext(entry, customer);
  const { texts, identity } = ctx;

  const content = `
    <h2>${texts.greeting(customer.firstName)}</h2>
    <p>${texts.waitlistText(holdHours)}</p>
    ${bookingDetailsCard(entry, ctx)}
    <div style="text-align: center;">
      <a class="button" href="${bookUrl}">${texts.waitlistCta}</a>
    </div>
    ${phoneBlock(ctx)}
  `;

  return emailEnvelope(ctx, texts.waitlistSubject(identity.restaurant_name), content);
}

/**
 * N1.3: cierre sobrevenido — el restaurante cierra un día con reservas.
 * Disculpa + enlace directo para re-reservar.
 */
async function buildClosureNoticeEmail(booking, customer, { reason = '' } = {}) {
  const ctx = await buildEmailContext(booking, customer);
  const { texts, identity } = ctx;

  const rebookUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/reservar`;
  const content = `
    <h2>${texts.greeting(customer.firstName)}</h2>
    <p>${texts.closureText(reason)}</p>
    ${bookingDetailsCard(booking, ctx)}
    <div style="text-align: center;">
      <a class="button" href="${rebookUrl}">${texts.rebookCta}</a>
    </div>
    ${phoneBlock(ctx)}
  `;

  return emailEnvelope(ctx, texts.closureSubject(identity.restaurant_name), content);
}

/**
 * Envío genérico fire-and-forget. BUG-20: todo el cuerpo va dentro de
 * try/catch — cualquier throw fuera sería una promesa rechazada sin manejar
 * que tumbaría el proceso DESPUÉS de responder al cliente.
 */
async function sendSafely(label, buildFn, booking, customer, options) {
  try {
    const email = await buildFn(booking, customer, options);

    const mailOptions = {
      from: email.from,
      to: OVERRIDE_RECIPIENT || customer.email,
      subject: email.subject,
      html: email.html,
    };

    await transporter.sendMail(mailOptions);
    logger.info(`📧 Email de ${label} enviado a ${mailOptions.to} (${email.language})`);
  } catch (error) {
    logger.error(`❌ Error enviando email de ${label}:`, error);
  }
}

/** Enviar confirmación de reserva (en el idioma del cliente — M5) */
exports.sendBookingConfirmation = (booking, customer) =>
  sendSafely('confirmación', buildBookingConfirmationEmail, booking, customer);

/** N1.3: enviar cancelación ({ byRestaurant } ajusta el tono) */
exports.sendBookingCancellation = (booking, customer, options = {}) =>
  sendSafely('cancelación', buildBookingCancellationEmail, booking, customer, options);

/** N1.3: enviar modificación (nueva fecha/hora) */
exports.sendBookingModification = (booking, customer) =>
  sendSafely('modificación', buildBookingModificationEmail, booking, customer);

/** N1.3: enviar aviso de cierre sobrevenido ({ reason }) */
exports.sendClosureNotice = (booking, customer, options = {}) =>
  sendSafely('cierre', buildClosureNoticeEmail, booking, customer, options);

/** N1.2: enviar recordatorio con reconfirmación */
exports.sendBookingReminder = (booking, customer) =>
  sendSafely('recordatorio', buildBookingReminderEmail, booking, customer);

/** N3.4: enviar petición de reseña post-visita ({ reviewUrl }) */
exports.sendReviewRequest = (booking, customer, options = {}) =>
  sendSafely('reseña', buildReviewRequestEmail, booking, customer, options);

/** N1.4: enviar aviso de hueco libre a la lista de espera ({ holdHours, bookUrl }) */
exports.sendWaitlistAvailable = (entry, customer, options = {}) =>
  sendSafely('lista de espera', buildWaitlistAvailableEmail, entry, customer, options);

exports.buildBookingConfirmationEmail = buildBookingConfirmationEmail;
exports.buildBookingCancellationEmail = buildBookingCancellationEmail;
exports.buildBookingModificationEmail = buildBookingModificationEmail;
exports.buildClosureNoticeEmail = buildClosureNoticeEmail;
exports.buildBookingReminderEmail = buildBookingReminderEmail;
exports.buildReviewRequestEmail = buildReviewRequestEmail;
exports.buildWaitlistAvailableEmail = buildWaitlistAvailableEmail;
