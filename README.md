# Aurum — XAUUSD Market Analyzer

A local, rules-based XAU/USD dashboard. Prices and candles are fetched from Twelve Data; the application never fills missing data with sample prices. The browser receives provider candles from the local server, while your API key stays in the server process environment.

## Run

1. Obtain a Twelve Data API key and check your plan's XAU/USD and interval entitlements.
2. In a terminal, from this directory, run `export TWELVEDATA_API_KEY='your-key'`.
3. Run `python3 server.py` and open `http://localhost:8765`.

Without a key the app starts in a clearly marked disconnected state. The chart/API data source and timestamp are shown in the interface. Data refreshes once per minute. Provider access, delays, rate limits and available intervals depend on your account.

## Included

- Responsive dark dashboard with custom candle chart, EMA 20, range midpoint and timeframe controls for M1 through W1.
- Candle-derived trend, EMA 20/50, RSI 14, pivots, basic BOS, equal-high/low and three-candle imbalance observations.
- Rule-based directional filter; WAIT is shown unless EMA alignment, RSI and recent range-half conditions agree.
- Dynamically calculated entry, stop and three risk-multiple targets only when the confirmation filter passes.
- Economic calendar explicitly marked unavailable until a licensed news feed is connected.
- Local-browser signal journal. Outcome verification and backtesting are not represented as available.

## Limits

The Twelve Data endpoint supplies OHLC candles. This MVP does not have a separate bid/ask quote, verified spread, economic-news feed, volume validation, daily/session-specific feed, or simultaneous multi-timeframe retrieval. Corresponding UI values are not fabricated. Higher-timeframe rows other than the selected interval remain pending. Supply/demand and SMC detections are basic OHLC heuristics, not institutional order-flow data. Use a separately licensed and verified source before relying on live execution; this app does not execute trades.
