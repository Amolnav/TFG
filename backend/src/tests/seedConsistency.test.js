import { describe, it, expect } from 'vitest';
import { RESTAURANTS } from '../../prisma/restaurants';
const { CONFIG_SCHEMA } = require('../config/configSchema');

// M6: los datasets de restaurante son la única fuente de datos de marca.
// Este test garantiza que cada dataset versionado es internamente coherente
// y que TODA su configuración pasa la whitelist/validadores del configSchema
// (lo mismo que exigiría PATCH /backoffice/config).
describe('coherencia de los datasets de restaurante (M6)', () => {
  const datasets = Object.values(RESTAURANTS);

  it('hay al menos dos datasets versionados (demo + ejemplo neutro)', () => {
    expect(datasets.length).toBeGreaterThanOrEqual(2);
    expect(RESTAURANTS['meson-marinero']).toBeTruthy();
    expect(RESTAURANTS['bar-ejemplo']).toBeTruthy();
  });

  for (const data of Object.values(RESTAURANTS)) {
    describe(`dataset "${data.key}"`, () => {
      it('todas las claves de config existen en configSchema y validan', () => {
        for (const [key, value] of Object.entries(data.config)) {
          const entry = CONFIG_SCHEMA[key];
          expect(entry, `clave desconocida en el dataset: "${key}"`).toBeTruthy();
          const serialized = typeof value === 'string' ? value : JSON.stringify(value);
          expect(
            entry.validate(serialized),
            `valor inválido para "${key}": ${entry.hint}`
          ).toBe(true);
        }
      });

      it('los turnos tienen días 0-6 y horas coherentes', () => {
        expect(data.shifts.length).toBeGreaterThan(0);
        const toMinutes = (t) => {
          const [h, m] = t.split(':').map(Number);
          return h * 60 + m;
        };
        for (const shift of data.shifts) {
          expect(shift.daysOfWeek.length).toBeGreaterThan(0);
          for (const day of shift.daysOfWeek) {
            expect(Number.isInteger(day)).toBe(true);
            expect(day).toBeGreaterThanOrEqual(0);
            expect(day).toBeLessThanOrEqual(6);
          }
          expect(toMinutes(shift.startTime)).toBeLessThan(toMinutes(shift.endTime));
          expect(shift.slotInterval).toBeGreaterThan(0);
        }
      });

      it('tiene zonas con mesas y capacidades válidas', () => {
        expect(data.zones.length).toBeGreaterThan(0);
        const tables = data.zones.flatMap((zone) => zone.tables);
        expect(tables.length).toBeGreaterThan(0);
        for (const table of tables) {
          expect(table.minCapacity).toBeGreaterThan(0);
          expect(table.maxCapacity).toBeGreaterThanOrEqual(table.minCapacity);
        }
      });

      it('tiene carta y admin de demo', () => {
        expect(data.menu.length).toBeGreaterThan(0);
        expect(data.demoAdmin.email).toMatch(/@/);
      });
    });
  }

  it('la marca del dataset demo no se cuela en el dataset neutro', () => {
    const serialized = JSON.stringify(RESTAURANTS['bar-ejemplo']);
    expect(serialized).not.toMatch(/mes[oó]n\s*marinero/i);
  });
});
