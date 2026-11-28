import {
  Candle, Timeframe, SMCConceptId, DetectedZone, SwingPoint,
  AnalysisResult, TradeScenario, SignalQuality,
} from './types';

// ─── Swing Point Detection ──────────────────────────────────────────────────

function findSwingPoints(candles: Candle[], lookback: number = 5): SwingPoint[] {
  const swings: SwingPoint[] = [];
  if (candles.length < lookback * 2 + 1) return swings;

  for (let i = lookback; i < candles.length - lookback; i++) {
    let isSwingHigh = true;
    let isSwingLow = true;

    for (let j = 1; j <= lookback; j++) {
      if (candles[i].high <= candles[i - j].high || candles[i].high <= candles[i + j].high) {
        isSwingHigh = false;
      }
      if (candles[i].low >= candles[i - j].low || candles[i].low >= candles[i + j].low) {
        isSwingLow = false;
      }
    }

    if (isSwingHigh) {
      swings.push({ time: candles[i].time, price: candles[i].high, type: 'HH' });
    }
    if (isSwingLow) {
      swings.push({ time: candles[i].time, price: candles[i].low, type: 'LL' });
    }
  }

  // Classify swing types
  const highs = swings.filter(s => s.type === 'HH');
  const lows = swings.filter(s => s.type === 'LL');

  for (let i = 1; i < highs.length; i++) {
    highs[i].type = highs[i].price > highs[i - 1].price ? 'HH' : 'LH';
  }
  for (let i = 1; i < lows.length; i++) {
    lows[i].type = lows[i].price > lows[i - 1].price ? 'HL' : 'LL';
  }

  return [...highs, ...lows].sort((a, b) => a.time - b.time);
}

// ─── Concept Detectors ──────────────────────────────────────────────────────

function detectLiquidity(candles: Candle[], swings: SwingPoint[]): DetectedZone[] {
  const zones: DetectedZone[] = [];
  const tolerance = 0.001; // 0.1% tolerance for "equal" levels

  // Equal Highs
  const highs = swings.filter(s => s.type === 'HH' || s.type === 'LH');
  for (let i = 0; i < highs.length; i++) {
    for (let j = i + 1; j < highs.length; j++) {
      const diff = Math.abs(highs[i].price - highs[j].price) / highs[i].price;
      if (diff < tolerance) {
        const avgPrice = (highs[i].price + highs[j].price) / 2;
        zones.push({
          conceptId: 'liquidity',
          type: 'Equal Highs (Buy-side Liquidity)',
          startTime: highs[i].time,
          endTime: highs[j].time,
          priceHigh: avgPrice + 1,
          priceLow: avgPrice - 1,
          label: 'EQH',
          details: `Equal highs near $${avgPrice.toFixed(2)} — buy-side liquidity pool. Stop orders above these levels may be targeted.`,
          method: `Swing highs within ${(tolerance * 100).toFixed(1)}% of each other.`,
        });
      }
    }
  }

  // Equal Lows
  const lows = swings.filter(s => s.type === 'LL' || s.type === 'HL');
  for (let i = 0; i < lows.length; i++) {
    for (let j = i + 1; j < lows.length; j++) {
      const diff = Math.abs(lows[i].price - lows[j].price) / lows[i].price;
      if (diff < tolerance) {
        const avgPrice = (lows[i].price + lows[j].price) / 2;
        zones.push({
          conceptId: 'liquidity',
          type: 'Equal Lows (Sell-side Liquidity)',
          startTime: lows[i].time,
          endTime: lows[j].time,
          priceHigh: avgPrice + 1,
          priceLow: avgPrice - 1,
          label: 'EQL',
          details: `Equal lows near $${avgPrice.toFixed(2)} — sell-side liquidity pool. Stop orders below may be targeted.`,
          method: `Swing lows within ${(tolerance * 100).toFixed(1)}% of each other.`,
        });
      }
    }
  }

  // Recent high/low as liquidity targets
  if (candles.length > 20) {
    const recent = candles.slice(-50);
    const recentHigh = Math.max(...recent.map(c => c.high));
    const recentLow = Math.min(...recent.map(c => c.low));
    const hCandle = recent.find(c => c.high === recentHigh)!;
    const lCandle = recent.find(c => c.low === recentLow)!;

    zones.push({
      conceptId: 'liquidity',
      type: 'Buy-side Liquidity Target',
      startTime: hCandle.time,
      endTime: candles[candles.length - 1].time,
      priceHigh: recentHigh + 2,
      priceLow: recentHigh - 2,
      label: 'BSL',
      details: `Recent high at $${recentHigh.toFixed(2)} — potential liquidity sweep target.`,
      method: 'Highest high of last 50 candles.',
    });

    zones.push({
      conceptId: 'liquidity',
      type: 'Sell-side Liquidity Target',
      startTime: lCandle.time,
      endTime: candles[candles.length - 1].time,
      priceHigh: recentLow + 2,
      priceLow: recentLow - 2,
      label: 'SSL',
      details: `Recent low at $${recentLow.toFixed(2)} — potential liquidity sweep target.`,
      method: 'Lowest low of last 50 candles.',
    });
  }

  return zones;
}

function detectFVG(candles: Candle[]): DetectedZone[] {
  const zones: DetectedZone[] = [];
  if (candles.length < 3) return zones;

  for (let i = 2; i < candles.length; i++) {
    const prev = candles[i - 2];
    const mid = candles[i - 1];
    const curr = candles[i];

    // Bullish FVG: gap between candle 1 high and candle 3 low
    if (curr.low > prev.high) {
      const gapSize = curr.low - prev.high;
      if (gapSize > 0.5) { // Minimum gap size for gold
        zones.push({
          conceptId: 'fvg',
          type: 'Bullish FVG',
          startTime: prev.time,
          endTime: curr.time,
          priceHigh: curr.low,
          priceLow: prev.high,
          label: 'FVG↑',
          details: `Bullish Fair Value Gap: $${prev.high.toFixed(2)} — $${curr.low.toFixed(2)} (${gapSize.toFixed(2)} gap). Price may retrace to fill this imbalance.`,
          method: 'Three-candle pattern where candle 3 low > candle 1 high.',
        });
      }
    }

    // Bearish FVG: gap between candle 3 high and candle 1 low
    if (curr.high < prev.low) {
      const gapSize = prev.low - curr.high;
      if (gapSize > 0.5) {
        zones.push({
          conceptId: 'fvg',
          type: 'Bearish FVG',
          startTime: prev.time,
          endTime: curr.time,
          priceHigh: prev.low,
          priceLow: curr.high,
          label: 'FVG↓',
          details: `Bearish Fair Value Gap: $${curr.high.toFixed(2)} — $${prev.low.toFixed(2)} (${gapSize.toFixed(2)} gap). Price may retrace upward to fill this imbalance.`,
          method: 'Three-candle pattern where candle 3 high < candle 1 low.',
        });
      }
    }

    // Partial FVG (body-based, more sensitive)
    if (mid.close > mid.open) { // Bullish candle
      if (curr.low > prev.high && curr.low - prev.high > 0.3) {
        // Already caught above
      }
    }
  }

  // Limit to most recent 15
  return zones.slice(-15);
}

function detectHHLL(candles: Candle[], swings: SwingPoint[]): DetectedZone[] {
  const zones: DetectedZone[] = [];

  for (const swing of swings) {
    zones.push({
      conceptId: 'hh_ll',
      type: swing.type === 'HH' ? 'Higher High' :
            swing.type === 'HL' ? 'Higher Low' :
            swing.type === 'LH' ? 'Lower High' : 'Lower Low',
      startTime: swing.time,
      endTime: swing.time,
      priceHigh: swing.price + 1,
      priceLow: swing.price - 1,
      label: swing.type,
      details: `${swing.type} at $${swing.price.toFixed(2)}`,
      method: 'Swing detection with 5-candle lookback on each side.',
    });
  }

  return zones;
}

function detectOrderBlocks(candles: Candle[]): DetectedZone[] {
  const zones: DetectedZone[] = [];
  if (candles.length < 5) return zones;

  for (let i = 1; i < candles.length - 2; i++) {
    const prev = candles[i - 1];
    const curr = candles[i];
    const next1 = candles[i + 1];
    const next2 = candles[i + 2];

    // Bullish Order Block: bearish candle followed by strong bullish move
    if (curr.close < curr.open) { // Bearish candle
      const moveUp = Math.max(next1.close, next2.close) - curr.close;
      const bodySize = curr.open - curr.close;
      if (moveUp > bodySize * 2 && bodySize > 1) {
        zones.push({
          conceptId: 'order_block',
          type: 'Bullish Order Block',
          startTime: curr.time,
          endTime: next1.time,
          priceHigh: curr.open,
          priceLow: curr.low,
          label: 'OB↑',
          details: `Bullish OB: $${curr.low.toFixed(2)} — $${curr.open.toFixed(2)}. Last bearish candle before ${moveUp.toFixed(2)} upward impulse.`,
          method: 'Last bearish candle before move > 2× its body size.',
        });
      }
    }

    // Bearish Order Block: bullish candle followed by strong bearish move
    if (curr.close > curr.open) { // Bullish candle
      const moveDown = curr.close - Math.min(next1.close, next2.close);
      const bodySize = curr.close - curr.open;
      if (moveDown > bodySize * 2 && bodySize > 1) {
        zones.push({
          conceptId: 'order_block',
          type: 'Bearish Order Block',
          startTime: curr.time,
          endTime: next1.time,
          priceHigh: curr.high,
          priceLow: curr.open,
          label: 'OB↓',
          details: `Bearish OB: $${curr.open.toFixed(2)} — $${curr.high.toFixed(2)}. Last bullish candle before ${moveDown.toFixed(2)} downward impulse.`,
          method: 'Last bullish candle before move > 2× its body size.',
        });
      }
    }
  }

  return zones.slice(-10);
}

function detectCHoCH(candles: Candle[], swings: SwingPoint[]): DetectedZone[] {
  const zones: DetectedZone[] = [];
  const highs = swings.filter(s => s.type === 'HH' || s.type === 'LH');
  const lows = swings.filter(s => s.type === 'LL' || s.type === 'HL');

  // CHoCH in uptrend: price breaks below the most recent Higher Low
  for (let i = 1; i < lows.length; i++) {
    if (lows[i - 1].type === 'HL' && lows[i].type === 'LL') {
      zones.push({
        conceptId: 'choch',
        type: 'Bearish CHoCH',
        startTime: lows[i - 1].time,
        endTime: lows[i].time,
        priceHigh: lows[i - 1].price + 2,
        priceLow: lows[i].price - 2,
        label: 'CHoCH↓',
        details: `Bearish Change of Character: Higher Low broken at $${lows[i - 1].price.toFixed(2)} → Lower Low at $${lows[i].price.toFixed(2)}. Potential trend reversal from bullish to bearish.`,
        method: 'First HL→LL transition in swing structure.',
      });
    }
  }

  // CHoCH in downtrend: price breaks above the most recent Lower High
  for (let i = 1; i < highs.length; i++) {
    if (highs[i - 1].type === 'LH' && highs[i].type === 'HH') {
      zones.push({
        conceptId: 'choch',
        type: 'Bullish CHoCH',
        startTime: highs[i - 1].time,
        endTime: highs[i].time,
        priceHigh: highs[i].price + 2,
        priceLow: highs[i - 1].price - 2,
        label: 'CHoCH↑',
        details: `Bullish Change of Character: Lower High broken at $${highs[i - 1].price.toFixed(2)} → Higher High at $${highs[i].price.toFixed(2)}. Potential trend reversal from bearish to bullish.`,
        method: 'First LH→HH transition in swing structure.',
      });
    }
  }

  return zones;
}

function detectBOS(candles: Candle[], swings: SwingPoint[]): DetectedZone[] {
  const zones: DetectedZone[] = [];
  const highs = swings.filter(s => s.type === 'HH' || s.type === 'LH');
  const lows = swings.filter(s => s.type === 'LL' || s.type === 'HL');

  // Bullish BOS: HH confirmed (trend continuation up)
  for (let i = 1; i < highs.length; i++) {
    if (highs[i].type === 'HH' && highs[i - 1].type === 'HH') {
      zones.push({
        conceptId: 'bos',
        type: 'Bullish BOS',
        startTime: highs[i - 1].time,
        endTime: highs[i].time,
        priceHigh: highs[i].price + 1,
        priceLow: highs[i - 1].price - 1,
        label: 'BOS↑',
        details: `Bullish Break of Structure: Previous high $${highs[i - 1].price.toFixed(2)} broken → new high $${highs[i].price.toFixed(2)}. Uptrend confirmed.`,
        method: 'Consecutive Higher Highs in swing structure.',
      });
    }
  }

  // Bearish BOS: LL confirmed (trend continuation down)
  for (let i = 1; i < lows.length; i++) {
    if (lows[i].type === 'LL' && lows[i - 1].type === 'LL') {
      zones.push({
        conceptId: 'bos',
        type: 'Bearish BOS',
        startTime: lows[i - 1].time,
        endTime: lows[i].time,
        priceHigh: lows[i - 1].price + 1,
        priceLow: lows[i].price - 1,
        label: 'BOS↓',
        details: `Bearish Break of Structure: Previous low $${lows[i - 1].price.toFixed(2)} broken → new low $${lows[i].price.toFixed(2)}. Downtrend confirmed.`,
        method: 'Consecutive Lower Lows in swing structure.',
      });
    }
  }

  return zones;
}

function detectStdDevFib(candles: Candle[]): DetectedZone[] {
  const zones: DetectedZone[] = [];
  if (candles.length < 20) return zones;

  // Find the most significant recent swing range
  const recent = candles.slice(-100);
  const high = Math.max(...recent.map(c => c.high));
  const low = Math.min(...recent.map(c => c.low));
  const range = high - low;

  if (range < 5) return zones; // Too small a range for gold

  // Calculate standard deviation
  const closes = recent.map(c => c.close);
  const mean = closes.reduce((a, b) => a + b, 0) / closes.length;
  const variance = closes.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / closes.length;
  const stdDev = Math.sqrt(variance);

  // Fib levels with StdDev bands
  const fibLevels = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
  const fibNames = ['0%', '23.6%', '38.2%', '50%', '61.8%', '78.6%', '100%'];
  const isUpswing = recent[recent.length - 1].close > recent[0].close;

  const startTime = recent[0].time;
  const endTime = recent[recent.length - 1].time;

  fibLevels.forEach((level, idx) => {
    const price = isUpswing ? high - range * level : low + range * level;
    const upper = price + stdDev * 0.5;
    const lower = price - stdDev * 0.5;

    zones.push({
      conceptId: 'stddev_fib',
      type: `Fib ${fibNames[idx]} ± StdDev`,
      startTime,
      endTime,
      priceHigh: upper,
      priceLow: lower,
      label: `Fib ${fibNames[idx]}`,
      details: `Fibonacci ${fibNames[idx]}: $${price.toFixed(2)} (±$${(stdDev * 0.5).toFixed(2)} StdDev band). ${
        level === 0.618 ? 'Golden ratio — key institutional level.' :
        level === 0.5 ? 'Equilibrium — premium/discount boundary.' :
        level === 0.786 ? 'Deep retracement — high probability reversal zone.' :
        `Standard retracement level.`
      }`,
      method: `Fibonacci retracement of ${isUpswing ? 'upswing' : 'downswing'} ($${low.toFixed(2)}–$${high.toFixed(2)}) with ±0.5σ bands (σ = $${stdDev.toFixed(2)}).`,
    });
  });

  return zones;
}

// ─── Main Detection ─────────────────────────────────────────────────────────

export function detectConcept(
  conceptId: SMCConceptId,
  candles: Candle[],
  timeframe: Timeframe
): DetectedZone[] {
  if (candles.length < 10) return [];

  const swings = findSwingPoints(candles);

  switch (conceptId) {
    case 'liquidity': return detectLiquidity(candles, swings);
    case 'fvg': return detectFVG(candles);
    case 'hh_ll': return detectHHLL(candles, swings);
    case 'order_block': return detectOrderBlocks(candles);
    case 'choch': return detectCHoCH(candles, swings);
    case 'bos': return detectBOS(candles, swings);
    case 'stddev_fib': return detectStdDevFib(candles);
    default: return [];
  }
}

// ─── Full Analysis ──────────────────────────────────────────────────────────

export function runFullAnalysis(
  candles: Candle[],
  timeframe: Timeframe,
  activeConcepts: SMCConceptId[]
): AnalysisResult {
  if (candles.length < 20) {
    return {
      instrument: 'XAU/USD',
      timeframe,
      timestamp: Date.now(),
      currentPrice: candles.length > 0 ? candles[candles.length - 1].close : 0,
      marketStructure: 'Insufficient data for analysis',
      detectedConcepts: [],
      scenarios: [],
      overallSignal: 'none',
      signalExplanation: 'Not enough candle data to perform analysis. At least 20 candles are required.',
      assumptions: [],
      disclaimer: 'This analysis is for educational and planning purposes only. It is not financial advice and does not guarantee future results.',
    };
  }

  const lastCandle = candles[candles.length - 1];
  const currentPrice = lastCandle.close;

  // Detect all active concepts
  const allZones: DetectedZone[] = [];
  const conceptSummaries: { conceptId: SMCConceptId; count: number; summary: string }[] = [];

  for (const concept of activeConcepts) {
    const zones = detectConcept(concept, candles, timeframe);
    allZones.push(...zones);
    if (zones.length > 0) {
      conceptSummaries.push({
        conceptId: concept,
        count: zones.length,
        summary: zones.slice(-3).map(z => z.type).join(', '),
      });
    }
  }

  // Determine market structure
  const swings = findSwingPoints(candles);
  const recentHighs = swings.filter(s => (s.type === 'HH' || s.type === 'LH')).slice(-4);
  const recentLows = swings.filter(s => (s.type === 'LL' || s.type === 'HL')).slice(-4);

  let structure = 'Ranging / Unclear';
  let bullishCount = 0;
  let bearishCount = 0;

  recentHighs.forEach(h => { if (h.type === 'HH') bullishCount++; else bearishCount++; });
  recentLows.forEach(l => { if (l.type === 'HL') bullishCount++; else bearishCount++; });

  if (bullishCount >= 4) structure = 'Bullish (HH + HL pattern)';
  else if (bearishCount >= 4) structure = 'Bearish (LH + LL pattern)';
  else if (bullishCount > bearishCount) structure = 'Weakly Bullish';
  else if (bearishCount > bullishCount) structure = 'Weakly Bearish';

  // Generate trade scenarios
  const scenarios: TradeScenario[] = [];

  // Look for bullish setups
  const bullishOBs = allZones.filter(z => z.type.includes('Bullish') && z.conceptId === 'order_block');
  const bullishFVGs = allZones.filter(z => z.type.includes('Bullish') && z.conceptId === 'fvg');
  const bullishCHoCH = allZones.filter(z => z.type.includes('Bullish') && z.conceptId === 'choch');

  if (bullishOBs.length > 0 || bullishFVGs.length > 0) {
    const nearestOB = bullishOBs[bullishOBs.length - 1];
    const nearestFVG = bullishFVGs[bullishFVGs.length - 1];

    const entryZone = nearestOB || nearestFVG;
    if (entryZone && entryZone.priceLow < currentPrice) {
      const entry = (entryZone.priceHigh + entryZone.priceLow) / 2;
      const sl = entryZone.priceLow - 3;
      const risk = entry - sl;
      const tp = entry + risk * 2;
      const rr = (tp - entry) / (entry - sl);

      const reasons: string[] = [];
      if (nearestOB) reasons.push('Bullish Order Block');
      if (nearestFVG) reasons.push('Bullish FVG');
      if (bullishCHoCH.length > 0) reasons.push('Bullish CHoCH confirmed');
      if (structure.includes('Bullish')) reasons.push('Bullish market structure');

      const confidence: SignalQuality =
        reasons.length >= 3 ? 'strong' :
        reasons.length >= 2 ? 'moderate' : 'weak';

      scenarios.push({
        direction: 'buy',
        entry: Math.round(entry * 100) / 100,
        stopLoss: Math.round(sl * 100) / 100,
        takeProfit: Math.round(tp * 100) / 100,
        riskReward: Math.round(rr * 100) / 100,
        reasoning: `Buy setup based on ${reasons.join(' + ')}. Entry at the ${nearestOB ? 'order block' : 'FVG'} zone, stop below the zone with 2:1 target.`,
        concepts: reasons,
        confidence,
      });
    }
  }

  // Look for bearish setups
  const bearishOBs = allZones.filter(z => z.type.includes('Bearish') && z.conceptId === 'order_block');
  const bearishFVGs = allZones.filter(z => z.type.includes('Bearish') && z.conceptId === 'fvg');
  const bearishCHoCH = allZones.filter(z => z.type.includes('Bearish') && z.conceptId === 'choch');

  if (bearishOBs.length > 0 || bearishFVGs.length > 0) {
    const nearestOB = bearishOBs[bearishOBs.length - 1];
    const nearestFVG = bearishFVGs[bearishFVGs.length - 1];

    const entryZone = nearestOB || nearestFVG;
    if (entryZone && entryZone.priceHigh > currentPrice) {
      const entry = (entryZone.priceHigh + entryZone.priceLow) / 2;
      const sl = entryZone.priceHigh + 3;
      const risk = sl - entry;
      const tp = entry - risk * 2;
      const rr = (entry - tp) / (sl - entry);

      const reasons: string[] = [];
      if (nearestOB) reasons.push('Bearish Order Block');
      if (nearestFVG) reasons.push('Bearish FVG');
      if (bearishCHoCH.length > 0) reasons.push('Bearish CHoCH confirmed');
      if (structure.includes('Bearish')) reasons.push('Bearish market structure');

      const confidence: SignalQuality =
        reasons.length >= 3 ? 'strong' :
        reasons.length >= 2 ? 'moderate' : 'weak';

      scenarios.push({
        direction: 'sell',
        entry: Math.round(entry * 100) / 100,
        stopLoss: Math.round(sl * 100) / 100,
        takeProfit: Math.round(tp * 100) / 100,
        riskReward: Math.round(rr * 100) / 100,
        reasoning: `Sell setup based on ${reasons.join(' + ')}. Entry at the ${nearestOB ? 'order block' : 'FVG'} zone, stop above the zone with 2:1 target.`,
        concepts: reasons,
        confidence,
      });
    }
  }

  // Overall signal
  let overallSignal: SignalQuality = 'none';
  let signalExplanation = 'No valid trade setups detected on this timeframe with current data.';

  if (scenarios.length > 0) {
    const best = scenarios.reduce((a, b) =>
      (['strong', 'moderate', 'weak', 'none'].indexOf(a.confidence) <=
       ['strong', 'moderate', 'weak', 'none'].indexOf(b.confidence)) ? a : b
    );
    overallSignal = best.confidence;

    const explanations: Record<SignalQuality, string> = {
      strong: 'Multiple confluent SMC factors align — high-quality setup with strong structural support.',
      moderate: 'Some SMC factors present but lacking full confluence — proceed with caution and proper risk management.',
      weak: 'Limited structural support — consider waiting for more confirmation or a higher-timeframe alignment.',
      none: 'No actionable setup detected.',
    };
    signalExplanation = explanations[overallSignal];
  }

  return {
    instrument: 'XAU/USD',
    timeframe,
    timestamp: Date.now(),
    currentPrice,
    marketStructure: structure,
    detectedConcepts: conceptSummaries,
    scenarios,
    overallSignal,
    signalExplanation,
    assumptions: [
      'Analysis is based on historical candle data visible on the chart.',
      'Detection thresholds are optimized for XAUUSD volatility characteristics.',
      `Swing detection uses a ${5}-candle lookback on each side.`,
      'Order blocks require a subsequent move > 2× the candle body.',
      'Trade levels assume a 2:1 minimum risk-reward ratio with $3 buffer for stops.',
    ],
    disclaimer: 'This analysis is for educational and planning purposes only. It is not financial advice and does not guarantee future results. Always use proper risk management.',
  };
}
