/**
 * Textos de los emails transaccionales por idioma (plan de modularidad M5).
 * El idioma se elige con Customer.language y cae en cascada:
 * idioma del cliente → language_default de config → 'es'.
 *
 * Solo UI genérica: la identidad (nombre, dirección, teléfono) llega por
 * parámetros desde SystemConfig.
 */

const EMAIL_TEXTS = {
  es: {
    confirmationSubject: (restaurantName) => `Confirmación de Reserva - ${restaurantName}`,
    greeting: (firstName) => `¡Hola, ${firstName}!`,
    confirmedText: 'Gracias por elegirnos. Tu reserva ha sido confirmada correctamente.',
    dateLabel: 'Fecha:',
    timeLabel: 'Hora:',
    paxLabel: 'Comensales:',
    paxValue: (pax) => `${pax} ${pax === 1 ? 'persona' : 'personas'}`,
    tableLabel: 'Zona/Mesa:',
    seeYou: (restaurantName) => `Te esperamos en <strong>${restaurantName}</strong>.`,
    // N1.1: autogestión por enlace (sustituye al antiguo "llama al restaurante")
    manageText: 'Puedes <strong>cancelar o cambiar</strong> tu reserva en cualquier momento desde este enlace:',
    manageCta: 'Gestionar mi reserva',
    phoneLine: (phone) => `☎️ Teléfono: ${phone}`,
    autoNotice: 'Este es un correo automático, por favor no responda.',
    // N1.3: ciclo de vida completo
    cancellationSubject: (restaurantName) => `Reserva cancelada - ${restaurantName}`,
    cancelledText: 'Tu reserva ha sido cancelada. Estos eran los datos:',
    cancelledByRestaurantText:
      'Lamentamos comunicarte que el restaurante ha tenido que <strong>cancelar tu reserva</strong>. Sentimos las molestias. Estos eran los datos:',
    modificationSubject: (restaurantName) => `Reserva actualizada - ${restaurantName}`,
    modifiedText: 'Tu reserva ha sido <strong>actualizada</strong>. Estos son los nuevos datos:',
    closureSubject: (restaurantName) => `Tu reserva ha sido cancelada - ${restaurantName}`,
    closureText: (reason) =>
      `Lamentamos comunicarte que el restaurante permanecerá <strong>cerrado</strong> el día de tu reserva${reason ? ` (${reason})` : ''} y nos hemos visto obligados a cancelarla. Sentimos mucho las molestias.`,
    rebookCta: 'Reservar de nuevo',
    // N1.2: recordatorio + reconfirmación
    reminderSubject: (restaurantName) => `Recordatorio de tu reserva - ${restaurantName}`,
    reminderText: 'Te recordamos tu próxima reserva. ¿Contamos contigo? Confírmanos tu asistencia con un clic:',
    reminderConfirmCta: 'Confirmo mi asistencia',
    reminderManageText: 'Si no puedes venir, cancela o cambia tu reserva desde aquí (nos ayuda a organizar la sala):',
    // N3.4: petición de reseña post-visita
    reviewSubject: (restaurantName) => `¿Qué tal todo? - ${restaurantName}`,
    reviewText: (restaurantName) =>
      `Gracias por visitarnos en <strong>${restaurantName}</strong>. Nos encantaría saber qué tal fue todo: tu opinión nos ayuda muchísimo.`,
    reviewCta: 'Dejar una reseña en Google',
    // N1.4: lista de espera — hueco disponible
    waitlistSubject: (restaurantName) => `¡Ha quedado una mesa libre! - ${restaurantName}`,
    waitlistText: (holdHours) =>
      `Estabas en nuestra lista de espera y <strong>ha quedado un hueco libre</strong> para el día que pediste. Este aviso es válido durante las próximas <strong>${holdHours} horas</strong>; después pasaremos al siguiente de la lista.`,
    waitlistCta: 'Reservar ahora'
  },
  en: {
    confirmationSubject: (restaurantName) => `Booking Confirmation - ${restaurantName}`,
    greeting: (firstName) => `Hello, ${firstName}!`,
    confirmedText: 'Thank you for choosing us. Your booking has been confirmed.',
    dateLabel: 'Date:',
    timeLabel: 'Time:',
    paxLabel: 'Guests:',
    paxValue: (pax) => `${pax} ${pax === 1 ? 'guest' : 'guests'}`,
    tableLabel: 'Area/Table:',
    seeYou: (restaurantName) => `We look forward to seeing you at <strong>${restaurantName}</strong>.`,
    // N1.1: self-service management link (replaces the old "call the restaurant")
    manageText: 'You can <strong>cancel or change</strong> your booking at any time using this link:',
    manageCta: 'Manage my booking',
    phoneLine: (phone) => `☎️ Phone: ${phone}`,
    autoNotice: 'This is an automated email, please do not reply.',
    // N1.3: full lifecycle
    cancellationSubject: (restaurantName) => `Booking cancelled - ${restaurantName}`,
    cancelledText: 'Your booking has been cancelled. These were the details:',
    cancelledByRestaurantText:
      'We are sorry to inform you that the restaurant has had to <strong>cancel your booking</strong>. We apologise for the inconvenience. These were the details:',
    modificationSubject: (restaurantName) => `Booking updated - ${restaurantName}`,
    modifiedText: 'Your booking has been <strong>updated</strong>. These are the new details:',
    closureSubject: (restaurantName) => `Your booking has been cancelled - ${restaurantName}`,
    closureText: (reason) =>
      `We are sorry to inform you that the restaurant will be <strong>closed</strong> on the day of your booking${reason ? ` (${reason})` : ''} and we have had to cancel it. We sincerely apologise for the inconvenience.`,
    rebookCta: 'Book again',
    // N1.2: reminder + reconfirmation
    reminderSubject: (restaurantName) => `Reminder of your booking - ${restaurantName}`,
    reminderText: 'This is a reminder of your upcoming booking. Can we count on you? Confirm your attendance with one click:',
    reminderConfirmCta: 'I confirm my attendance',
    reminderManageText: 'If you cannot make it, cancel or change your booking here (it helps us organise the room):',
    // N3.4: post-visit review request
    reviewSubject: (restaurantName) => `How was everything? - ${restaurantName}`,
    reviewText: (restaurantName) =>
      `Thank you for visiting us at <strong>${restaurantName}</strong>. We would love to hear how everything went: your feedback helps us a lot.`,
    reviewCta: 'Leave a review on Google',
    // N1.4: waitlist — slot available
    waitlistSubject: (restaurantName) => `A table just became available! - ${restaurantName}`,
    waitlistText: (holdHours) =>
      `You were on our waitlist and <strong>a slot has opened up</strong> for the day you requested. This notice is valid for the next <strong>${holdHours} hours</strong>; after that we will move on to the next person on the list.`,
    waitlistCta: 'Book now'
  },
  fr: {
    confirmationSubject: (restaurantName) => `Confirmation de Réservation - ${restaurantName}`,
    greeting: (firstName) => `Bonjour, ${firstName} !`,
    confirmedText: "Merci de nous avoir choisis. Votre réservation a été confirmée.",
    dateLabel: 'Date :',
    timeLabel: 'Heure :',
    paxLabel: 'Convives :',
    paxValue: (pax) => `${pax} ${pax === 1 ? 'personne' : 'personnes'}`,
    tableLabel: 'Zone/Table :',
    seeYou: (restaurantName) => `Nous vous attendons au <strong>${restaurantName}</strong>.`,
    // N1.1 : lien d'autogestion (remplace l'ancien « appelez le restaurant »)
    manageText: 'Vous pouvez <strong>annuler ou modifier</strong> votre réservation à tout moment via ce lien :',
    manageCta: 'Gérer ma réservation',
    phoneLine: (phone) => `☎️ Téléphone : ${phone}`,
    autoNotice: 'Ceci est un e-mail automatique, merci de ne pas répondre.',
    // N1.3 : cycle de vie complet
    cancellationSubject: (restaurantName) => `Réservation annulée - ${restaurantName}`,
    cancelledText: 'Votre réservation a été annulée. Voici les détails :',
    cancelledByRestaurantText:
      "Nous sommes au regret de vous informer que le restaurant a dû <strong>annuler votre réservation</strong>. Veuillez nous excuser pour la gêne occasionnée. Voici les détails :",
    modificationSubject: (restaurantName) => `Réservation mise à jour - ${restaurantName}`,
    modifiedText: 'Votre réservation a été <strong>mise à jour</strong>. Voici les nouveaux détails :',
    closureSubject: (restaurantName) => `Votre réservation a été annulée - ${restaurantName}`,
    closureText: (reason) =>
      `Nous sommes au regret de vous informer que le restaurant sera <strong>fermé</strong> le jour de votre réservation${reason ? ` (${reason})` : ''} et que nous avons dû l'annuler. Veuillez nous excuser pour la gêne occasionnée.`,
    rebookCta: 'Réserver à nouveau',
    // N1.2 : rappel + reconfirmation
    reminderSubject: (restaurantName) => `Rappel de votre réservation - ${restaurantName}`,
    reminderText: 'Petit rappel de votre prochaine réservation. Pouvons-nous compter sur vous ? Confirmez votre venue en un clic :',
    reminderConfirmCta: 'Je confirme ma venue',
    reminderManageText: "Si vous ne pouvez pas venir, annulez ou modifiez votre réservation ici (cela nous aide à organiser la salle) :",
    // N3.4 : demande d'avis après la visite
    reviewSubject: (restaurantName) => `Comment s'est passée votre visite ? - ${restaurantName}`,
    reviewText: (restaurantName) =>
      `Merci de votre visite au <strong>${restaurantName}</strong>. Nous serions ravis de savoir comment tout s'est passé : votre avis nous aide beaucoup.`,
    reviewCta: 'Laisser un avis sur Google',
    // N1.4 : liste d'attente — créneau disponible
    waitlistSubject: (restaurantName) => `Une table vient de se libérer ! - ${restaurantName}`,
    waitlistText: (holdHours) =>
      `Vous étiez sur notre liste d'attente et <strong>une place s'est libérée</strong> pour le jour demandé. Cet avis est valable pendant les <strong>${holdHours} prochaines heures</strong> ; passé ce délai, nous contacterons la personne suivante.`,
    waitlistCta: 'Réserver maintenant'
  }
};

/**
 * Normaliza un idioma ('ES', 'es-ES', 'fr'...) a la clave de plantilla y
 * resuelve la cascada de fallback.
 */
function resolveEmailTexts(customerLanguage, defaultLanguage = 'es') {
  const normalize = (lang) => String(lang || '').toLowerCase().split('-')[0];
  const candidates = [normalize(customerLanguage), normalize(defaultLanguage), 'es'];
  for (const candidate of candidates) {
    if (EMAIL_TEXTS[candidate]) {
      return { texts: EMAIL_TEXTS[candidate], language: candidate };
    }
  }
  return { texts: EMAIL_TEXTS.es, language: 'es' };
}

module.exports = { EMAIL_TEXTS, resolveEmailTexts };
