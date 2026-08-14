import { describe, it, expect, vi, beforeEach } from 'vitest';
const prisma = require('../../config/database');
import {
  validatePaxCount,
  validateEmail,
  validateAllergens
} from '../../services/validationService';

describe('validationService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('validatePaxCount', () => {
    it('debería ser válido si está dentro del rango', async () => {
      prisma.table.findFirst.mockResolvedValue({ maxCapacity: 10 });
      const result = await validatePaxCount(4);
      expect(result.valid).toBe(true);
    });

    it('debería fallar si supera la mesa más grande', async () => {
      prisma.table.findFirst.mockResolvedValue({ maxCapacity: 8 });
      const result = await validatePaxCount(12);
      expect(result.valid).toBe(false);
      expect(result.code).toBe('PAX_ABOVE_MAX');
    });
  });

  describe('validateEmail', () => {
    it('debería aceptar emails válidos', () => {
      expect(validateEmail('test@example.com')).toBe(true);
    });
  });

  describe('validateAllergens', () => {
    it('debería limpiar y sanitizar alergias', () => {
      const input = [' Gluten ', '<b>Lactosa</b>'];
      const result = validateAllergens(input);
      expect(result).toEqual(['Gluten', 'Lactosa']);
    });
  });
});
