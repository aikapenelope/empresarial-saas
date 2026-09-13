import { describe, expect, it } from 'vitest';
import type { PayloadRequest } from 'payload';
import { QUERY_PAGE_SIZE, fetchAllDocs } from '@/utilities/paginatedQuery';

/**
 * ─── Paginador canónico (Sprint CI-2 · reporte Devin #94) ───────────────────
 *
 * Guarda DIRECTA del bucle: si alguien rompe `hasNextPage` o el avance de
 * `page`, los agregados que dependen de él (monto pagado de una factura,
 * descuadre del turno) vuelven a truncarse en silencio. Se le inyecta un
 * `payload.find` falso que devuelve VARIAS páginas — así el bucle se ejercita
 * en milisegundos, sin crear cientos de documentos en la base de datos.
 */

function makeReq(totalDocs: number) {
  const calls: Array<{ page: number; limit: number; sort: unknown }> = [];
  const docs = Array.from({ length: totalDocs }, (_, i) => ({ id: i + 1 }));
  const totalPages = Math.max(1, Math.ceil(totalDocs / QUERY_PAGE_SIZE));

  const req = {
    payload: {
      find: async (args: { page?: number; limit?: number; sort?: unknown }) => {
        const page = args.page ?? 1;
        const limit = args.limit ?? QUERY_PAGE_SIZE;
        calls.push({ page, limit, sort: args.sort });

        const start = (page - 1) * limit;
        return {
          docs: docs.slice(start, start + limit),
          hasNextPage: page < totalPages,
        };
      },
    },
  } as unknown as PayloadRequest;

  return { req, calls };
}

describe('fetchAllDocs — paginación por offset (CI-2)', () => {
  it('recorre TODAS las páginas y devuelve el conjunto completo', async () => {
    // 250 documentos con páginas de 100 ⇒ 3 páginas (100 + 100 + 50).
    const { req, calls } = makeReq(250);

    const all = await fetchAllDocs({
      req,
      collection: 'customer-payments',
      where: { status: { equals: 'confirmed' } },
    });

    expect(all).toHaveLength(250);
    expect(all.map((d) => d.id)).toEqual(Array.from({ length: 250 }, (_, i) => i + 1));
    // Tres llamadas: páginas 1, 2 y 3.
    expect(calls.map((c) => c.page)).toEqual([1, 2, 3]);
  });

  it('pasa `sort: "id"` y el tamaño de página en cada llamada', async () => {
    const { req, calls } = makeReq(150);

    await fetchAllDocs({ req, collection: 'supplier-payments', where: {} });

    // `sort: 'id'` es obligatorio con paginación por offset (Devin #88): da un
    // orden único y estable entre páginas.
    expect(calls.every((c) => c.sort === 'id')).toBe(true);
    expect(calls.every((c) => c.limit === QUERY_PAGE_SIZE)).toBe(true);
  });

  it('no pagina de más cuando el total es exactamente una página', async () => {
    const { req, calls } = makeReq(QUERY_PAGE_SIZE);

    const all = await fetchAllDocs({ req, collection: 'customer-payments', where: {} });

    expect(all).toHaveLength(QUERY_PAGE_SIZE);
    expect(calls.map((c) => c.page)).toEqual([1]);
  });

  it('devuelve vacío con una sola llamada cuando no hay coincidencias', async () => {
    const { req, calls } = makeReq(0);

    const all = await fetchAllDocs({ req, collection: 'customer-payments', where: {} });

    expect(all).toEqual([]);
    expect(calls.map((c) => c.page)).toEqual([1]);
  });
});
