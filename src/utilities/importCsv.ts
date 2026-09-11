/**
 * ─── Parser CSV de importación de inventario (IE-PR7 · Devin #84) ───────────
 *
 * Funciones PURAS — sin React ni Payload, testeables en CI.
 *
 * Soporta:
 *  - Campos entre comillas con delimitador y comillas escapadas ("") dentro
 *    (RFC-4180 básico) — nombres de producto con comas ya no rompen filas.
 *  - UN delimitador por documento (detectado en el texto completo), no uno
 *    distinto por línea: mezclar delimitadores entre líneas corrompía filas.
 *
 * La detección de encabezado es por IGUALDAD exacta (trim + lowercase) contra
 * los alias: con substring, un SKU de datos tipo "STOCK-MASTER" se confundía
 * con encabezado y la importación perdía su primera fila.
 */

export const SKU_ALIASES = ['sku', 'codigo', 'código', 'code'];
export const QTY_ALIASES = ['cantidad', 'quantity', 'qty', 'stock', 'existencia_total'];

/** Detecta el delimitador del documento una sola vez (mayoría gana). */
export function detectDelimiter(text: string): string {
  const sample = text.split(/\r?\n/).slice(0, 5).join('\n');
  const semicolons = (sample.match(/;/g) || []).length;
  const commas = (sample.match(/,/g) || []).length;
  return semicolons > commas ? ';' : ',';
}

/** Divide una línea respetando campos entre comillas (comillas escapadas = ""). */
export function splitDelimitedLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      cells.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  cells.push(current.trim());
  return cells;
}

export interface ParsedCsvDocument {
  /** Encabezados si la primera línea calza con un alias; null si no. */
  headers: string[] | null;
  /** Todas las líneas de datos (la de encabezado excluida). */
  lines: string[][];
}

/**
 * Parseo con encabezados para el wizard: la primera línea es encabezado si
 * alguna celda ES exactamente un alias conocido (trim + lowercase); si no,
 * se trata como dato con mapeo posicional por defecto (col 1 = SKU, col 2 =
 * cantidad — comportamiento del flujo previo a IE-PR7).
 */
export function parseCsvDocument(text: string): ParsedCsvDocument {
  const all = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (all.length === 0) return { headers: null, lines: [] };

  const delimiter = detectDelimiter(text);
  const firstCells = splitDelimitedLine(all[0], delimiter);
  const normalizedFirstCells = firstCells.map((cell) => cell.trim().toLowerCase());
  const isHeader = normalizedFirstCells.some((cell) =>
    [...SKU_ALIASES, ...QTY_ALIASES].includes(cell),
  );

  if (isHeader) {
    return { headers: firstCells, lines: all.slice(1).map((l) => splitDelimitedLine(l, delimiter)) };
  }
  return { headers: null, lines: all.map((l) => splitDelimitedLine(l, delimiter)) };
}

/** Índice de la columna cuyo encabezado contiene alguno de los alias. */
export function detectColumn(headers: string[] | null, aliases: string[], fallback: number): number {
  if (!headers) return fallback;
  const idx = headers.findIndex((h) => aliases.some((alias) => h.toLowerCase().includes(alias)));
  return idx >= 0 ? idx : fallback;
}
