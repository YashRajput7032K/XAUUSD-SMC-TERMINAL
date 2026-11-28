import { NextRequest, NextResponse } from 'next/server';
import { fetchFromTwelveData, fetchFromFinnhub } from '@/lib/market-data';
import { generateDemoData } from '@/lib/demo-data';
import { Timeframe } from '@/lib/types';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const timeframe = (searchParams.get('timeframe') || '1h') as Timeframe;
  const limit = parseInt(searchParams.get('limit') || '300');

  // Try providers in order of preference
  const twelveDataKey = process.env.TWELVE_DATA_API_KEY;
  const finnhubKey = process.env.FINNHUB_API_KEY;

  if (twelveDataKey) {
    const result = await fetchFromTwelveData(twelveDataKey, timeframe, limit);
    if (result.candles.length > 0) {
      return NextResponse.json(result);
    }
    // Fall through to next provider if no data
    console.warn('Twelve Data returned no data, trying fallback...');
  }

  if (finnhubKey) {
    const result = await fetchFromFinnhub(finnhubKey, timeframe, limit);
    if (result.candles.length > 0) {
      return NextResponse.json(result);
    }
    console.warn('Finnhub returned no data, falling back to demo...');
  }

  // Fall back to demo data
  const demo = generateDemoData(timeframe, limit);
  return NextResponse.json(demo);
}
