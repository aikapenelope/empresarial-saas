/**
 * Servicio de tasas de cambio en tiempo real (BCV, Binance P2P, Dólar Paralelo).
 * Diseñado para entornos Serverless en Next.js 15 con cache optimizada (TTL: 120s),
 * consultas concurrentes resilientes (Promise.allSettled) y timeout con AbortController.
 */

export interface ExchangeRatesResult {
  bcv: number | null;
  binance: number | null;
  paralelo: number | null;
  lastUpdated: string;
  cached: boolean;
}

export interface EffectiveRateResult {
  rate: number;
  source: 'manual_tenant' | 'bcv_oficial' | 'binance_p2p' | 'dolar_paralelo' | 'fallback_manual' | 'default_unit';
}

interface CacheEntry {
  data: {
    bcv: number | null;
    binance: number | null;
    paralelo: number | null;
    lastUpdated: string;
  };
  timestamp: number;
}

let cachedRates: CacheEntry | null = null;
const CACHE_TTL_MS = 120 * 1000; // 120 segundos (2 minutos)
const REQUEST_TIMEOUT_MS = 5000; // 5 segundos

/**
 * Rango de plausibilidad de una tasa VES/USD (Sprint R1 · auditoría
 * 2026-09-10 · P2-S1-02): una fuente comprometida o troll no puede
 * propagar tasas absurdas a snapshots de documentos. Venezuela histórica:
 * 1–1,000 Bs/USD; margen 1,000× por encima para sobrevivir devaluaciones
 * sin maintenance. Fuera de rango → la fuente se descarta (null) y el
 * resolvedor cae a la siguiente.
 */
const MIN_PLAUSIBLE_RATE = 1;
const MAX_PLAUSIBLE_RATE = 1_000_000;

/** Valida que la tasa sea un número finito dentro del rango plausible. */
function isPlausibleRate(value: number): boolean {
  return Number.isFinite(value) && value >= MIN_PLAUSIBLE_RATE && value <= MAX_PLAUSIBLE_RATE;
}

async function fetchWithTimeout(url: string, options: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'User-Agent': 'EmpresarialSaaS-ExchangeRateService/1.0',
        ...(options.headers || {}),
      },
    });
    return res;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Consulta la tasa oficial del Banco Central de Venezuela (BCV).
 * Consume la API oficial/mirror con respaldo secundario.
 */
async function fetchBCVRate(): Promise<number | null> {
  // Intento 1: DolarApi Oficial
  try {
    const res = await fetchWithTimeout('https://ve.dolarapi.com/v1/dolares/oficial');
    if (res.ok) {
      const json = (await res.json()) as { promedio?: number; price?: number };
      const val = Number(json?.promedio ?? json?.price);
      if (!isNaN(val) && isPlausibleRate(val)) { // Sprint R1: sanity bounds P2-S1-02
        return Number(val.toFixed(4));
      }
    }
  } catch {
    // Continuar al proveedor de respaldo
  }

  // Intento 2: PyDolarVenezuela API Fallback
  try {
    const res = await fetchWithTimeout('https://pydolarve.org/api/v1/dollar?page=bcv');
    if (res.ok) {
      const json = (await res.json()) as { monitors?: { usd?: { price?: number } } };
      const val = Number(json?.monitors?.usd?.price);
      if (!isNaN(val) && isPlausibleRate(val)) { // Sprint R1: sanity bounds P2-S1-02
        return Number(val.toFixed(4));
      }
    }
  } catch {
    // Silencio en fallback
  }

  return null;
}

/**
 * Consulta la cotización del Dólar Paralelo (Promedio de mercado).
 */
async function fetchParaleloRate(): Promise<number | null> {
  try {
    const res = await fetchWithTimeout('https://ve.dolarapi.com/v1/dolares/paralelo');
    if (res.ok) {
      const json = (await res.json()) as { promedio?: number; price?: number };
      const val = Number(json?.promedio ?? json?.price);
      if (!isNaN(val) && isPlausibleRate(val)) { // Sprint R1: sanity bounds P2-S1-02
        return Number(val.toFixed(4));
      }
    }
  } catch {
    // Silencio en fallback
  }
  return null;
}

/**
 * Consulta la cotización en tiempo real de Binance P2P (USDT / VES).
 * Calcula la mediana de las mejores 5 órdenes de compra/venta de comerciantes verificados.
 */
async function fetchBinanceP2PRate(): Promise<number | null> {
  try {
    const res = await fetchWithTimeout(
      'https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search',
      {
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
      },
    );

    if (!res.ok) return null;

    const json = (await res.json()) as {
      data?: Array<{ adv?: { price?: string | number } }>;
    };

    const ads = json?.data;
    if (!Array.isArray(ads) || ads.length === 0) return null;

    const prices = ads
      .map((item) => Number(item?.adv?.price))
      // Devin #82 🔴: mismo criterio de plausibilidad que BCV/paralelo — Binance
      // era la única fuente que aceptaba cualquier positivo y el resolvedor la
      // prefiere cuando BCV falla (una cotización absurda entraría a snapshots).
      .filter((p) => isPlausibleRate(p));

    if (prices.length === 0) return null;

    prices.sort((a, b) => a - b);
    const median = prices[Math.floor(prices.length / 2)];
    // Defensa en profundidad: la mediana se revalida antes de exponerse.
    if (!isPlausibleRate(median)) return null;
    return Number(median.toFixed(4));
  } catch {
    return null;
  }
}

/**
 * Obtiene las tasas de cambio activas ejecutando todas las fuentes en paralelo.
 * Implementa cache en memoria de 120 segundos para no saturar APIs externas en Serverless.
 */
export async function getLiveExchangeRates(forceRefresh = false): Promise<ExchangeRatesResult> {
  const now = Date.now();

  if (!forceRefresh && cachedRates && now - cachedRates.timestamp < CACHE_TTL_MS) {
    return {
      ...cachedRates.data,
      cached: true,
    };
  }

  const [bcvRes, binanceRes, paraleloRes] = await Promise.allSettled([
    fetchBCVRate(),
    fetchBinanceP2PRate(),
    fetchParaleloRate(),
  ]);

  const bcv = bcvRes.status === 'fulfilled' ? bcvRes.value : (cachedRates?.data.bcv ?? null);
  const binance =
    binanceRes.status === 'fulfilled' ? binanceRes.value : (cachedRates?.data.binance ?? null);
  const paralelo =
    paraleloRes.status === 'fulfilled' ? paraleloRes.value : (cachedRates?.data.paralelo ?? null);

  const newData = {
    bcv,
    binance,
    paralelo,
    lastUpdated: new Date().toISOString(),
  };

  cachedRates = {
    data: newData,
    timestamp: now,
  };

  return {
    ...newData,
    cached: false,
  };
}

/**
 * Resuelve la tasa de cambio efectiva para transacciones operativas bimonetarias
 * siguiendo la jerarquía estricta de configuración:
 * 1. Tasa manual configurada en el Tenant (si autoSyncRate === false y manualExchangeRate > 0)
 * 2. Tasa oficial BCV
 * 3. Tasa Binance P2P
 * 4. Tasa Paralelo
 * 5. Tasa manual de fallback (si existe)
 * 6. Tasa unitaria 1.0 (fallback absoluto)
 */
export async function resolveEffectiveRate(tenantConfig?: {
  manualExchangeRate?: number;
  autoSyncRate?: boolean;
}): Promise<EffectiveRateResult> {
  const manualRate = Number(tenantConfig?.manualExchangeRate) || 0;
  const autoSync = tenantConfig?.autoSyncRate ?? true;

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
