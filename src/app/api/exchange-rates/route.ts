import { NextResponse } from 'next/server';
import { getLiveExchangeRates } from '@/utilities/exchangeRate';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const forceRefresh = searchParams.get('refresh') === 'true';

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
