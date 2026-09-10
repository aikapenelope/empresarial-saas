import { afterEach, describe, expect, it, vi } from 'vitest';
import { getLiveExchangeRates } from '@/utilities/exchangeRate';

/**
 * IE-PR82 · Devin 🔴: Binance era la única fuente sin validación de
 * plausibilidad y el resolvedor la prefiere cuando BCV falla — una cotización
 * absurda entraría a snapshots de facturas/cobros. Se mockea el fetch por URL:
 * BCV caído, Binance con ofertas absurdas, y paralelo válido a 100.
 */

const jsonResponse = (body: unknown, ok = true) =>
  ({ ok, json: async () => body }) as Response;

function stubFetch(binancePrices: Array<string | number>) {
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('dolares/oficial')) return Promise.resolve(jsonResponse({}, false));
    if (url.includes('pydolarve')) return Promise.resolve(jsonResponse({}, false));
    if (url.includes('p2p.binance.com')) {
      return Promise.resolve(
        jsonResponse({ data: binancePrices.map((price) => ({ adv: { price } })) }),
      );
    }
    if (url.includes('dolares/paralelo')) return Promise.resolve(jsonResponse({ promedio: 100 }));
    return Promise.resolve(jsonResponse({}, false));
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('getLiveExchangeRates — plausibilidad de fuentes (Sprint R1 / Devin #82)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('filtra ofertas absurdas de Binance y usa la mediana plausible (100, no 1e9)', async () => {
    const fetchMock = stubFetch(['1000000000', 2000000000, '100']);

    const rates = await getLiveExchangeRates(true);

    // Pre-fix esto devolvía 1e9 (mediana de las tres ofertas sin filtrar).
    expect(rates.binance).toBe(100);
    expect(rates.paralelo).toBe(100);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('p2p.binance.com'),
      expect.anything(),
    );
  });

  it('todas las ofertas absurdas → Binance se descarta por completo (null)', async () => {
    stubFetch(['1000000000', 2000000000]);

    const rates = await getLiveExchangeRates(true);

    expect(rates.binance).toBeNull();
    expect(rates.paralelo).toBe(100);
  });
});
