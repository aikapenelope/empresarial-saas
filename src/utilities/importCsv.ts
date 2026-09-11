/**
 * ─── Parser CSV de importación de inventario (IE-PR7 · Devin #84) ───────────
 *
 * Funciones PURAS — sin React ni Payload, testeables en CI.
 *
 * Soporta (RFC-4180 básico):
 *  - Campos entre comillas con delimitador y comillas escapadas ("") dentro —
 *    nombres de producto con comas ya no rompen filas.
 *  - Campos MULTILÍNEA (Devin #84 4ª ronda): un salto de línea dentro de
 *    comillas es dato — las filas sólo se cortan en saltos sin citar.
 *  - Detección de delimitador por CONSISTENCIA de filas (Devin #84 4ª ronda):
 *    gana el candidato que produce el documento más uniforme, no el carácter
 *    con más apariciones — la puntuación del dato (`medida;;;;;`) no puede
 *    escojer el delimitador.
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

/** Delimitadores soportados (los que emiten Excel/Sheets en exportaciones CSV). */
const DELIMITER_CANDIDATES = [',', ';'] as const;

/**
 * Corta el documento en LÍNEAS LÓGICAS: un salto de línea (\n, o \r\n) sólo
 * termina línea si está FUERA de un campo citado. Las comillas escapadas ("")
 * atraviesan intactas para que `splitDelimitedLine` las desescape por celda.
 * El \r suelto (sin \n a continuación) es dato, igual que en el corte físico
 * anterior — no se inventan saltos que el archivo no trae.
 */
export function splitLogicalLines(text: string): string[] {
  const lines: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      // Comilla escapada ("") dentro de campo citado: no cambia el estado.
      if (inQuotes && text[i + 1] === '"') {
        current += '""';
        i++;
        continue;
      }
      inQuotes = !inQuotes;
      current += ch;
      continue;
    }
    if (!inQuotes && ch === '\n') {
      // CRLF: el \r quedó al final del búfer — se recorta del borde.
      if (current.endsWith('\r')) current = current.slice(0, -1);
      lines.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  lines.push(current);
  return lines;
}

/** Filas no vacías del documento (las líneas en blanco no son datos). */
function toRows(text: string, delimiter: string): string[][] {
  return splitLogicalLines(text)
    .filter((line) => line.trim() !== '')
    .map((line) => splitDelimitedLine(line, delimiter));
}

/**
 * Nº de campos de una línea por corte ESTRICTO RFC-4180 (un `"` cierra el
 * campo sin mirar qué sigue, `""` es comilla literal). Es la métrica de
 * detección, no el parser final: para CONTAR campos el cierre estricto es más
 * fiel — el cierre permisivo de `splitDelimitedLine` (que exige delimitador
 * a continuación) hace que con el delimitador EQUIVOCADO las comillas se
 * traguen medio renglón y el conteo salga artificialmente uniforme.
 */
function countFieldsStrict(line: string, delimiter: string): number {
  let count = 1;
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        i++; // "" escapada: comilla literal, no cambia el estado.
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }
    if (!inQuotes && ch === delimiter) count++;
  }
  return count;
}

/**
 * Elige el delimitador por CONSISTENCIA: gana el candidato con más filas
 * calzando con el ancho modal (a igualdad, el ancho mayor — un delimitador
 * real parte el encabezado en varias columnas). Un candidato que NUNCA parte
 * una fila (ancho modal 1) no es estructura: se descarta aunque su "doc" sea
 * uniforme. Así la puntuación del dato no escoje: `A-1,medida;;;;;,5` tiene
 * cinco ';' de dato contra cuatro ',' de estructura y el documento es CSV de
 * comas (Devin #84 4ª ronda: el conteo crudo de caracteres lo leía como
 * punto-y-coma).
 */
export function detectDelimiter(text: string): string {
  let best: string = DELIMITER_CANDIDATES[0];
  let bestConsistent = -1;
  let bestWidth = 0;

  for (const candidate of DELIMITER_CANDIDATES) {
    const fieldCounts = splitLogicalLines(text)
      .filter((line) => line.trim() !== '')
      .map((line) => countFieldsStrict(line, candidate));

    const widths = new Map<number, number>();
    for (const count of fieldCounts) widths.set(count, (widths.get(count) ?? 0) + 1);

    let consistent = 0;
    let width = 1;
    for (const [len, rows] of widths) {
      if (rows > consistent || (rows === consistent && len > width)) {
        consistent = rows;
        width = len;
      }
    }
    // Nunca partió una fila: no hay estructura con este candidato.
    if (width <= 1) continue;

    if (consistent > bestConsistent || (consistent === bestConsistent && width > bestWidth)) {
      best = candidate;
      bestConsistent = consistent;
      bestWidth = width;
    }
  }
  return best;
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
  const rows = toRows(text, delimiter);

  const columnCount = rows.reduce((max, r) => Math.max(max, r.length), 0);
  return { columnCount, rows };
}

/** Índice de la columna cuyo encabezado contiene alguno de los alias. */
export function detectColumn(headers: string[] | null, aliases: string[], fallback: number): number {
  if (!headers) return fallback;
  const idx = headers.findIndex((h) => aliases.some((alias) => h.toLowerCase().includes(alias)));
  return idx >= 0 ? idx : fallback;
}
