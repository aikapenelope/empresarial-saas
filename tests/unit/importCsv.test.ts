import { describe, expect, it } from 'vitest';
import {
  detectColumn,
  detectDelimiter,
  looksLikeHeaderRow,
  parseCsvDocument,
  QTY_ALIASES,
  SKU_ALIASES,
} from '@/utilities/importCsv';

describe('parseCsvDocument (parser CSV del wizard de importación, Devin #84)', () => {
  it('expone la primera fila CANDIDATA a encabezado y el template mapea existencia_total', () => {
    const doc = parseCsvDocument('sku,nombre,existencia_total\nA-1,"Tornillo, acero",20');

    // La primera fila calza con alias → candidata a encabezado (el wizard la
    // excluye de los datos cuando el usuario lo confirma).
    expect(looksLikeHeaderRow(doc.rows[0])).toBe(true);
    expect(doc.rows[0]).toEqual(['sku', 'nombre', 'existencia_total']);
    expect(QTY_ALIASES).toContain('existencia_total');
    expect(detectColumn(doc.rows[0], QTY_ALIASES, 1)).toBe(2);
    // La coma dentro de las comillas NO parte la fila y las comillas se
    // desescapan (el valor de la celda es el texto limpio):
    expect(doc.rows[1]).toEqual(['A-1', 'Tornillo, acero', '20']);
    expect(doc.columnCount).toBe(3);
  });

  it('soporta comillas escapadas ("") dentro de campos citados', () => {
    const doc = parseCsvDocument('sku,cantidad\nA-1,"Tornillo ""inox"", 10 u."');
    expect(doc.rows[1]).toContain('Tornillo "inox", 10 u.');
  });

  it('documentos con delimitador punto y coma se parsean consistentes', () => {
    const doc = parseCsvDocument('sku;cantidad\nMP-1;50\nMP-2;25');
    expect(doc.rows[0]).toEqual(['sku', 'cantidad']);
    expect(doc.rows[1]).toEqual(['MP-1', '50']);
    expect(doc.rows[2]).toEqual(['MP-2', '25']);
  });

  it('CSV sin encabezado NO pierde la primera fila (SKU con alias dentro)', () => {
    // Devin #84: "STOCK-MASTER" contiene "stock" — con detección por substring
    // esta fila de datos se confundía con encabezado y se perdía. La detección
    // por IGUALDAD exacta no cae en la trampa.
    const doc = parseCsvDocument('STOCK-MASTER,5\nMP-1,10');
    expect(looksLikeHeaderRow(doc.rows[0])).toBe(false);
    expect(doc.rows[0]).toEqual(['STOCK-MASTER', '5']);
    expect(doc.rows).toHaveLength(2);
  });

  it('encabezados con nombres desconocidos quedan expuestos para el mapeo', () => {
    // Devin #84 3ª ronda: sin alias configurado, la primera fila NO se trata
    // como dato — queda como candidata para que el wizard decida.
    const doc = parseCsvDocument('articulo;unidades;descripcion\nA-1;5;Tornillo');
    expect(looksLikeHeaderRow(doc.rows[0])).toBe(false);
    expect(doc.rows[0]).toEqual(['articulo', 'unidades', 'descripcion']);
    expect(doc.columnCount).toBe(3);
  });

  it('detectDelimiter elige punto y coma sólo cuando domina el documento', () => {
    expect(detectDelimiter('sku,cantidad\nA-1,"x;y"\nB-1,2')).toBe(',');
    expect(detectDelimiter('sku;cantidad\nA-1;"x,y"\nB-1;2')).toBe(';');
  });

  it('detectDelimiter ignora separadores DENTRO de campos citados', () => {
    // Devin #84 3ª ronda: comas citadas no convierten un documento
    // punto-y-coma en coma-delimitado.
    expect(
      detectDelimiter('sku;nombre;cantidad\nA-1;"Tornillo, acero, 10 mm";5'),
    ).toBe(';');
  });

  it('detectColumn hace fallback posicional sin encabezados', () => {
    expect(detectColumn(null, SKU_ALIASES, 0)).toBe(0);
    expect(detectColumn(null, QTY_ALIASES, 1)).toBe(1);
  });
});
