/**
 * Servicio de tasas de cambio en tiempo real (BCV, Binance P2P, Dólar Paralelo).
 * Ejecución en paralelo con Promise.allSettled y timeout de 5 segundos.
 */

export interface ExchangeRates {
  bcv: number | null;
  binance: number | null;
  paralelo: number | null;
  lastUpdated: string;
}

let cachedRates: { data: ExchangeRates; timestamp: number } | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos

const TIMEOUT_MS = 5000;

async function fetchWithTimeout(url: string, options: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchBCVRate(): Promise<number | null> {
  try {
    const res = await fetchWithTimeout('https://ve.dolarapi.com/v1/dolares/oficial');
    if (!res.ok) return null;
    const json = await res.json();
    const val = Number(json?.promedio || json?.price);
    return val > 0 ? Number(val.toFixed(2)) : null;
  } catch {
    return null;
  }
}

async function fetchParaleloRate(): Promise<number | null> {
  try {
    const res = await fetchWithTimeout('https://ve.dolarapi.com/v1/dolares/paralelo');
    if (!res.ok) return null;
    const json = await res.json();
    const val = Number(json?.promedio || json?.price);
    return val > 0 ? Number(val.toFixed(2)) : null;
  } catch {
    return null;
  }
}

async function fetchBinanceP2PRate(): Promise<number | null> {
  try {
    const res = await fetchWithTimeout('https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        asset: 'USDT',
        fiat: 'VES',
        tradeType: 'BUY',
        page: 1,
        rows: 5,
        payTypes: ['SpecificBank', 'PagoMovil'],
      }),
    });
    if (!res.ok) return null;
    const json = await res.json();
    const ads = json?.data;
    if (!Array.isArray(ads) || ads.length === 0) return null;
    const prices = ads.map((item: any) => Number(item?.adv?.price)).filter((p: number) => !isNaN(p) && p > 0);
    if (prices.length === 0) return null;
    const median = prices[Math.floor(prices.length / 2)];
    return Number(median.toFixed(2));
  } catch {
    return null;
  }
}

/**
 * Obtiene las cotizaciones activas de mercado en paralelo con cache de 5 minutos.
 */
export async function getLiveExchangeRates(): Promise<ExchangeRates> {
  const now = Date.now();
  if (cachedRates && now - cachedRates.timestamp < CACHE_TTL_MS) {
    return cachedRates.data;
  }

  const [bcvRes, binanceRes, paraleloRes] = await Promise.allSettled([
    fetchBCVRate(),
    fetchBinanceP2PRate(),
    fetchParaleloRate(),
  ]);

  const rates: ExchangeRates = {
    bcv: bcvRes.status === 'fulfilled' ? bcvRes.value : null,
    binance: binanceRes.status === 'fulfilled' ? binanceRes.value : null,
    paralelo: paraleloRes.status === 'fulfilled' ? paraleloRes.value : null,
    lastUpdated: new Date().toISOString(),
  };

  cachedRates = { data: rates, timestamp: now };
  return rates;
}

/**
 * Resuelve la tasa de cambio efectiva para una transacción según la jerarquía:
 * 1. Tasa manual configurada en el Tenant (si > 0 y autoSyncRate es false)
 * 2. Tasa oficial BCV
 * 3. Tasa Binance P2P
 * 4. Tasa Paralelo
 * 5. Fallback 1.0 si no hay conexión
 */
export async function resolveEffectiveRate(tenantDoc?: {
  currencyConfig?: {
    manualExchangeRate?: number;
    autoSyncRate?: boolean;
  };
}): Promise<{ rate: number; source: string }> {
  const manualRate = Number(tenantDoc?.currencyConfig?.manualExchangeRate) || 0;
  const autoSync = tenantDoc?.currencyConfig?.autoSyncRate ?? true;

  if (!autoSync && manualRate > 0) {
    return { rate: manualRate, source: 'manual_tenant' };
  }

  const live = await getLiveExchangeRates();

  if (live.bcv && live.bcv > 0) {
    return { rate: live.bcv, source: 'bcv_oficial' };
  }
  if (live.binance && live.binance > 0) {
    return { rate: live.binance, source: 'binance_p2p' };
  }
  if (live.paralelo && live.paralelo > 0) {
    return { rate: live.paralelo, source: 'dolar_paralelo' };
  }
  if (manualRate > 0) {
    return { rate: manualRate, source: 'fallback_manual' };
  }

  return { rate: 1, source: 'default_unit' };
}
