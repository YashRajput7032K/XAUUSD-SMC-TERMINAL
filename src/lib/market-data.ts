import { Candle, Timeframe, MarketDataResult } from './types';

// ─── Provider Interface ─────────────────────────────────────────────────────

export interface MarketDataProvider {
  name: string;
  fetchCandles(timeframe: Timeframe, limit?: number): Promise<MarketDataResult>;
}

// ─── Twelve Data Provider (Real API) ────────────────────────────────────────

function timeframeToInterval(tf: Timeframe): string {
  const map: Record<Timeframe, string> = {
    '5m': '5min',
    '15m': '15min',
    '30m': '30min',
    '1h': '1h',
    '4h': '4h',
    '1D': '1day',
    '1W': '1week',
    '1M': '1month',
  };
  return map[tf];
}

export async function fetchFromTwelveData(
  apiKey: string,
  timeframe: Timeframe,
  limit: number = 300
): Promise<MarketDataResult> {
  const interval = timeframeToInterval(timeframe);
  const url = `https://api.twelvedata.com/time_series?symbol=XAU/USD&interval=${interval}&outputsize=${limit}&apikey=${apiKey}&format=JSON`;

  try {
    const res = await fetch(url, { next: { revalidate: 60 } });
    if (!res.ok) {
      return {
        candles: [],
        status: 'error',
        provider: 'Twelve Data',
        error: `API returned ${res.status}: ${res.statusText}`,
      };
    }

    const data = await res.json();

    if (data.status === 'error') {
      return {
        candles: [],
        status: 'error',
        provider: 'Twelve Data',
        error: data.message || 'Unknown API error',
      };
    }

    if (!data.values || !Array.isArray(data.values)) {
      return {
        candles: [],
        status: 'error',
        provider: 'Twelve Data',
        error: 'No data returned from API',
      };
    }

    const candles: Candle[] = data.values
      .map((v: { datetime: string; open: string; high: string; low: string; close: string; volume?: string }) => ({
        time: Math.floor(new Date(v.datetime).getTime() / 1000),
        open: parseFloat(v.open),
        high: parseFloat(v.high),
        low: parseFloat(v.low),
        close: parseFloat(v.close),
        volume: v.volume ? parseFloat(v.volume) : undefined,
      }))
      .filter((c: Candle) => !isNaN(c.open) && !isNaN(c.close))
      .reverse(); // API returns newest first

    return {
      candles,
      status: 'delayed',
      provider: 'Twelve Data',
      delay: '~1 min delay (free tier)',
      lastUpdated: Date.now(),
    };
  } catch (err) {
    return {
      candles: [],
      status: 'error',
      provider: 'Twelve Data',
      error: err instanceof Error ? err.message : 'Network error',
    };
  }
}

// ─── Finnhub Provider (Alternative) ────────────────────────────────────────

function timeframeToFinnhubResolution(tf: Timeframe): string {
  const map: Record<Timeframe, string> = {
    '5m': '5',
    '15m': '15',
    '30m': '30',
    '1h': '60',
    '4h': '240',  // Note: Finnhub doesn't support 240, closest is 60
    '1D': 'D',
    '1W': 'W',
    '1M': 'M',
  };
  return map[tf];
}

export async function fetchFromFinnhub(
  apiKey: string,
  timeframe: Timeframe,
  limit: number = 300
): Promise<MarketDataResult> {
  const resolution = timeframeToFinnhubResolution(timeframe);
  const to = Math.floor(Date.now() / 1000);
  const tfSeconds: Record<Timeframe, number> = {
    '5m': 300, '15m': 900, '30m': 1800, '1h': 3600,
    '4h': 14400, '1D': 86400, '1W': 604800, '1M': 2592000,
  };
  const from = to - (tfSeconds[timeframe] * limit);

  const url = `https://finnhub.io/api/v1/forex/candle?symbol=OANDA:XAU_USD&resolution=${resolution}&from=${from}&to=${to}&token=${apiKey}`;

  try {
    const res = await fetch(url, { next: { revalidate: 60 } });
    if (!res.ok) {
      return { candles: [], status: 'error', provider: 'Finnhub', error: `API returned ${res.status}` };
    }
    const data = await res.json();
    if (data.s !== 'ok' || !data.t) {
      return { candles: [], status: 'error', provider: 'Finnhub', error: data.s === 'no_data' ? 'No data available for this timeframe' : 'API error' };
    }

    const candles: Candle[] = data.t.map((t: number, i: number) => ({
      time: t,
      open: data.o[i],
      high: data.h[i],
      low: data.l[i],
      close: data.c[i],
      volume: data.v ? data.v[i] : undefined,
    }));

    return {
      candles,
      status: 'delayed',
      provider: 'Finnhub',
      delay: 'End-of-day for free tier',
      lastUpdated: Date.now(),
    };
  } catch (err) {
    return { candles: [], status: 'error', provider: 'Finnhub', error: err instanceof Error ? err.message : 'Network error' };
  }
}
