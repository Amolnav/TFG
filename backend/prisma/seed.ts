import 'dotenv/config'
import { PrismaClient, BookingStatus } from '@prisma/client'
import * as bcrypt from 'bcryptjs'
import { RESTAURANTS, DEFAULT_RESTAURANT } from './restaurants'
import type { RestaurantSeedData } from './restaurants/types'

/**
 * Seed parametrizado (plan de modularidad M6).
 *
 * Selección de restaurante:  RESTAURANT=<clave>   (default: meson-marinero)
 * Modo:                      SEED_MODE=demo|prod  (default: demo)
 *
 *  - demo: estructura + configuración + clientes y reservas de ejemplo
 *    (fechas relativas al día del seed) + admin demo.
 *  - prod: SOLO estructura + configuración + admin. Exige SEED_ADMIN_EMAIL
 *    y SEED_ADMIN_PASSWORD por entorno; no siembra ningún dato de ejemplo.
 */

const prisma = new PrismaClient()

const restaurantKey = process.env.RESTAURANT || DEFAULT_RESTAURANT
const seedMode = process.env.SEED_MODE || 'demo'

// Fechas de demo relativas al día del seed: las reservas de ejemplo nunca
// caducan y los tests E2E disponen de datos deterministas.
function demoDate(offsetDays: number): string {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${month}-${day}`
}

function buildDate(date: string, time: string) {
  return new Date(`${date}T${time}:00`)
}

/** Primeros N slots de un turno (para generar reservas de demo válidas). */
function shiftSlots(shift: RestaurantSeedData['shifts'][number], count: number): string[] {
  const toMinutes = (t: string) => {
    const [h, m] = t.split(':').map(Number)
    return h * 60 + m
  }
  const slots: string[] = []
  let current = toMinutes(shift.startTime)
  const end = toMinutes(shift.endTime)
  while (current < end && slots.length < count) {
    slots.push(`${String(Math.floor(current / 60)).padStart(2, '0')}:${String(current % 60).padStart(2, '0')}`)
    current += shift.slotInterval
  }
  return slots
}

async function seedStructure(data: RestaurantSeedData) {
  // Turnos
  await prisma.shift.createMany({
    data: data.shifts.map((shift) => ({
      name: shift.name,
      startTime: shift.startTime,
      endTime: shift.endTime,
      isActive: shift.isActive,
      slotInterval: shift.slotInterval,
      daysOfWeek: shift.daysOfWeek,
      maxBookingsPerSlot: shift.maxBookingsPerSlot ?? null
    }))
  })
  console.log(`✅ ${data.shifts.length} turnos creados`)

  // Zonas y mesas
  for (const zone of data.zones) {
    await prisma.zone.create({
      data: {
        name: zone.name,
        description: zone.description ?? null,
        isActive: true,
        displayOrder: zone.displayOrder,
        tables: {
          create: zone.tables.map((table) => ({
            name: table.name,
            minCapacity: table.minCapacity,
            maxCapacity: table.maxCapacity,
            isActive: true
          }))
        }
      }
    })
  }
  const tableCount = data.zones.reduce((sum, zone) => sum + zone.tables.length, 0)
  console.log(`✅ ${data.zones.length} zonas y ${tableCount} mesas creadas`)

  // Configuración (los valores objeto se serializan a JSON)
  await prisma.systemConfig.createMany({
    data: Object.entries(data.config).map(([key, value]) => ({
      key,
      value: typeof value === 'string' ? value : JSON.stringify(value)
    }))
  })
  console.log(`✅ ${Object.keys(data.config).length} claves de configuración sembradas`)

  // Carta
  for (const [catIndex, category] of data.menu.entries()) {
    await prisma.menuCategory.create({
      data: {
        name: category.name,
        description: category.description ?? null,
        isActive: true,
        displayOrder: catIndex,
        items: {
          create: category.items.map((item, itemIndex) => ({
            name: item.name,
            description: item.description ?? null,
            price: item.price,
            isActive: true,
            displayOrder: itemIndex + 1
          }))
        }
      }
    })
  }
  console.log(`✅ Carta creada con ${data.menu.length} categorías`)
}

async function seedAdmin(data: RestaurantSeedData) {
  if (seedMode === 'prod') {
    const email = process.env.SEED_ADMIN_EMAIL
    const password = process.env.SEED_ADMIN_PASSWORD
    if (!email || !password) {
      throw new Error(
        'SEED_MODE=prod exige definir SEED_ADMIN_EMAIL y SEED_ADMIN_PASSWORD en el entorno (no hay credenciales por defecto en producción).'
      )
    }
    await prisma.staff.create({
      data: {
        email,
        passwordHash: await bcrypt.hash(password, 10),
        name: 'Administrador',
        role: 'ADMIN',
        isActive: true
      }
    })
    console.log(`✅ Staff admin creado: ${email} (credenciales del entorno)`)
    return email
  }

  // BUG-27: en demo la contraseña sigue siendo configurable por entorno
  const password = process.env.SEED_ADMIN_PASSWORD || 'admin1234'
  await prisma.staff.create({
    data: {
      email: data.demoAdmin.email,
      passwordHash: await bcrypt.hash(password, 10),
      name: data.demoAdmin.name,
      role: 'ADMIN',
      isActive: true
    }
  })
  console.log(
    process.env.SEED_ADMIN_PASSWORD
      ? `✅ Staff admin demo creado: ${data.demoAdmin.email} (contraseña de SEED_ADMIN_PASSWORD)`
      : `✅ Staff admin demo creado: ${data.demoAdmin.email} / admin1234 (demo — define SEED_ADMIN_PASSWORD para cambiarla)`
  )
  return data.demoAdmin.email
}

/** Clientes CRM sintéticos (RGPD: ningún dato personal real). */
const DEMO_CUSTOMERS = [
  {
    email: 'cliente.demo1@example.com',
    phone: '+34600000001',
    firstName: 'Juan',
    lastName: 'Martín',
    language: 'es',
    allergens: [],
    totalVisits: 1,
    tags: []
  },
  {
    email: 'cliente.demo2@example.com',
    phone: '+34600000002',
    firstName: 'Alex',
    lastName: 'Serrano',
    language: 'es',
    allergens: [],
    totalVisits: 2,
    tags: []
  },
  {
    email: 'alergias.demo@example.com',
    phone: '+34600000003',
    firstName: 'Aitor',
    lastName: 'García López',
    language: 'es',
    allergens: ['Marisco', 'Gluten', 'Frutos secos'],
    totalVisits: 1,
    tags: []
  },
  {
    email: 'bloqueado.demo@example.com',
    phone: '+34600000000',
    firstName: 'Cliente',
    lastName: 'Bloqueado',
    language: 'es',
    allergens: [],
    totalVisits: 3,
    isBlacklisted: true,
    tags: ['BLACKLIST'],
    totalNoShows: 3,
    blacklistReason: 'No se presenta'
  },
  {
    email: 'english.demo@example.com',
    phone: '+34600000004',
    firstName: 'Emma',
    lastName: 'Smith',
    language: 'en',
    allergens: [],
    totalVisits: 1,
    tags: []
  },
  {
    email: 'celiaco.demo@example.com',
    phone: '+34600000005',
    firstName: 'Marta',
    lastName: 'Campos',
    language: 'es',
    allergens: ['Gluten'],
    preferences: 'Si es posible, pan sin gluten para la mesa.',
    totalVisits: 1,
    tags: []
  },
  {
    email: 'habitual.demo@example.com',
    phone: '+34600000006',
    firstName: 'Nacho',
    lastName: 'Sanz',
    language: 'es',
    allergens: [],
    totalVisits: 7,
    isVip: true,
    tags: ['VIP']
  },
  {
    email: 'vip.demo@example.com',
    phone: '+34600000007',
    firstName: 'María',
    lastName: 'García',
    language: 'es',
    allergens: ['Nueces'],
    preferences: 'Mesa tranquila. Agua sin gas.',
    totalVisits: 24,
    isVip: true,
    tags: ['VIP']
  }
]

async function seedDemoData(data: RestaurantSeedData) {
  await prisma.customer.createMany({ data: DEMO_CUSTOMERS })
  console.log(`✅ ${DEMO_CUSTOMERS.length} clientes CRM de demo creados`)

  const customers = await prisma.customer.findMany({
    where: { isBlacklisted: false },
    orderBy: { email: 'asc' }
  })
  const tables = await prisma.table.findMany({ orderBy: { maxCapacity: 'asc' } })
  const activeShifts = data.shifts.filter((shift) => shift.isActive)

  if (customers.length === 0 || tables.length === 0 || activeShifts.length === 0) return

  // Reservas de demo generadas a partir de los turnos y mesas REALES del
  // dataset: válidas para cualquier restaurante.
  const requests = [
    'Mesa cerca de la ventana',
    'Celebración tranquila',
    'Trona para niño',
    'Sin gluten para uno de los comensales',
    'Aniversario, postre con vela si es posible',
    null
  ]

  let created = 0
  let tokenCounter = 1

  for (let offset = 0; offset <= 4; offset++) {
    const perDay = offset === 0 ? 4 : 2
    const shift = activeShifts[offset % activeShifts.length]
    const slots = shiftSlots(shift, perDay)

    for (let i = 0; i < perDay && i < slots.length; i++) {
      const customer = customers[(created + i) % customers.length]
      const table = tables[(created + i) % tables.length]
      const pax = Math.min(2, table.maxCapacity)
      const isPast = offset === 0 && i === 0

      await prisma.booking.create({
        data: {
          date: buildDate(demoDate(offset), slots[i]),
          pax: Math.max(pax, table.minCapacity),
          duration: 90,
          status: isPast ? BookingStatus.COMPLETED : BookingStatus.CONFIRMED,
          customerId: customer.id,
          tableId: table.id,
          specialRequests: requests[(created + i) % requests.length],
          confirmationToken: `demo-${String(tokenCounter++).padStart(3, '0')}`,
          confirmedAt: buildDate(demoDate(offset - 1), '10:00'),
          completedAt: isPast ? buildDate(demoDate(offset), slots[i]) : null
        }
      })
      created++
    }
  }

  console.log(`✅ ${created} reservas de demo creadas (fechas relativas al día del seed)`)
}

async function main() {
  const data = RESTAURANTS[restaurantKey]
  if (!data) {
    throw new Error(
      `Restaurante desconocido: "${restaurantKey}". Disponibles: ${Object.keys(RESTAURANTS).join(', ')}`
    )
  }

  console.log(`🌱 SEED (${seedMode.toUpperCase()}) — dataset: ${restaurantKey}`)

  // 1. LIMPIEZA (orden inverso por claves foráneas)
  await prisma.waitlist.deleteMany()
  await prisma.bookingEvent.deleteMany()
  await prisma.booking.deleteMany()
  await prisma.closure.deleteMany()
  await prisma.shift.deleteMany()
  await prisma.table.deleteMany()
  await prisma.zone.deleteMany()
  await prisma.customerNote.deleteMany()
  await prisma.customer.deleteMany()
  await prisma.staff.deleteMany()
  await prisma.menuItem.deleteMany()
  await prisma.menuCategory.deleteMany()
  await prisma.systemConfig.deleteMany()
  console.log('🧹 Base de datos limpia.')

  const adminEmail = await seedAdmin(data)
  await seedStructure(data)

  if (seedMode !== 'prod') {
    await seedDemoData(data)
  }

  console.log('')
  console.log('🚀 SEED COMPLETADO. Resumen:')
  console.log(`   🏷️  Restaurante: ${data.config.restaurant_name} (${restaurantKey})`)
  console.log(`   👤 Staff: ${adminEmail}`)
  console.log(`   🕐 Turnos: ${data.shifts.map((s) => `${s.name} (${s.startTime}-${s.endTime})`).join(', ')}`)
  console.log(`   🏢 Zonas: ${data.zones.map((z) => z.name).join(', ')}`)
  console.log(`   ⚙️ ${Object.keys(data.config).length} claves de configuración`)
  if (seedMode === 'prod') {
    console.log('   🔒 Modo producción: sin clientes ni reservas de ejemplo')
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
