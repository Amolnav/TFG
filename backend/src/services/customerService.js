
const prisma = require('../config/database');
const { BusinessError, ValidationError } = require('../middleware/errorHandler');
const { getBookingRules } = require('../config/bookingRules');

/**
 * Busca o crea un cliente.
 * BUG-09: la identidad se resuelve SOLO por email (actual o histórico).
 * Emparejar por teléfono permitía "secuestrar" la ficha de otro cliente
 * sobrescribiendo su email y nombre. El teléfono se actualiza únicamente
 * sobre un cliente ya identificado por su email.
 * totalVisits NO se toca aquí: se registra con registerVisit() cuando la
 * reserva se crea con éxito (antes se inflaba con intentos fallidos).
 */
async function findOrCreateCustomer(email, customerData) {
  const { firstName, lastName, phone, allergens, language } = customerData;

  // M5: idioma normalizado a código base en minúsculas ("es-ES" → "es")
  const normalizedLanguage = typeof language === 'string' && /^[a-zA-Z]{2}/.test(language)
    ? language.toLowerCase().split('-')[0]
    : null;

  // Validar email
  if (!email || !isValidEmail(email)) {
    throw new ValidationError('Email inválido');
  }

  const normalizedEmail = email.toLowerCase().trim();

  let customer = await prisma.customer.findFirst({
    where: {
      OR: [
        { email: normalizedEmail },
        { previousEmails: { has: normalizedEmail } }
      ]
    },
    include: {
      bookings: {
        orderBy: { date: 'desc' },
        take: 5
      }
    }
  });

  if (customer) {
    // Cliente existente: actualizar datos y guardar en historial
    const updateData = {};

    // Gestionar historial de nombres
    const currentFullName = `${firstName} ${lastName}`.trim();
    if (currentFullName && !customer.previousNames.includes(currentFullName)) {
      updateData.previousNames = [...customer.previousNames, currentFullName];
    }

    // Gestionar historial de emails. Si el email casó por previousEmails,
    // solo se restaura como principal si no pertenece ya a otro cliente
    // (email es unique en BD).
    if (normalizedEmail !== customer.email) {
      const emailOwner = await prisma.customer.findUnique({
        where: { email: normalizedEmail }
      });
      if (!emailOwner || emailOwner.id === customer.id) {
        if (!customer.previousEmails.includes(customer.email)) {
          updateData.previousEmails = [...customer.previousEmails, customer.email];
        }
        updateData.email = normalizedEmail;
      }
    } else if (!customer.previousEmails.includes(normalizedEmail)) {
      updateData.previousEmails = [...customer.previousEmails, normalizedEmail];
    }

    // Gestionar historial de teléfonos
    if (phone && phone !== customer.phone) {
      if (!customer.previousPhones.includes(customer.phone)) {
        updateData.previousPhones = [...customer.previousPhones, customer.phone];
      }
      updateData.phone = phone;
    } else if (phone && !customer.previousPhones.includes(phone)) {
      updateData.previousPhones = [...customer.previousPhones, phone];
    }

    // Actualizar campos principales con la información más reciente
    if (firstName) updateData.firstName = firstName;
    if (lastName) updateData.lastName = lastName;

    // M5: el idioma con el que reservó pasa a ser su idioma de comunicación
    if (normalizedLanguage) updateData.language = normalizedLanguage;

    // Actualizar alergias
    if (allergens && allergens.length > 0) {
      const existingAllergens = customer.allergens || [];
      const combinedAllergens = [...new Set([...existingAllergens, ...allergens])];
      updateData.allergens = combinedAllergens;
    }

    customer = await prisma.customer.update({
      where: { id: customer.id },
      data: updateData,
      include: {
        bookings: {
          orderBy: { date: 'desc' },
          take: 5
        }
      }
    });

    return {
      customer,
      isNew: false,
      message: `¡Hola de nuevo, ${customer.firstName}!`
    };
  }

  // Cliente nuevo: crear con historial inicial (la visita se registra al confirmar)
  customer = await prisma.customer.create({
    data: {
      email: normalizedEmail,
      firstName: firstName || 'Cliente',
      lastName: lastName || '',
      phone: phone || '',
      ...(normalizedLanguage ? { language: normalizedLanguage } : {}),
      allergens: allergens || [],
      totalVisits: 0,
      previousEmails: [normalizedEmail],
      previousPhones: phone ? [phone] : [],
      previousNames: [`${firstName} ${lastName}`.trim()]
    }
  });

  return {
    customer,
    isNew: true,
    message: `¡Bienvenido, ${customer.firstName}!`
  };
}

/**
 * Registra una visita (incremento de totalVisits) para un cliente.
 * Se llama solo cuando la reserva se ha creado con éxito (BUG-09).
 * @param {string} customerId
 * @param {Object} db - Cliente Prisma o transacción (por defecto prisma)
 */
async function registerVisit(customerId, db = prisma) {
  return db.customer.update({
    where: { id: customerId },
    data: { totalVisits: { increment: 1 } }
  });
}

/**
 * Obtiene el perfil completo de un cliente
 */
async function getCustomerProfile(customerId) {
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    include: {
      bookings: {
        orderBy: { date: 'desc' },
        include: {
          table: { include: { zone: true } }
        }
      },
      notes: {
        orderBy: { createdAt: 'desc' }
      },
      waitlist: {
        where: { isResolved: false },
        orderBy: { createdAt: 'desc' }
      }
    }
  });
  
  if (!customer) {
    throw new BusinessError('Cliente no encontrado', 'NOT_FOUND', 404);
  }
  
  // Calcular estadísticas
  const stats = calculateCustomerStats(customer);
  
  return {
    ...customer,
    stats
  };
}

/**
 * Calcula estadísticas de un cliente
 */
function calculateCustomerStats(customer) {
  const bookings = customer.bookings || [];
  
  const completed = bookings.filter(b => b.status === 'COMPLETED').length;
  const cancelled = bookings.filter(b => b.status === 'CANCELLED').length;
  const noShows = bookings.filter(b => b.status === 'NO_SHOW').length;
  const upcoming = bookings.filter(b => 
    ['PENDING', 'CONFIRMED', 'RECONFIRMED'].includes(b.status) &&
    new Date(b.date) > new Date()
  ).length;
  
  // Calcular fidelidad (% de reservas completadas)
  const totalRelevant = completed + noShows;
  const loyaltyRate = totalRelevant > 0 
    ? Math.round((completed / totalRelevant) * 100) 
    : 100;
  
  // Calcular frecuencia (días entre visitas)
  let avgDaysBetweenVisits = 0;
  if (completed >= 2) {
    const completedBookings = bookings
      .filter(b => b.status === 'COMPLETED')
      .sort((a, b) => new Date(b.date) - new Date(a.date));
    
    let totalDays = 0;
    for (let i = 0; i < completedBookings.length - 1; i++) {
      const diff = new Date(completedBookings[i].date) - new Date(completedBookings[i + 1].date);
      totalDays += Math.floor(diff / (1000 * 60 * 60 * 24));
    }
    avgDaysBetweenVisits = Math.round(totalDays / (completedBookings.length - 1));
  }
  
  return {
    totalBookings: bookings.length,
    completed,
    cancelled,
    noShows,
    upcoming,
    loyaltyRate,
    avgDaysBetweenVisits,
    riskLevel: noShows >= getBookingRules().noShowThreshold ? 'HIGH' : noShows > 0 ? 'MEDIUM' : 'LOW'
  };
}

/**
 * Actualiza el perfil de un cliente
 */
async function updateCustomerProfile(customerId, updateData) {
  const customer = await prisma.customer.findUnique({
    where: { id: customerId }
  });
  
  if (!customer) {
    throw new BusinessError('Cliente no encontrado', 'NOT_FOUND', 404);
  }
  
  const updated = await prisma.customer.update({
    where: { id: customerId },
    data: {
      ...updateData,
      updatedAt: new Date()
    }
  });
  
  return updated;
}

/**
 * Añade una nota sobre un cliente
 */
async function addCustomerNote(customerId, noteText, createdBy) {
  const customer = await prisma.customer.findUnique({
    where: { id: customerId }
  });
  
  if (!customer) {
    throw new BusinessError('Cliente no encontrado', 'NOT_FOUND', 404);
  }
  
  const note = await prisma.customerNote.create({
    data: {
      customerId,
      note: noteText,
      createdBy
    }
  });
  
  return note;
}

/**
 * Gestiona etiquetas de un cliente (VIP, preferencias, etc.)
 */
async function manageCustomerTags(customerId, tags, action = 'SET') {
  const customer = await prisma.customer.findUnique({
    where: { id: customerId }
  });
  
  if (!customer) {
    throw new BusinessError('Cliente no encontrado', 'NOT_FOUND', 404);
  }
  
  let newTags;

  switch (action) {
    case 'SET':
      newTags = tags;
      break;
    case 'ADD':
      newTags = [...new Set([...(customer.tags || []), ...tags])];
      break;
    case 'REMOVE':
      newTags = (customer.tags || []).filter(tag => !tags.includes(tag));
      break;
    default:
      throw new ValidationError('Acción inválida: usa SET, ADD o REMOVE');
  }
  
  const updated = await prisma.customer.update({
    where: { id: customerId },
    data: { tags: newTags }
  });
  
  return updated;
}

/**
 * Marca/desmarca un cliente en la lista negra
 */
async function toggleBlacklist(customerId, reason = null, blacklist = true) {
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    include: { bookings: true }
  });
  
  if (!customer) {
    throw new BusinessError('Cliente no encontrado', 'NOT_FOUND', 404);
  }
  
  const updated = await prisma.customer.update({
    where: { id: customerId },
    data: {
      isBlacklisted: blacklist,
      blacklistReason: blacklist ? reason : null
    }
  });
  
  // Si se añade a la blacklist, añadir tag automático
  if (blacklist) {
    await manageCustomerTags(customerId, ['BLACKLIST'], 'ADD');
  } else {
    await manageCustomerTags(customerId, ['BLACKLIST'], 'REMOVE');
  }
  
  return {
    customer: updated,
    message: blacklist 
      ? `Cliente añadido a la lista negra: ${reason}` 
      : 'Cliente eliminado de la lista negra'
  };
}

/**
 * Marca un cliente como VIP
 */
async function toggleVIP(customerId, isVip = true) {
  const customer = await prisma.customer.findUnique({
    where: { id: customerId }
  });
  
  if (!customer) {
    throw new BusinessError('Cliente no encontrado', 'NOT_FOUND', 404);
  }
  
  const updated = await prisma.customer.update({
    where: { id: customerId },
    data: { isVip }
  });
  
  // Gestionar tag VIP
  if (isVip) {
    await manageCustomerTags(customerId, ['VIP'], 'ADD');
  } else {
    await manageCustomerTags(customerId, ['VIP'], 'REMOVE');
  }
  
  return updated;
}

/**
 * Busca clientes por varios criterios
 */
async function searchCustomers(searchTerm, filters = {}) {
  const whereClause = {};
  
  // Búsqueda por término (nombre, email, teléfono)
  if (searchTerm) {
    whereClause.OR = [
      { firstName: { contains: searchTerm, mode: 'insensitive' } },
      { lastName: { contains: searchTerm, mode: 'insensitive' } },
      { email: { contains: searchTerm, mode: 'insensitive' } },
      { phone: { contains: searchTerm } },
      { previousEmails: { has: searchTerm } },
      { previousPhones: { has: searchTerm } },
      { previousNames: { hasSome: [searchTerm] } }
    ];
  }
  
  // Filtros adicionales
  if (filters.isVip !== undefined) {
    whereClause.isVip = filters.isVip;
  }
  
  if (filters.isBlacklisted !== undefined) {
    whereClause.isBlacklisted = filters.isBlacklisted;
  }
  
  if (filters.tags && filters.tags.length > 0) {
    whereClause.tags = { hasSome: filters.tags };
  }
  
  const customers = await prisma.customer.findMany({
    where: whereClause,
    include: {
      bookings: {
        take: 1,
        orderBy: { date: 'desc' }
      },
      _count: {
        select: { bookings: true }
      }
    },
    orderBy: { totalVisits: 'desc' },
    take: filters.limit || 50
  });
  
  return customers;
}

/**
 * Obtiene el historial de reservas de un cliente
 */
async function getCustomerHistory(customerId, limit = 20) {
  const bookings = await prisma.booking.findMany({
    where: { customerId },
    include: {
      table: { include: { zone: true } }
    },
    orderBy: { date: 'desc' },
    take: limit
  });
  
  return bookings;
}

/**
 * Valida formato de email
 */
function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

module.exports = {
  findOrCreateCustomer,
  registerVisit,
  getCustomerProfile,
  updateCustomerProfile,
  addCustomerNote,
  manageCustomerTags,
  toggleBlacklist,
  toggleVIP,
  searchCustomers,
  getCustomerHistory,
  calculateCustomerStats
};