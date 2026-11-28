// ─── Core Types ─────────────────────────────────────────────────────────────

export interface Candle {
  time: number; // Unix timestamp in seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export type Timeframe = '5m' | '15m' | '30m' | '1h' | '4h' | '1D' | '1W' | '1M';

export const TIMEFRAMES: Timeframe[] = ['5m', '15m', '30m', '1h', '4h', '1D', '1W', '1M'];

export const TIMEFRAME_LABELS: Record<Timeframe, string> = {
  '5m': '5 Min',
  '15m': '15 Min',
  '30m': '30 Min',
  '1h': '1 Hour',
  '4h': '4 Hour',
  '1D': '1 Day',
  '1W': '1 Week',
  '1M': '1 Month',
};

// ─── Data Provider ──────────────────────────────────────────────────────────

export type DataStatus = 'live' | 'delayed' | 'demo' | 'loading' | 'error' | 'unavailable';

export interface MarketDataResult {
  candles: Candle[];
  status: DataStatus;
  provider: string;
  delay?: string; // e.g. "15 min delay"
  error?: string;
  lastUpdated?: number;
}

// ─── SMC Concepts ───────────────────────────────────────────────────────────

export type SMCConceptId =
  | 'liquidity'
  | 'fvg'
  | 'hh_ll'
  | 'order_block'
  | 'choch'
  | 'bos'
  | 'stddev_fib';

export interface SMCConcept {
  id: SMCConceptId;
  name: string;
  shortName: string;
  description: string;
  color: string;
  bgColor: string;
  icon: string;
}

export const SMC_CONCEPTS: SMCConcept[] = [
  {
    id: 'liquidity',
    name: 'Liquidity',
    shortName: 'LIQ',
    description: 'Equal highs/lows, liquidity pools, and likely sweep zones where stop orders cluster.',
    color: '#f59e0b',
    bgColor: 'rgba(245, 158, 11, 0.15)',
    icon: '💧',
  },
  {
    id: 'fvg',
    name: 'Fair Value Gap',
    shortName: 'FVG',
    description: 'Price imbalance areas where a candle\'s range doesn\'t overlap adjacent candles, often revisited.',
    color: '#8b5cf6',
    bgColor: 'rgba(139, 92, 246, 0.15)',
    icon: '📊',
  },
  {
    id: 'hh_ll',
    name: 'Higher High / Lower Low',
    shortName: 'HH/LL',
    description: 'Market structure swing points showing trend direction via successive highs and lows.',
    color: '#06b6d4',
    bgColor: 'rgba(6, 182, 212, 0.15)',
    icon: '📈',
  },
  {
    id: 'order_block',
    name: 'Order Block',
    shortName: 'OB',
    description: 'Last opposing candle before a strong move, indicating institutional entry zones.',
    color: '#ef4444',
    bgColor: 'rgba(239, 68, 68, 0.15)',
    icon: '🧱',
  },
  {
    id: 'choch',
    name: 'Change of Character',
    shortName: 'CHoCH',
    description: 'First break of the most recent swing in the opposite direction, signaling a potential reversal.',
    color: '#ec4899',
    bgColor: 'rgba(236, 72, 153, 0.15)',
    icon: '🔄',
  },
  {
    id: 'bos',
    name: 'Break of Structure',
    shortName: 'BOS',
    description: 'Price breaks beyond a significant swing high or low, confirming trend continuation.',
    color: '#10b981',
    bgColor: 'rgba(16, 185, 129, 0.15)',
    icon: '⚡',
  },
  {
    id: 'stddev_fib',
    name: 'StdDev Fibonacci',
    shortName: 'StdDev Fib',
    description: 'Fibonacci retracement levels combined with standard deviation bands for precision entries.',
    color: '#6366f1',
    bgColor: 'rgba(99, 102, 241, 0.15)',
    icon: '📐',
  },
];

// ─── Detection Results ──────────────────────────────────────────────────────

export interface DetectedZone {
  conceptId: SMCConceptId;
  type: string; // e.g. "Bullish FVG", "Equal Highs", "Bearish OB"
  startTime: number;
  endTime: number;
  priceHigh: number;
  priceLow: number;
  label: string;
  details: string;
  method: string; // Detection method description
}

export interface SwingPoint {
  time: number;
  price: number;
  type: 'HH' | 'HL' | 'LH' | 'LL' | 'EQH' | 'EQL';
}

// ─── Analysis ───────────────────────────────────────────────────────────────

export type SignalQuality = 'strong' | 'moderate' | 'weak' | 'none';

export interface TradeScenario {
  direction: 'buy' | 'sell';
  entry: number;
  stopLoss: number;
  takeProfit: number;
  riskReward: number;
  reasoning: string;
  concepts: string[];
  confidence: SignalQuality;
}

export interface AnalysisResult {
  instrument: string;
  timeframe: Timeframe;
  timestamp: number;
  currentPrice: number;
  marketStructure: string;
  detectedConcepts: { conceptId: SMCConceptId; count: number; summary: string }[];
  scenarios: TradeScenario[];
  overallSignal: SignalQuality;
  signalExplanation: string;
  assumptions: string[];
  disclaimer: string;
}

// ─── Glossary ───────────────────────────────────────────────────────────────

export const SMC_GLOSSARY: Record<string, string> = {
  'SMC': 'Smart Money Concepts — a methodology for analyzing institutional trading behavior.',
  'FVG': 'Fair Value Gap — a price imbalance between three consecutive candles.',
  'OB': 'Order Block — the last opposing candle before a significant move.',
  'BOS': 'Break of Structure — price breaking past a significant swing point, confirming trend.',
  'CHoCH': 'Change of Character — the first structural break in the opposite direction.',
  'HH': 'Higher High — a swing high above the previous swing high (uptrend).',
  'HL': 'Higher Low — a swing low above the previous swing low (uptrend).',
  'LH': 'Lower High — a swing high below the previous swing high (downtrend).',
  'LL': 'Lower Low — a swing low below the previous swing low (downtrend).',
  'EQH': 'Equal Highs — two or more highs at approximately the same level.',
  'EQL': 'Equal Lows — two or more lows at approximately the same level.',
  'Liquidity': 'Clusters of stop-loss orders (above highs or below lows) that institutions target.',
  'Sweep': 'Price briefly moves past a liquidity level to trigger stops before reversing.',
  'StdDev Fib': 'Standard Deviation Fibonacci — retracement levels weighted by price volatility.',
  'R:R': 'Risk-to-Reward Ratio — potential profit divided by potential loss.',
  'Premium': 'Price zone above 50% of range, expensive for buying.',
  'Discount': 'Price zone below 50% of range, favorable for buying.',
};
