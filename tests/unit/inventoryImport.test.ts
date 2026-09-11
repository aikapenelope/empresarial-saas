import { describe, expect, it } from 'vitest';
import { aggregateStockRows } from '@/utilities/inventoryImport';

describe('aggregateStockRows (agregación pura de la importación de inventario, IE-PR7)', () => {
  it('modo adjust: consolida el delta neto por SKU en UN agregado', () => {
    const { aggregates, rowErrors } = aggregateStockRows(
      [
        { sku: 'MP-A', quantity: 5 },
        { sku: 'MP-B', quantity: -2 },
        { sku: 'MP-A', quantity: 3 },
      ],
      'adjust',
    );

    expect(rowErrors).toEqual([]);
    expect(aggregates.get('MP-A')?.delta).toBe(8);
    expect(aggregates.get('MP-A')?.rowNumbers).toEqual([2, 4]);
    expect(aggregates.get('MP-B')?.delta).toBe(-2);
    expect(aggregates.size).toBe(2);
  });

  it('modo set: la última fila manda para el mismo SKU', () => {
    const { aggregates, rowErrors } = aggregateStockRows(
      [
        { sku: 'PT-1', quantity: 10 },
        { sku: 'PT-1', quantity: 25 },
      ],
      'set',
    );

    expect(rowErrors).toEqual([]);
    expect(aggregates.get('PT-1')?.setTarget).toBe(25);
  });

  it('rechaza por fila: SKU vacío, cantidad no numérica y delta cero (adjust)', () => {
    const { aggregates, rowErrors } = aggregateStockRows(
      [
        { sku: '', quantity: 5 },
        { sku: 'MP-A', quantity: Number.NaN },
        { sku: 'MP-A', quantity: 0 },
        { sku: 'MP-A', quantity: 7 },
      ],
      'adjust',
    );

    expect(rowErrors.map((e) => e.message)).toEqual([
      'SKU vacío.',
      'Cantidad no numérica.',
      'El delta no puede ser cero.',
    ]);
    // Las filas válidas de MP-A siguen agregándose (7):
    expect(aggregates.get('MP-A')?.delta).toBe(7);
  });

  it('en adjust el delta cero NO rechaza en modo set (cantidad 0 es un objetivo válido)', () => {
    const { aggregates, rowErrors } = aggregateStockRows([{ sku: 'PT-2', quantity: 0 }], 'set');
    expect(rowErrors).toEqual([]);
    expect(aggregates.get('PT-2')?.setTarget).toBe(0);
  });

  it('un agregado dejado vacío por un delta cero se elimina del mapa (Devin #84)', () => {
    const { aggregates, rowErrors } = aggregateStockRows(
      [
        { sku: 'A', quantity: 0 },
        { sku: 'B', quantity: 3 },
      ],
      'adjust',
    );
    expect(rowErrors.map((e) => e.message)).toEqual(['El delta no puede ser cero.']);
    // Sin el delete, el agregado vacío de A produciría un ok/none
    // contradictorio con el error en el dry-run.
    expect(aggregates.has('A')).toBe(false);
    expect(aggregates.get('B')?.delta).toBe(3);
  });

  it('un agregado con filas aceptadas se conserva aunque otra fila sea cero', () => {
    const { aggregates, rowErrors } = aggregateStockRows(
      [
        { sku: 'A', quantity: 5 },
        { sku: 'A', quantity: 0 },
      ],
      'adjust',
    );
    expect(rowErrors).toHaveLength(1);
    expect(aggregates.get('A')?.delta).toBe(5);
  });

  it('rowNumbers son 1-based contando el encabezado (primera fila de datos = 2)', () => {
    const { aggregates } = aggregateStockRows(
      [
        { sku: 'A', quantity: 1 },
        { sku: 'B', quantity: 1 },
        { sku: 'A', quantity: 1 },
      ],
      'adjust',
    );
    expect(aggregates.get('A')?.rowNumbers).toEqual([2, 4]);
    expect(aggregates.get('B')?.rowNumbers).toEqual([3]);
  });
});
