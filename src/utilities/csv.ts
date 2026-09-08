/**
 * ─── Helpers de export CSV ──────────────────────────────────────────────────
 *
 * Única fuente del escape de celdas para los route handlers de reportes
 * (libro de ventas, cartera por antigüedad, kardex). Centralizado aquí para
 * que la neutralización de fórmulas aplique a TODOS los exports por igual.
 */

/**
 * Una celda que comienza con `=`, `+`, `-` o `@` (o un control de tabulación
 * / retorno de carro) es interpretada como FÓRMULA al abrir el CSV en Excel,
 * LibreOffice o Google Sheets (CSV Injection / DDE). Como los nombres de
 * cliente, producto y las referencias son texto capturado por operadores,
 * un valor como `=HYPERLINK(...)` ejecutaría al abrir el archivo. El prefijo
 * apóstrofo es la mitigación recomendada por OWASP: la hoja de cálculo lo
 * trata como texto literal y no lo muestra en la celda.
 */
const FORMULA_LEADING_CHARS = /^[=+\-@\t\r]/;

/** Escapa una celda CSV (comillas dobles) neutralizando fórmulas. */
export function csvCell(value: string): string {
  const neutralized = FORMULA_LEADING_CHARS.test(value) ? `'${value}` : value;
  return `"${neutralized.replace(/"/g, '""')}"`;
}
