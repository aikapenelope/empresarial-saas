import { describe, expect, it } from 'vitest';
import { lineItemsChanged } from '@/utilities/lineItems';

/**
 * ─── `lineItemsChanged` (Sprint CI-2b · hallazgo P0) ────────────────────────
 *
 * Es la detección que faltaba: en un `update` de Payload, `data.items` llega
 * pre-rellenado con las líneas del documento original, así que "¿hay líneas?"
 * no sirve para decidir "¿cambiaron las líneas?". Aquí se fija el contrato:
 * sólo `true` cuando el contenido realmente difiere (por valor, ignorando el id
 * de fila del array y resolviendo relaciones pobladas a su id).
 */

const original = [
  { id: 'row-a', product: 5, sku: 'A', description: 'Uno', quantity: 2, unitPriceUSD: 10, totalUSD: 20 },
  { id: 'row-b', product: 7, sku: 'B', description: 'Dos', quantity: 1, unitPriceUSD: 5, totalUSD: 5 },
];

describe('lineItemsChanged', () => {
  it('devuelve false si el llamador no envió líneas', () => {
    expect(lineItemsChanged(undefined, original)).toBe(false);
    expect(lineItemsChanged(null, original)).toBe(false);
    expect(lineItemsChanged('no-array', original)).toBe(false);
  });

  it('devuelve true si el documento original no tenía líneas', () => {
    expect(lineItemsChanged(original, undefined)).toBe(true);
    expect(lineItemsChanged(original, null)).toBe(true);
  });

  it('EL CASO DEL P0: mismas líneas con ids de fila distintos NO cuentan como cambio', () => {
    // Payload clona las líneas del original; el id de fila puede variar.
    const incoming = original.map(({ id: _id, ...rest }) => rest);
    expect(lineItemsChanged(incoming, original)).toBe(false);
  });

  it('el mismo contenido con las claves en distinto orden NO cuenta como cambio', () => {
    const incoming = [
      { quantity: 2, unitPriceUSD: 10, totalUSD: 20, description: 'Uno', sku: 'A', product: 5 },
      { totalUSD: 5, sku: 'B', quantity: 1, product: 7, unitPriceUSD: 5, description: 'Dos' },
    ];
    expect(lineItemsChanged(incoming, original)).toBe(false);
  });

  it('una relación poblada equivale a su id (no cuenta como cambio)', () => {
    const incoming = [
      { ...original[0], product: { id: 5 } },
      { ...original[1], product: { id: 7 } },
    ];
    expect(lineItemsChanged(incoming, original)).toBe(false);
  });

  it('cambiar una cantidad SÍ cuenta como cambio', () => {
    const incoming = [{ ...original[0], quantity: 3 }, original[1]];
    expect(lineItemsChanged(incoming, original)).toBe(true);
  });

  it('cambiar el precio unitario SÍ cuenta como cambio', () => {
    const incoming = [{ ...original[0], unitPriceUSD: 11 }, original[1]];
    expect(lineItemsChanged(incoming, original)).toBe(true);
  });

  it('cambiar la descripción SÍ cuenta como cambio', () => {
    const incoming = [{ ...original[0], description: 'Uno editado' }, original[1]];
    expect(lineItemsChanged(incoming, original)).toBe(true);
  });

  it('cambiar el número de líneas SÍ cuenta como cambio', () => {
    expect(lineItemsChanged([original[0]], original)).toBe(true);
    expect(lineItemsChanged([...original, { product: 9, quantity: 1, unitPriceUSD: 1 }], original)).toBe(true);
  });

  it('cambiar el producto SÍ cuenta como cambio', () => {
    const incoming = [{ ...original[0], product: 99 }, original[1]];
    expect(lineItemsChanged(incoming, original)).toBe(true);
  });
});
