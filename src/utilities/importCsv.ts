/**
 * ─── Parser CSV de importación de inventario (IE-PR7 · Devin #84) ───────────
 *
 * Funciones PURAS — sin React ni Payload, testeables en CI.
 *
 * Soporta:
 *  - Campos entre comillas con delimitador y comillas escapadas ("") dentro
 *    (RFC-4180 básico) — nombres de producto con comas ya no rompen filas.
 *  - Detección de delimitador CONSCIENTE de comillas (Devin #84 2ª ronda):
 *    los separadores dentro de campos citados son dato, no estructura.
 *  - UN delimitador por documento, no uno distinto por línea.
 *
 * La detección de encabezado es por IGUALDAD exacta (trim + lowercase) contra
 * los alias: con substring, un SKU de datos tipo "STOCK-MASTER" se confundía
 * con encabezado y la importación perdía su primera fila. Y si el archivo trae
 * encabezados con nombres desconocidos, `parseCsvDocument` los expone como
 * primera fila CANDIDATA para que el mapeo del wizard decida (Devin #84 2ª
 * ronda: sin esto, encabezados sin alias bloqueaban el flujo como datos).
 */

export const SKU_ALIASES = ['sku', 'codigo', 'código', 'code'];
export const QTY_ALIASES = ['cantidad', 'quantity', 'qty', 'stock', 'existencia_total'];

/** Detecta el delimitador del documento contando SÓLO fuera de campos citados. */
export function detectDelimiter(text: string): string {
  let commas = 0;
  let semicolons = 0;
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      // Comilla escapada ("") dentro de campo citado: no cambia el estado.
      if (inQuotes && text[i + 1] === '"') {
        i++;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }
    if (inQuotes) continue;
    if (ch === ',') commas++;
    else if (ch === ';') semicolons++;
  }
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
          // Comilla escapada: comilla literal.
          current += '"';
          i++;
        } else if (line[i + 1] === delimiter || line[i + 1] === undefined) {
          // Cierre real del campo (lo que sigue es separador o fin).
          inQuotes = false;
        } else {
          // Comilla embebida: datos, no cierre — el campo continúa.
          current += '"';
        }
      } else {
        current += ch;
      }
      continue;
    }
    if (ch === '"') {
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

/** true si la fila calza exactamente con algún alias (candidata a encabezado). */
export function looksLikeHeaderRow(cells: string[]): boolean {
  const normalized = cells.map((c) => c.trim().toLowerCase());
  return normalized.some((cell) => [...SKU_ALIASES, ...QTY_ALIASES].includes(cell));
}

export interface ParsedCsvDocument {
  /** Máximo de celdas por fila (define las columnas mapeables). */
  columnCount: number;
  /** TODAS las filas parseadas — el tratamiento de la primera (encabezado o
   *  dato) lo decide el paso de mapeo del wizard. */
  rows: string[][];
}

/**
 * Parseo puro del documento: devuelve todas las filas con sus celdas y el
 * ancho máximo. La decisión "¿la primera fila es encabezado?" es del wizard
 * (paso 2 de mapeo), no del parser.
 */
export function parseCsvDocument(text: string): ParsedCsvDocument {
  const delimiter = detectDelimiter(text);
  const rows = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => splitDelimitedLine(l, delimiter));

  const columnCount = rows.reduce((max, r) => Math.max(max, r.length), 0);
  return { columnCount, rows };
}

/** Índice de la columna cuyo encabezado contiene alguno de los alias. */
export function detectColumn(headers: string[] | null, aliases: string[], fallback: number): number {
  if (!headers) return fallback;
  const idx = headers.findIndex((h) => aliases.some((alias) => h.toLowerCase().includes(alias)));
  return idx >= 0 ? idx : fallback;
}
