import { extractId } from './inventoryLedger';

/**
 * ─── Detección de cambios REALES en las líneas de un documento ──────────────
 *
 * Sprint CI-2b (hallazgo P0): los hooks `beforeValidate` de `invoices` y
 * `purchase-invoices` decidían "las líneas cambiaron" con
 * `Array.isArray(data.items)`. Eso es SIEMPRE verdadero en un `update`, porque
 * Payload rellena el objeto `data` de `beforeValidate` con los campos ausentes
 * **clonados del documento original**
 * (`payload/dist/fields/hooks/beforeValidate/getFallbackValue.js` →
 * `cloneDataFromOriginalDoc`). Resultado: la rama de reconciliación de saldo se
 * ejecutaba en TODA actualización y sobrescribía `balanceUSD` con el saldo
 * previo, ignorando el que calculaba el ledger de cobros/pagos ⇒ los cobros
 * PARCIALES nunca bajaban el saldo de la factura.
 *
 * Esta utilidad responde la pregunta correcta: ¿el llamador envió líneas
 * DISTINTAS a las persistidas? Compara por VALOR (no por identidad de fila),
 * ignorando el `id` de la fila del array (que cambia al reescribir el array sin
 * que cambie el contenido) y resolviendo las relaciones pobladas a su id.
 *
 * Nota: con `incoming` ausente devuelve `false` (no hubo cambio de líneas) y con
 * `original` ausente devuelve `true` (todo es nuevo).
 */

/** Canoniza una línea: claves ordenadas, sin `id` de fila, relación → id. */
function canonicalizeLine(line: unknown): unknown {
  if (line === null || typeof line !== 'object' || Array.isArray(line)) {
    return line ?? null;
  }

  const source = line as Record<string, unknown>;
  const canonical: Record<string, unknown> = {};

  for (const key of Object.keys(source).sort()) {
    if (key === 'id') continue; // id de la fila del array: irrelevante para el importe

    const value = source[key];
    if (value === undefined || typeof value === 'function') continue;

    if (key === 'product' || key.endsWith('Invoice')) {
      // Relaciones: pueden llegar pobladas o como id. Se comparan por id.
      canonical[key] = extractId(value);
    } else if (typeof value === 'object' && value !== null) {
      canonical[key] = canonicalizeLine(value);
    } else {
      canonical[key] = value;
    }
  }

  return canonical;
}

/**
 * `true` sólo si el llamador envió líneas distintas a las del documento original.
 * Seguro para usar en `beforeValidate` de un `update` (donde `data` viene
 * pre-rellenado desde `originalDoc`).
 */
export function lineItemsChanged(incoming: unknown, original: unknown): boolean {
  if (!Array.isArray(incoming)) return false;
  if (!Array.isArray(original)) return true;
  if (incoming.length !== original.length) return true;

  return (
    JSON.stringify(incoming.map(canonicalizeLine)) !==
    JSON.stringify(original.map(canonicalizeLine))
  );
}
