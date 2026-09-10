import { NextResponse } from 'next/server';
import { getLiveExchangeRates } from '@/utilities/exchangeRate';

export const dynamic = 'force-dynamic';

/**
 * Rate limit del refresh (Sprint R1 · auditoría 2026-09-10 · P2-S1-01):
 * el GET cacheado es libre (lo absorbe el CDN con s-maxage=120), pero cada
 * ?refresh=true fuerza 3 fetches externos saltándose el cache — un bot
 * pulsándolo podía hacer DoS a las APIs de tasas desde nuestra IP.
 * Token bucket en memoria por instancia: simple, cero dependencias; en
 * serverless multi-instancia reduce el abuso ~30-60x (no lo elimina, pero
 * el coste real del endpoint acotado lo hace suficiente).
 */
const REFRESH_WINDOW_MS = 60 * 1000;
const REFRESH_MAX_PER_WINDOW = 10;
let refreshHits: Array<{ key: string; at: number }> = [];

function isRateLimited(key: string): boolean {
  const now = Date.now();
  refreshHits = refreshHits.filter((hit) => now - hit.at < REFRESH_WINDOW_MS);
  const hitsForKey = refreshHits.filter((hit) => hit.key === key).length;
  if (hitsForKey >= REFRESH_MAX_PER_WINDOW) {
    return true;
  }
  refreshHits.push({ key, at: now });
  return false;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const forceRefresh = searchParams.get('refresh') === 'true';

    if (forceRefresh) {
      const ip =
        request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
      if (isRateLimited(`refresh:${ip}`)) {
        return NextResponse.json(
          {
            success: false,
            error: 'Demasiadas solicitudes de actualización. Intente en un minuto.',
          },
          { status: 429, headers: { 'Retry-After': '60' } },
        );
      }
    }

    const rates = await getLiveExchangeRates(forceRefresh);

    return NextResponse.json(
      {
        success: true,
        rates,
        timestamp: new Date().toISOString(),
      },
      {
        status: 200,
        headers: {
          'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=60',
        },
      },
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Error desconocido al consultar tasas';
    return NextResponse.json(
      {
        success: false,
        error: errorMessage,
      },
      { status: 500 },
    );
  }
}
