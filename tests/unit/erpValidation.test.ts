import { describe, expect, it } from 'vitest';
import {
  buildBusinessDateRange,
  businessListFiltersSchema,
  formatBusinessDate,
  invoicesListFiltersSchema,
} from '@/utilities/erpValidation';

describe('buildBusinessDateRange (calendario Venezuela UTC-4)', () => {
  it('el borde "desde" es inclusivo a las 00:00 locales (-04:00)', () => {
    const conditions = buildBusinessDateRange('2026-03-01', undefined, 'createdAt');

    expect(conditions).toHaveLength(1);
    expect(conditions[0].createdAt).toEqual({
      greater_than_equal: '2026-03-01T04:00:00.000Z',
    });
  });

  it('el borde "hasta" es exclusivo con el día siguiente local (incluye la noche venezolana)', () => {
    const conditions = buildBusinessDateRange(undefined, '2026-03-31', 'createdAt');

    expect(conditions).toHaveLength(1);
    // 2026-04-01 00:00-04:00 == 04:00 UTC: una venta del 31/03 a las 21:00
    // Caracas (01:00 UTC del 1/04) cae DENTRO del rango.
    expect(conditions[0].createdAt).toEqual({
      less_than: '2026-04-01T04:00:00.000Z',
    });
  });

  it('aplica el rango sobre issueDate para documentos de venta', () => {
    const conditions = buildBusinessDateRange('2026-03-01', '2026-03-31', 'issueDate');

    expect(conditions).toHaveLength(2);
    expect(conditions[0].issueDate).toBeDefined();
    expect(conditions[1].issueDate).toBeDefined();
    expect(conditions[0].createdAt).toBeUndefined();
  });

  it('sin fechas devuelve un AND vacío (sin filtrar)', () => {
    expect(buildBusinessDateRange(undefined, undefined, 'issueDate')).toEqual([]);
  });
});

describe('formatBusinessDate (día de negocio America/Caracas)', () => {
  it('una venta de las 21:00 locales conserva SU día aunque UTC ya sea mañana (hallazgo Devin 54)', () => {
    // 2026-03-14 21:00-04:00 == 2026-03-15 01:00Z
    expect(formatBusinessDate('2026-03-15T01:00:00.000Z')).toBe('2026-03-14');
  });

  it('registros alrededor de medianoche UTC muestran la fecha de negocio correcta', () => {
    // 2026-03-15 23:30-04:00 == 2026-03-16 03:30Z → sigue siendo 15/03 local
    expect(formatBusinessDate('2026-03-16T03:30:00.000Z')).toBe('2026-03-15');
    // 2026-03-15 00:15-04:00 == 2026-03-15 04:15Z → 15/03 en ambas zonas
    expect(formatBusinessDate('2026-03-15T04:15:00.000Z')).toBe('2026-03-15');
  });

  it('produce YYYY-MM-DD: el mismo formato que los filtros from/to', () => {
    expect(formatBusinessDate('2026-09-08T12:00:00.000Z')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('devuelve cadena vacía ante valores inválidos (contrato tolerante de los exports)', () => {
    expect(formatBusinessDate('')).toBe('');
    expect(formatBusinessDate('no-es-fecha')).toBe('');
    expect(formatBusinessDate(undefined)).toBe('');
  });
});

describe('schemas de filtros de negocio', () => {
  it('descarta (catch) fechas malformadas en lugar de rechazar la petición', () => {
    const parsed = businessListFiltersSchema.parse({ from: 'abc', to: '2026-13-45' });

    expect(parsed.from).toBeUndefined();
    expect(parsed.to).toBeUndefined();
  });

  it('acepta el contrato completo de facturas (fechas + estado + página)', () => {
    const parsed = invoicesListFiltersSchema.parse({
      from: '2026-03-01',
      to: '2026-03-31',
      status: 'partially_paid',
      page: '3',
    });

    expect(parsed).toEqual({ from: '2026-03-01', to: '2026-03-31', status: 'partially_paid', page: 3 });
  });

  it('descarta un estado fuera del enum (contrato tolerante: no rechaza la petición)', () => {
    const parsed = invoicesListFiltersSchema.parse({ status: 'converted' });

    expect(parsed.status).toBeUndefined();
  });
});
