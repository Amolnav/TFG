import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../../index';
const prisma = require('../../config/database');

// M1: GET /api/public/config expone TODAS las claves públicas del configSchema
// con defaults neutros ("Mi Restaurante") y el horario derivado de los turnos
// reales, nunca textos hardcodeados.
describe('GET /api/public/config (M1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.systemConfig.findMany.mockResolvedValue([]);
    prisma.shift.findMany.mockResolvedValue([]);
  });

  it('sin configuración devuelve defaults NEUTROS, sin marca de ningún cliente', async () => {
    const res = await request(app).get('/api/public/config');
    expect(res.status).toBe(200);
    const config = res.body.data;
    expect(config.restaurant_name).toBe('Mi Restaurante');
    expect(config.restaurant_address).toBe('');
    expect(config.restaurant_phone).toBe('');
    expect(config.brand_logo).toBe('🍽️');
    expect(config.language_default).toBe('es');
    expect(config.currency).toBe('EUR');
    expect(config.specialties.items).toEqual([]);
    expect(JSON.stringify(config)).not.toMatch(/mes[oó]n|marinero|alicante/i);
  });

  it('el horario público se deriva de los turnos reales (schedule)', async () => {
    prisma.shift.findMany.mockResolvedValue([
      { name: 'Comidas', startTime: '13:30', endTime: '17:00', daysOfWeek: [2, 3, 4] },
      { name: 'Cenas', startTime: '20:30', endTime: '23:30', daysOfWeek: [4, 5, 6] }
    ]);

    const res = await request(app).get('/api/public/config');
    expect(res.status).toBe(200);
    const { schedule } = res.body.data;
    expect(schedule.openingDays).toEqual([2, 3, 4, 5, 6]);
    expect(schedule.shifts).toHaveLength(2);
    expect(schedule.shifts[0]).toMatchObject({ name: 'Comidas', startTime: '13:30', endTime: '17:00' });
  });

  it('los valores de BD pisan los defaults (incluidas las claves JSON)', async () => {
    prisma.systemConfig.findMany.mockResolvedValue([
      { key: 'restaurant_name', value: 'Bar Ejemplo' },
      { key: 'restaurant_tagline', value: 'Tapas de barrio' },
      { key: 'theme_primary', value: '#14532D' },
      {
        key: 'hero_config',
        value: JSON.stringify({ title: { es: 'Hola' }, subtitle: { es: 'Mundo' }, image: '/branding/hero.svg' })
      }
    ]);

    const res = await request(app).get('/api/public/config');
    const config = res.body.data;
    expect(config.restaurant_name).toBe('Bar Ejemplo');
    expect(config.restaurant_tagline).toBe('Tapas de barrio');
    expect(config.theme_primary).toBe('#14532D');
    expect(config.hero.title.es).toBe('Hola');
  });

  it('un JSON corrupto en BD cae al default sin romper el payload', async () => {
    prisma.systemConfig.findMany.mockResolvedValue([
      { key: 'specialties_config', value: '{roto' }
    ]);

    const res = await request(app).get('/api/public/config');
    expect(res.status).toBe(200);
    expect(res.body.data.specialties.items).toEqual([]);
  });

  it('expone las zonas activas para el selector del wizard (N3.2)', async () => {
    prisma.zone.findMany.mockResolvedValue([
      { id: 1, name: 'Terraza', description: 'Al aire libre' },
      { id: 2, name: 'Interior', description: null }
    ]);

    const res = await request(app).get('/api/public/config');
    expect(res.status).toBe(200);
    expect(res.body.data.zones).toHaveLength(2);
    expect(res.body.data.zones[0]).toMatchObject({ id: 1, name: 'Terraza' });
    // El selector viene desactivado por defecto (default neutro)
    expect(res.body.data.zone_selection_enabled).toBe('false');
  });

  it('las claves privadas (reglas de negocio) NO se exponen al público', async () => {
    const res = await request(app).get('/api/public/config');
    const config = res.body.data;
    expect(config.booking_durations).toBeUndefined();
    expect(config.no_show_threshold).toBeUndefined();
    expect(config.booking_min_hours_ahead).toBeUndefined();
  });
});
