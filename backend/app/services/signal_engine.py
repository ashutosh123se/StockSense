"""
Signal Engine — Production-Grade Technical Analysis
Computes real BUY/SELL/HOLD signals from multiple indicators using a
weighted scoring system. This is the backbone of both the ML fallback
and the live signals feed for the Dashboard.
"""
import numpy as np
import pandas as pd
import app.ta as ta
from typing import Dict, Any, List


class SignalEngine:
    """
    Weighted technical analysis signal engine.

    Scoring methodology:
      - Each indicator returns a score in [-1.0, +1.0]
      - +1.0 = strong buy, -1.0 = strong sell, 0 = neutral
      - Final composite score → direction + confidence
    """

    INDICATOR_WEIGHTS = {
        "ema_cross":   0.25,   # EMA 20/50 crossover (trend direction)
        "macd":        0.25,   # MACD histogram momentum
        "rsi":         0.20,   # RSI overbought/oversold
        "bb_position": 0.18,   # Bollinger Band position
        "momentum":    0.12,   # 10-day price momentum
    }

    @staticmethod
    def _safe_float(val, default=0.0) -> float:
        try:
            v = float(val)
            return v if np.isfinite(v) else default
        except Exception:
            return default

    def compute_indicators(self, df: pd.DataFrame) -> Dict[str, Any]:
        """Compute all TA indicators and return a full indicator snapshot."""
        df = df.copy()
        df.columns = [c.lower() for c in df.columns]

        close = df["close"]
        n = len(close)

        result: Dict[str, Any] = {}

        # ─── RSI ───────────────────────────────────────────────────────
        rsi_series = ta.rsi(close, length=14)
        rsi = self._safe_float(rsi_series.iloc[-1], 50.0)
        result["rsi"] = round(rsi, 2)

        # ─── MACD ──────────────────────────────────────────────────────
        macd_df = ta.macd(close)
        if macd_df is not None and not macd_df.empty:
            macd_val = self._safe_float(macd_df.iloc[-1, 0])   # MACD line
            macd_sig = self._safe_float(macd_df.iloc[-1, 2])   # Signal line
            macd_hist = self._safe_float(macd_df.iloc[-1, 1])  # Histogram
        else:
            macd_val = macd_sig = macd_hist = 0.0

        result["macd"] = round(macd_val, 4)
        result["macd_signal"] = round(macd_sig, 4)
        result["macd_hist"] = round(macd_hist, 4)

        # ─── Bollinger Bands ──────────────────────────────────────────
        bb_df = ta.bbands(close, length=20)
        if bb_df is not None and not bb_df.empty:
            bb_upper = self._safe_float(bb_df.filter(like="BBU").iloc[-1, 0])
            bb_lower = self._safe_float(bb_df.filter(like="BBL").iloc[-1, 0])
            bb_mid   = self._safe_float(bb_df.filter(like="BBM").iloc[-1, 0])
        else:
            current_price = self._safe_float(close.iloc[-1])
            bb_upper = current_price * 1.02
            bb_lower = current_price * 0.98
            bb_mid   = current_price

        result["bb_upper"] = round(bb_upper, 2)
        result["bb_lower"] = round(bb_lower, 2)
        result["bb_mid"]   = round(bb_mid, 2)

        # ─── EMA 20 / 50 ──────────────────────────────────────────────
        ema20 = ta.ema(close, length=20)
        ema50 = ta.ema(close, length=50)
        result["ema_20"] = round(self._safe_float(ema20.iloc[-1]), 2)
        result["ema_50"] = round(self._safe_float(ema50.iloc[-1]), 2)

        # ─── ATR (volatility) ─────────────────────────────────────────
        if all(c in df.columns for c in ["high", "low"]):
            atr = ta.atr(df["high"], df["low"], close, length=14)
            result["atr"] = round(self._safe_float(atr.iloc[-1]), 4)
        else:
            result["atr"] = 0.0

        # ─── Volume ratio ─────────────────────────────────────────────
        if "volume" in df.columns and n >= 20:
            vol_mean = df["volume"].iloc[-20:].mean()
            vol_last = df["volume"].iloc[-1]
            result["volume_ratio"] = round(
                self._safe_float(vol_last / vol_mean if vol_mean > 0 else 1.0), 2
            )
        else:
            result["volume_ratio"] = 1.0

        return result

    def score(self, df: pd.DataFrame) -> Dict[str, Any]:
        """
        Core scoring logic. Returns indicator values + composite score + signal.
        """
        close = df["close"] if "close" in df.columns else df.iloc[:, 0]
        current_price = self._safe_float(close.iloc[-1])

        indicators = self.compute_indicators(df)

        scores: Dict[str, float] = {}

        # 1. EMA Cross Score
        ema20 = indicators["ema_20"]
        ema50 = indicators["ema_50"]
        if ema50 > 0:
            ema_spread = (ema20 - ema50) / ema50  # positive = bullish
            scores["ema_cross"] = float(np.clip(ema_spread * 50, -1.0, 1.0))
        else:
            scores["ema_cross"] = 0.0

        # 2. MACD Score
        macd_hist = indicators["macd_hist"]
        macd_ref  = abs(indicators["macd"]) if abs(indicators["macd"]) > 0.001 else 0.01
        scores["macd"] = float(np.clip(macd_hist / macd_ref, -1.0, 1.0))

        # 3. RSI Score
        rsi = indicators["rsi"]
        if rsi <= 30:
            scores["rsi"] = (30 - rsi) / 30  # oversold → positive
        elif rsi >= 70:
            scores["rsi"] = (70 - rsi) / 30  # overbought → negative
        else:
            # Neutral zone: slight lean based on which side of 50 we're on
            scores["rsi"] = (rsi - 50) / (-40)  # 50 → 0, 30 → 0.5, 70 → -0.5
        scores["rsi"] = float(np.clip(scores["rsi"], -1.0, 1.0))

        # 4. Bollinger Band Position Score
        bb_upper = indicators["bb_upper"]
        bb_lower = indicators["bb_lower"]
        bb_range = bb_upper - bb_lower
        if bb_range > 0:
            bb_pos = (current_price - bb_lower) / bb_range  # 0=lower, 1=upper
            # Mean reversion: close to lower = buy signal, close to upper = sell signal
            scores["bb_position"] = float(np.clip(1.0 - 2 * bb_pos, -1.0, 1.0))
        else:
            scores["bb_position"] = 0.0

        # 5. Momentum Score (10-day return)
        if len(close) >= 10:
            price_10d_ago = self._safe_float(close.iloc[-10])
            if price_10d_ago > 0:
                momentum = (current_price - price_10d_ago) / price_10d_ago
                scores["momentum"] = float(np.clip(momentum * 20, -1.0, 1.0))
            else:
                scores["momentum"] = 0.0
        else:
            scores["momentum"] = 0.0

        # ─── Composite Score ──────────────────────────────────────────
        composite = sum(
            scores[k] * self.INDICATOR_WEIGHTS[k]
            for k in self.INDICATOR_WEIGHTS
        )

        # ─── Direction & Confidence ───────────────────────────────────
        if composite > 0.12:
            direction = "BUY"
        elif composite < -0.12:
            direction = "SELL"
        else:
            direction = "HOLD"

        # Map |composite| → confidence: 0.12→0.55, 0.50→0.90, 1.0→0.95
        abs_score = abs(composite)
        if abs_score < 0.12:
            confidence = 0.50 + (abs_score / 0.12) * 0.08   # 0.50–0.58
        elif abs_score < 0.50:
            confidence = 0.58 + ((abs_score - 0.12) / 0.38) * 0.30  # 0.58–0.88
        else:
            confidence = 0.88 + min((abs_score - 0.50) / 0.50, 1.0) * 0.07  # 0.88–0.95
        confidence = round(min(0.95, confidence), 4)

        # Probabilities
        if direction == "BUY":
            probs = {
                "BUY":  round(confidence, 3),
                "HOLD": round((1 - confidence) * 0.55, 3),
                "SELL": round((1 - confidence) * 0.45, 3),
            }
        elif direction == "SELL":
            probs = {
                "BUY":  round((1 - confidence) * 0.40, 3),
                "HOLD": round((1 - confidence) * 0.60, 3),
                "SELL": round(confidence, 3),
            }
        else:
            probs = {
                "BUY":  round(0.30 + composite * 0.20, 3),
                "HOLD": round(0.45 - abs(composite) * 0.10, 3),
                "SELL": round(0.25 - composite * 0.20, 3),
            }

        return {
            "direction": direction,
            "confidence": confidence,
            "composite_score": round(composite, 4),
            "indicator_scores": {k: round(v, 4) for k, v in scores.items()},
            "indicators": indicators,
            "probabilities": probs,
            "current_price": round(current_price, 2),
        }

    def compute_signal_targets(self, result: Dict, atr: float) -> Dict:
        """Compute risk-adjusted target and stop loss using ATR."""
        price = result["current_price"]
        direction = result["direction"]
        confidence = result["confidence"]

        # ATR-based risk: 1.5 ATR for SL, 3.0 ATR for TP
        sl_atr_mult = 1.5
        tp_atr_mult = 3.0

        if atr > 0:
            stop_delta = atr * sl_atr_mult
            target_delta = atr * tp_atr_mult
        else:
            stop_delta = price * 0.02
            target_delta = price * 0.04

        if direction == "BUY":
            stop_loss   = round(price - stop_delta, 2)
            target_price = round(price + target_delta, 2)
        elif direction == "SELL":
            stop_loss   = round(price + stop_delta, 2)
            target_price = round(price - target_delta, 2)
        else:
            stop_loss   = round(price - stop_delta, 2)
            target_price = round(price + target_delta * 0.5, 2)

        risk_reward = round(target_delta / stop_delta, 2) if stop_delta > 0 else 1.0
        price_change_pct = round((target_price - price) / price * 100, 2)

        return {
            "target_price":      target_price,
            "stop_loss":         stop_loss,
            "risk_reward":       risk_reward,
            "price_change_pct":  price_change_pct,
        }

    async def analyze_ticker(self, ticker: str, df: pd.DataFrame) -> Dict[str, Any]:
        """Full analysis pipeline for a single ticker."""
        if df is None or len(df) < 50:
            return {"error": "Insufficient data", "ticker": ticker}

        df = df.copy()
        df.columns = [c.lower() for c in df.columns]

        result = self.score(df)
        atr = result["indicators"].get("atr", 0.0)
        targets = self.compute_signal_targets(result, atr)

        return {
            "ticker":           ticker,
            "direction":        result["direction"],      # BUY / SELL / HOLD
            "confidence":       result["confidence"],
            "composite_score":  result["composite_score"],
            "probabilities":    result["probabilities"],
            "indicators":       result["indicators"],
            "indicator_scores": result["indicator_scores"],
            "current_price":    result["current_price"],
            "target_price":     targets["target_price"],
            "stop_loss":        targets["stop_loss"],
            "risk_reward":      targets["risk_reward"],
            "price_change_pct": targets["price_change_pct"],
            "data_source":      "technical_analysis",
        }

    async def analyze_watchlist(self, tickers_df: Dict[str, pd.DataFrame]) -> List[Dict]:
        """Analyze multiple tickers. Returns sorted list by |composite_score| desc."""
        results = []
        for ticker, df in tickers_df.items():
            try:
                analysis = await self.analyze_ticker(ticker, df)
                results.append(analysis)
            except Exception as e:
                results.append({"ticker": ticker, "error": str(e)})

        # Sort by absolute composite score (strongest signals first)
        results.sort(
            key=lambda x: abs(x.get("composite_score", 0)),
            reverse=True
        )
        return results


signal_engine = SignalEngine()
