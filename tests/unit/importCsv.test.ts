import { describe, expect, it } from 'vitest';
import {
  detectColumn,
  detectDelimiter,
  parseCsvDocument,
  QTY_ALIASES,
  SKU_ALIASES,
} from '@/utilities/importCsv';

describe('parseCsvDocument (parser CSV del wizard de importación, Devin #84)', () => {
  it('el encabezado del template (existencia_total) mapea la columna de cantidad', () => {
    const doc = parseCsvDocument('sku,nombre,existencia_total\nA-1,"Tornillo, acero",20');

    expect(doc.headers).toEqual(['sku', 'nombre', 'existencia_total']);
    expect(QTY_ALIASES).toContain('existencia_total');
    expect(detectColumn(doc.headers, QTY_ALIASES, 1)).toBe(2);
    // La coma dentro de las comillas NO parte la fila, y las comillas se
    // desescapan (el valor de la celda es el texto limpio):
    expect(doc.lines[0]).toEqual(['A-1', 'Tornillo, acero', '20']);
  });

  it('soporta comillas escapadas ("") dentro de campos citados', () => {
    const doc = parseCsvDocument('sku,cantidad\nA-1,"Tornillo ""inox"", 10 u."');
    expect(doc.lines[0]).toContain('Tornillo "inox", 10 u.');
  });

  it('documentos con delimitador punto y coma se parsean consistentes', () => {
    const doc = parseCsvDocument('sku;cantidad\nMP-1;50\nMP-2;25');
    expect(doc.headers).toEqual(['sku', 'cantidad']);
    expect(doc.lines[0]).toEqual(['MP-1', '50']);
    expect(doc.lines[1]).toEqual(['MP-2', '25']);
  });

  it('CSV sin encabezado NO pierde la primera fila (SKU con alias dentro)', () => {
    // Devin #84: "STOCK-MASTER" contiene "stock" — con detección por substring
    // esta fila de datos se confundía con encabezado y se perdía.
    const doc = parseCsvDocument('STOCK-MASTER,5\nMP-1,10');
    expect(doc.headers).toBeNull();
    expect(doc.lines[0]).toEqual(['STOCK-MASTER', '5']);
    expect(doc.lines).toHaveLength(2);
  });

  it('detectDelimiter elige punto y coma sólo cuando domina el documento', () => {
    expect(detectDelimiter('sku,cantidad\nA-1,"x;y"\nB-1,2')).toBe(',');
    expect(detectDelimiter('sku;cantidad\nA-1;"x,y"\nB-1;2')).toBe(';');
  });

  it('detectColumn hace fallback posicional sin encabezados', () => {
    expect(detectColumn(null, SKU_ALIASES, 0)).toBe(0);
    expect(detectColumn(null, QTY_ALIASES, 1)).toBe(1);
  });
});
