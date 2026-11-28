"""Local server for the Aurum XAUUSD analyzer & backtester.
Supports Twelve Data (when TWELVEDATA_API_KEY is set) and falls back to
Yahoo Finance public chart data (GC=F / XAUUSD=X) for 1-year historical candles.
"""
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, quote, urlparse
from urllib.request import Request, urlopen
import json
import os
import threading
import time

ROOT = os.path.dirname(os.path.abspath(__file__))
KEY = os.environ.get("TWELVEDATA_API_KEY", "").strip()
PORT = int(os.environ.get("PORT", "8765"))
INTERVALS = {"1min", "5min", "15min", "30min", "1h", "4h", "1day", "1week"}

CACHE_TTL = 60
_cache = {}
_cache_lock = threading.Lock()


def _http_get_json(url, timeout=15):
    req = Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AurumAnalyzer/2.0",
            "Accept": "application/json",
        },
    )
    with urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def _resample_candles(candles, group_size):
    """Aggregate consecutive candles (e.g. 4 x 1h -> 4h)."""
    if group_size <= 1 or not candles:
        return candles
    out = []
    for i in range(0, len(candles), group_size):
        chunk = candles[i : i + group_size]
        if not chunk:
            continue
        out.append(
            {
                "time": chunk[0]["time"],
                "open": chunk[0]["open"],
                "high": max(c["high"] for c in chunk),
                "low": min(c["low"] for c in chunk),
                "close": chunk[-1]["close"],
                "volume": sum(c.get("volume", 0) for c in chunk),
            }
        )
    return out


def _fetch_twelvedata(interval):
    start_dt = (datetime.now(timezone.utc) - timedelta(days=366)).strftime("%Y-%m-%d %H:%M:%S")
    params = {
        "symbol": "XAU/USD",
        "interval": interval,
        "outputsize": "5000",
        "start_date": start_dt,
        "apikey": KEY,
        "timezone": "UTC",
    }
    url = "https://api.twelvedata.com/time_series?" + "&".join(
        f"{k}={quote(v)}" for k, v in params.items()
    )
    data = _http_get_json(url, timeout=20)
    if "values" not in data:
        raise ValueError(data.get("message", "Twelve Data did not return candles"))
    candles = []
    for v in reversed(data["values"]):
        try:
            candles.append(
                {
                    "time": v["datetime"],
                    "open": float(v["open"]),
                    "high": float(v["high"]),
                    "low": float(v["low"]),
                    "close": float(v["close"]),
                    "volume": float(v.get("volume") or 0),
                }
            )
        except (KeyError, ValueError, TypeError):
            pass
    if not candles:
        raise ValueError("Twelve Data returned empty candle list")
    return {
        "connected": True,
        "provider": "Twelve Data",
        "symbol": "XAU/USD",
        "interval": interval,
        "candles": candles,
        "fetchedAt": int(time.time()),
        "isRealtime": True,
    }


def _fetch_yahoo(interval):
    yf_map = {
        "1min": ("7d", "1m", 1),
        "5min": ("60d", "5m", 1),
        "15min": ("60d", "15m", 1),
        "30min": ("60d", "30m", 1),
        "1h": ("1y", "1h", 1),
        "4h": ("1y", "1h", 4),
        "1day": ("1y", "1d", 1),
        "1week": ("2y", "1wk", 1),
    }
    rng, yf_int, resample_n = yf_map[interval]
    last_err = None
    for ticker in ("GC=F", "XAUUSD=X"):
        url = (
            f"https://query1.finance.yahoo.com/v8/finance/chart/{quote(ticker)}"
            f"?range={rng}&interval={yf_int}&includePrePost=false"
        )
        try:
            data = _http_get_json(url, timeout=15)
            result = (data.get("chart") or {}).get("result")
            if not result:
                continue
            res0 = result[0]
            ts_list = res0.get("timestamp") or []
            quote_obj = ((res0.get("indicators") or {}).get("quote") or [{}])[0]
            opens = quote_obj.get("open") or []
            highs = quote_obj.get("high") or []
            lows = quote_obj.get("low") or []
            closes = quote_obj.get("close") or []
            vols = quote_obj.get("volume") or []

            candles = []
            fmt = "%Y-%m-%d" if yf_int in ("1d", "1wk") else "%Y-%m-%d %H:%M:%S"
            for i, ts in enumerate(ts_list):
                try:
                    o, h, l, c = opens[i], highs[i], lows[i], closes[i]
                    if o is None or h is None or l is None or c is None:
                        continue
                    dt = datetime.fromtimestamp(ts, tz=timezone.utc).strftime(fmt)
                    v = vols[i] if i < len(vols) and vols[i] is not None else 0
                    candles.append(
                        {
                            "time": dt,
                            "open": round(float(o), 2),
                            "high": round(float(h), 2),
                            "low": round(float(l), 2),
                            "close": round(float(c), 2),
                            "volume": float(v),
                        }
                    )
                except (IndexError, TypeError, ValueError):
                    continue

            if resample_n > 1:
                candles = _resample_candles(candles, resample_n)

            if candles:
                label = "XAU/USD (Gold Spot)" if ticker == "XAUUSD=X" else "XAU/USD (COMEX GC=F)"
                return {
                    "connected": True,
                    "provider": f"Yahoo Finance · {ticker}",
                    "symbol": label,
                    "interval": interval,
                    "candles": candles,
                    "fetchedAt": int(time.time()),
                    "isRealtime": False,
                }
        except (HTTPError, URLError, TimeoutError, json.JSONDecodeError, ValueError) as e:
            last_err = e
            continue
    raise ValueError(f"Yahoo Finance feed unavailable: {last_err or 'empty response'}")


def get_market_data(interval):
    now = time.time()
    with _cache_lock:
        cached = _cache.get(interval)
        if cached and now - cached["ts"] < CACHE_TTL:
            return cached["data"]

    data = None
    td_error = None
    if KEY:
        try:
            data = _fetch_twelvedata(interval)
        except Exception as e:
            td_error = str(e)

    if data is None:
        data = _fetch_yahoo(interval)
        if td_error:
            data["note"] = f"Twelve Data fallback ({td_error})"

    with _cache_lock:
        _cache[interval] = {"ts": now, "data": data}
    return data


def _compute_mtf_row(interval, candles):
    if len(candles) < 25:
        return {"interval": interval, "trend": "—", "bos": "insufficient data", "rsi": None}
    closes = [c["close"] for c in candles]

    def _ema(vals, n):
        k = 2 / (n + 1)
        v = None
        out = []
        for x in vals:
            v = x if v is None else v + (x - v) * k
            out.append(v)
        return out

    e20 = _ema(closes, 20)[-1]
    e50 = _ema(closes, 50)[-1]
    last = closes[-1]
    trend = "Bullish" if last > e20 > e50 else "Bearish" if last < e20 < e50 else "Sideways"

    # RSI 14
    rsi_val = None
    if len(closes) >= 15:
        gains = sum(max(0.0, closes[i] - closes[i - 1]) for i in range(-14, 0))
        losses = sum(max(0.0, closes[i - 1] - closes[i]) for i in range(-14, 0))
        rsi_val = 100.0 if losses == 0 else 100.0 - 100.0 / (1.0 + gains / losses)

    piv_h, piv_l = [], []
    start = max(2, len(candles) - 70)
    for i in range(start, len(candles) - 2):
        h = candles[i]["high"]
        l = candles[i]["low"]
        if h > candles[i - 1]["high"] and h > candles[i - 2]["high"] and h > candles[i + 1]["high"] and h > candles[i + 2]["high"]:
            piv_h.append(h)
        if l < candles[i - 1]["low"] and l < candles[i - 2]["low"] and l < candles[i + 1]["low"] and l < candles[i + 2]["low"]:
            piv_l.append(l)

    bos = "No BOS"
    if piv_h and last > piv_h[-1]:
        bos = "Bullish BOS"
    elif piv_l and last < piv_l[-1]:
        bos = "Bearish BOS"

    return {
        "interval": interval,
        "trend": trend,
        "bos": bos,
        "rsi": round(rsi_val, 1) if rsi_val is not None else None,
    }


class Handler(BaseHTTPRequestHandler):
    def send_json(self, data, status=200):
        body = json.dumps(data).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/status":
            return self.send_json(
                {
                    "connected": True,
                    "provider": "Twelve Data" if KEY else "Yahoo Finance (Free 1Y Feed)",
                    "symbol": "XAU/USD",
                    "mode": "Twelve Data API" if KEY else "Public 1Y Gold Feed (no key required)",
                }
            )

        if parsed.path == "/api/market":
            q = parse_qs(parsed.query)
            interval = q.get("interval", ["1day"])[0]
            if interval not in INTERVALS:
                return self.send_json({"error": "Unsupported interval"}, 400)
            try:
                data = get_market_data(interval)
                return self.send_json(data)
            except Exception as e:
                return self.send_json({"error": f"Market feed request failed: {e}", "connected": False}, 502)

        if parsed.path == "/api/mtf":
            rows = []
            for tf in ("15min", "1h", "4h", "1day", "1week"):
                try:
                    d = get_market_data(tf)
                    rows.append(_compute_mtf_row(tf, d.get("candles", [])))
                except Exception:
                    rows.append({"interval": tf, "trend": "—", "bos": "unavailable", "rsi": None})
            return self.send_json({"rows": rows})

        if parsed.path == "/" or not parsed.path.startswith("/api/"):
            try:
                with open(os.path.join(ROOT, "index.html"), "rb") as f:
                    body = f.read()
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
            except OSError:
                self.send_error(404)
            return

        self.send_error(404)

    def log_message(self, fmt, *args):
        print("%s - %s" % (self.address_string(), fmt % args))


if __name__ == "__main__":
    mode = "Twelve Data + Yahoo fallback" if KEY else "Yahoo Finance 1Y Gold Feed"
    print(f"Aurum XAUUSD Analyzer at http://localhost:{PORT} | feed: {mode}")
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
