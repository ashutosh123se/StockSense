"""
Signals API
Provides real-time technical analysis signals for the dashboard watchlist.
"""
from fastapi import APIRouter
from typing import List, Optional
from app.services.market_data import market_data_service
from app.services.signal_engine import signal_engine
import asyncio

router = APIRouter()

NSE_WATCHLIST = [
    "RELIANCE.NS", "TCS.NS", "HDFCBANK.NS", "INFY.NS",
    "ITC.NS", "WIPRO.NS", "SBIN.NS", "BAJFINANCE.NS",
    "MARUTI.NS", "TATAMOTORS.NS",
]

@router.get("/signals/watchlist")
async def get_watchlist_signals(
    tickers: Optional[str] = None,
    limit: int = 8,
):
    """
    Compute real-time TA signals for a list of tickers.
    Returns sorted by signal strength (strongest first).
    """
    ticker_list = tickers.split(",") if tickers else NSE_WATCHLIST[:limit]

    async def fetch_and_analyze(ticker: str):
        try:
            df = await market_data_service.get_historical_data(ticker.strip(), period="3mo")
            if df is None or len(df) < 50:
                return None
            result = await signal_engine.analyze_ticker(ticker.strip(), df)
            return result
        except Exception as e:
            return {"ticker": ticker, "error": str(e)}

    tasks = [fetch_and_analyze(t) for t in ticker_list]
    results = await asyncio.gather(*tasks)
    valid = [r for r in results if r and "error" not in r]

    # Sort: BUY/SELL (high confidence) first, HOLD last
    def sort_key(r):
        dir_order = {"BUY": 0, "SELL": 1, "HOLD": 2}
        return (dir_order.get(r.get("direction", "HOLD"), 2), -r.get("confidence", 0))

    valid.sort(key=sort_key)
    return {"signals": valid, "count": len(valid)}


@router.get("/signals/{ticker}")
async def get_ticker_signal(ticker: str):
    """Compute live TA signal for a single ticker."""
    try:
        df = await market_data_service.get_historical_data(ticker, period="3mo")
        result = await signal_engine.analyze_ticker(ticker, df)
        return result
    except Exception as e:
        return {"ticker": ticker, "error": str(e), "direction": "HOLD"}


@router.get("/market/indices")
async def get_market_indices():
    """Get live data for major NSE indices."""
    indices = {
        "NIFTY50":    "^NSEI",
        "BANKNIFTY":  "^NSEBANK",
        "SENSEX":     "^BSESN",
        "NIFTYIT":    "^CNXIT",
        "USDINR":     "INR=X",
    }

    async def fetch_index(name: str, symbol: str):
        try:
            quote = await market_data_service.get_realtime_quote(symbol)
            return {
                "name":       name,
                "price":      quote.get("price", 0),
                "change":     quote.get("change", 0),
                "change_pct": quote.get("change_pct", 0),
            }
        except Exception:
            return {"name": name, "price": 0, "change": 0, "change_pct": 0}

    tasks = [fetch_index(n, s) for n, s in indices.items()]
    results = await asyncio.gather(*tasks)
    return {"indices": results}
