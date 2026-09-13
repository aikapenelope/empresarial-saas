import type { CollectionSlug, PayloadRequest, Where } from 'payload';

/**
 * ─── Barrido paginado de la Local API (Sprint CI-2 · reporte Devin #94) ─────
 *
 * Un `limit` fijo trunca el resultado en SILENCIO: cualquier agregado calculado
 * sobre él (descuadre de turno, monto ya pagado de una factura, saldos…) queda
 * mal sin que nada falle. Hallazgos de esta clase ya ocurridos en el repo:
 *  - S2-2 / Devin #88: el arqueo de caja truncaba a 1000 movimientos.
 *  - Devin #94: `getInvoicePaidAmount` / `getPurchaseInvoicePaidAmount` sumaban
 *    sólo los primeros 500 cobros/pagos confirmados ⇒ al reabrir o des-anular
 *    una factura se le devolvía deuda YA pagada.
 *
 * Este helper es el ÚNICO punto donde se pagina por offset, para que el orden
 * estable y el avance de página no se reimplementen (y se olviden) en cada
 * dominio. `sort: 'id'` es OBLIGATORIO con paginación por offset: da un orden
 * único y estable; sin él el orden por defecto (timestamp) tiene empates y una
 * fila puede repetirse en una página y omitirse en otra (Devin #88).
 */

/** Tamaño de página de los barridos (suficientemente grande para ser barato,
 *  suficientemente pequeño para que varias páginas sigan siendo rápidas). */
export const QUERY_PAGE_SIZE = 100;

export async function fetchAllDocs({
  req,
  collection,
  where,
}: {
  req: PayloadRequest;
  collection: CollectionSlug;
  where: Where;
}): Promise<Array<Record<string, unknown>>> {
  const all: Array<Record<string, unknown>> = [];
  let page = 1;
  let hasNextPage = true;

  while (hasNextPage) {
    const res = await req.payload.find({
      collection,
      where,
      sort: 'id',
      limit: QUERY_PAGE_SIZE,
      page,
      depth: 0,
      req,
    });

    all.push(...(res.docs as unknown as Array<Record<string, unknown>>));
    hasNextPage = Boolean(res.hasNextPage);
    page += 1;
  }

  return all;
}
