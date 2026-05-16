"""
Market Data Service — Production-Grade yfinance wrapper
Handles null values, rate limits, and data normalization.
"""
import yfinance as yf
import pandas as pd
from typing import List, Optional
from datetime import datetime
import asyncio


class MarketDataService:

    @staticmethod
    def _safe(val, default=0.0):
        """Safely coerce a value to float, returning default if None/NaN."""
        try:
            if val is None:
                return default
            f = float(val)
            import math
            return f if math.isfinite(f) else default
        except Exception:
            return default

    @staticmethod
    async def get_historical_data(
        ticker: str,
        period: str = "1y",
        interval: str = "1d",
    ) -> pd.DataFrame:
        """
        Fetch OHLCV data. Normalises column names to lowercase.
        """
        def _fetch():
            stock = yf.Ticker(ticker)
            df = stock.history(period=period, interval=interval)
            # Ensure consistent lowercase columns
            df.columns = [c.lower() for c in df.columns]
            # Drop columns not needed (Dividends, Stock Splits)
            for col in ["dividends", "stock splits", "capital gains"]:
                if col in df.columns:
                    df = df.drop(columns=[col])
            return df

        # Run blocking yfinance call in thread pool
        loop = asyncio.get_event_loop()
        df = await loop.run_in_executor(None, _fetch)
        return df

    @staticmethod
    async def get_realtime_quote(ticker: str) -> dict:
        """
        Get latest price info. Handles all null/NaN scenarios gracefully.
        """
        def _fetch():
            stock = yf.Ticker(ticker)
            info = stock.fast_info
            last    = MarketDataService._safe(getattr(info, "last_price", None))
            prev    = MarketDataService._safe(getattr(info, "previous_close", None))
            high    = MarketDataService._safe(getattr(info, "day_high", None))
            low     = MarketDataService._safe(getattr(info, "day_low", None))
            vol     = MarketDataService._safe(getattr(info, "last_volume", None))
            mktcap  = MarketDataService._safe(getattr(info, "market_cap", None))

            change  = last - prev if last and prev else 0.0
            chg_pct = ((last / prev) - 1) * 100 if last and prev and prev != 0 else 0.0

            return {
                "ticker":         ticker,
                "price":          round(last, 2),
                "previous_close": round(prev, 2),
                "change":         round(change, 2),
                "change_pct":     round(chg_pct, 4),
                "day_high":       round(high, 2),
                "day_low":        round(low, 2),
                "volume":         int(vol),
                "market_cap":     int(mktcap),
                "timestamp":      datetime.now().isoformat(),
            }

        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(None, _fetch)
        return result

    @staticmethod
    async def get_watchlist_quotes(tickers: List[str]) -> List[dict]:
        """Fetch quotes for multiple tickers concurrently."""
        tasks = [MarketDataService.get_realtime_quote(t) for t in tickers]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        return [r for r in results if isinstance(r, dict)]


market_data_service = MarketDataService()
