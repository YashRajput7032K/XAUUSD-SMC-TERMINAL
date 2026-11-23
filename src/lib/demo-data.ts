import { Candle, Timeframe, MarketDataResult } from './types';

// ─── Realistic XAUUSD Demo Data Generator ──────────────────────────────────
// Generates synthetic but realistic-looking gold price data with proper
// candle patterns, volatility, and trend behavior.

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

function timeframeToSeconds(tf: Timeframe): number {
  const map: Record<Timeframe, number> = {
    '5m': 300,
    '15m': 900,
    '30m': 1800,
    '1h': 3600,
    '4h': 14400,
    '1D': 86400,
    '1W': 604800,
    '1M': 2592000,
  };
  return map[tf];
}

export function generateDemoData(timeframe: Timeframe, count: number = 300): MarketDataResult {
  const rand = seededRandom(42 + timeframe.length);
  const intervalSec = timeframeToSeconds(timeframe);
  const now = Math.floor(Date.now() / 1000);
  const startTime = now - intervalSec * count;

  // Start around realistic gold price
  let price = 2650 + rand() * 100;
  const candles: Candle[] = [];

  // Volatility depends on timeframe
  const volatilityMap: Record<Timeframe, number> = {
    '5m': 0.8, '15m': 1.5, '30m': 2.5, '1h': 4,
    '4h': 8, '1D': 18, '1W': 40, '1M': 80,
  };
  const baseVol = volatilityMap[timeframe];

  // Trend changes
  let trend = (rand() - 0.5) * 0.3;
  let trendDuration = Math.floor(rand() * 30) + 10;

  for (let i = 0; i < count; i++) {
    // Periodically change trend
    trendDuration--;
    if (trendDuration <= 0) {
      trend = (rand() - 0.5) * 0.6;
      trendDuration = Math.floor(rand() * 40) + 15;
    }

    const vol = baseVol * (0.5 + rand() * 1.5);
    const drift = trend * baseVol * 0.1;

    const open = price;
    const bodySize = (rand() - 0.5 + drift * 0.3) * vol;
    const close = open + bodySize;

    const wickUp = rand() * vol * 0.8;
    const wickDown = rand() * vol * 0.8;
    const high = Math.max(open, close) + wickUp;
    const low = Math.min(open, close) - wickDown;

    // Volume simulation
    const avgVolume = 15000;
    const volume = Math.max(100, avgVolume * (0.3 + rand() * 1.5));

    candles.push({
      time: startTime + i * intervalSec,
      open: Math.round(open * 100) / 100,
      high: Math.round(high * 100) / 100,
      low: Math.round(low * 100) / 100,
      close: Math.round(close * 100) / 100,
      volume: Math.round(volume),
    });

    price = close + (rand() - 0.5) * baseVol * 0.1;
    // Keep price in realistic gold range
    if (price < 2400) price += rand() * 20;
    if (price > 2900) price -= rand() * 20;
  }

  return {
    candles,
    status: 'demo',
    provider: 'Demo Data Generator',
    lastUpdated: Date.now(),
  };
}
