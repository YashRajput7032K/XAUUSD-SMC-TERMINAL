# XAUUSD SMC Analyzer – Smart Money Concepts Dashboard

A professional web dashboard for analyzing the **XAU/USD** (Gold/USD) forex market using **Smart Money Concepts (SMC)**.

## Features

- **Live or Demo market data** – pulls real‑time candlesticks from Twelve Data or Finnhub, falling back to a realistic synthetic data generator when no API key is supplied.
- **Multi‑timeframe** candlestick chart (5 m, 15 m, 30 m, 1 h, 4 h, 1 D, 1 W, 1 M).
- **SMC concept detection** – Liquidity pools, Fair‑Value Gaps, Higher‑High/Lower‑Low, Order Blocks, CHoCH, BOS, StdDev Fibonacci.
- **Searchable left sidebar** to toggle concepts on/off, view detections and a glossary of SMC terms.
- **Analyze button** opens a right‑hand panel with market‑structure summary, trade‑scenario suggestions, risk‑reward calculations and a plain‑language confidence label.
- **Responsive, accessible layout** with keyboard‑friendly controls and reduced‑motion support.
- **Custom professional cursor** – cross‑hair‑style pointer that subtly changes over interactive elements and reverts to the native cursor on touch devices.
- **Clear “DEMO” mode indicator** when no API credentials are present.

## Getting Started

1. **Clone the repository** (if you haven’t already):
   ```bash
   git clone <repo‑url>
   cd "LLM pipeline pro 3 /XAUUSD"
   ```

2. **Install dependencies** (the sandbox already has a recent Node v20):
   ```bash
   npm install
   ```

3. **Configure API keys (optional)** – copy the example file and add your keys:
   ```bash
   cp .env.example .env.local
   # Edit .env.local and add either TWELVE_DATA_API_KEY or FINNHUB_API_KEY.
   # If you leave them blank the app will run in DEMO mode using synthetic data.
   ```

4. **Run the development server**:
   ```bash
   npm run dev
   ```
   Open <http://localhost:3000> in your browser.

5. **Production build** (optional):
   ```bash
   npm run build
   npm start
   ```

## Usage Overview

- **Timeframe selector** – choose a timeframe from the top‑right controls.
- **Concept sidebar** – click the left‑hand toggle button, search for a concept, enable/disable it, and view detected zones on the chart.
- **Analyze button** – after selecting concepts (or relying on the auto‑selected defaults), click **Analyze** to generate trade‑scenario cards in the right panel.
- **Demo mode warning** – when no API keys are present a banner explains that the data is synthetic and encourages adding real keys.

## Architecture Highlights

- **Next.js 14 (App Router)** with TypeScript and Tailwind CSS.
- **lightweight‑charts** v5 – leveraged via `chart.addSeries(CandlestickSeries, …)` and `createSeriesMarkers` for zone markers.
- **SMC engine** (`src/lib/smc-analysis.ts`) implements swing‑point detection and all concept detectors.
- **Secure provider interface** – market‑data fetches happen on the server side (`/api/market-data`) so API secrets never reach the browser.

## License

MIT – feel free to fork, extend, or integrate this dashboard into your own trading tools.

---

If you need to add more market‑data providers, tweak detection thresholds, or integrate a broker API for order execution, the code is modular and ready for extension.
