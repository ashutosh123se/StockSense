"""
ta.py — Pure pandas/numpy drop-in replacement for pandas_ta.
Implements only the functions used in this project:
  rsi(), macd(), bbands(), ema(), atr()

All functions match the pandas_ta call signature and return type
so the rest of the codebase needs zero changes.
"""
import pandas as pd
import numpy as np


def ema(series: pd.Series, length: int = 20, **kwargs) -> pd.Series:
    """Exponential Moving Average."""
    return series.ewm(span=length, adjust=False).mean()


def rsi(series: pd.Series, length: int = 14, **kwargs) -> pd.Series:
    """Relative Strength Index."""
    delta = series.diff()
    gain = delta.clip(lower=0)
    loss = -delta.clip(upper=0)
    avg_gain = gain.ewm(com=length - 1, adjust=False).mean()
    avg_loss = loss.ewm(com=length - 1, adjust=False).mean()
    rs = avg_gain / avg_loss.replace(0, np.nan)
    return 100 - (100 / (1 + rs))


def macd(
    series: pd.Series,
    fast: int = 12,
    slow: int = 26,
    signal: int = 9,
    **kwargs,
) -> pd.DataFrame:
    """
    MACD indicator.
    Returns DataFrame with columns matching pandas_ta naming:
      MACD_{fast}_{slow}_{signal}   → MACD line
      MACDh_{fast}_{slow}_{signal}  → Histogram
      MACDs_{fast}_{slow}_{signal}  → Signal line
    """
    ema_fast = series.ewm(span=fast, adjust=False).mean()
    ema_slow = series.ewm(span=slow, adjust=False).mean()
    macd_line = ema_fast - ema_slow
    signal_line = macd_line.ewm(span=signal, adjust=False).mean()
    histogram = macd_line - signal_line

    col_macd = f"MACD_{fast}_{slow}_{signal}"
    col_hist = f"MACDh_{fast}_{slow}_{signal}"
    col_sig  = f"MACDs_{fast}_{slow}_{signal}"

    return pd.DataFrame(
        {col_macd: macd_line, col_hist: histogram, col_sig: signal_line},
        index=series.index,
    )


def bbands(
    series: pd.Series,
    length: int = 20,
    std: float = 2.0,
    **kwargs,
) -> pd.DataFrame:
    """
    Bollinger Bands.
    Returns DataFrame with columns matching pandas_ta naming:
      BBL_{length}_{std}  → Lower band
      BBM_{length}_{std}  → Middle band (SMA)
      BBU_{length}_{std}  → Upper band
      BBB_{length}_{std}  → Bandwidth
      BBP_{length}_{std}  → Percent B
    """
    sma = series.rolling(window=length).mean()
    rolling_std = series.rolling(window=length).std()
    upper = sma + std * rolling_std
    lower = sma - std * rolling_std
    bandwidth = (upper - lower) / sma.replace(0, np.nan)
    pct_b = (series - lower) / (upper - lower).replace(0, np.nan)

    std_str = str(int(std)) if std == int(std) else str(std)
    return pd.DataFrame(
        {
            f"BBL_{length}_{std_str}": lower,
            f"BBM_{length}_{std_str}": sma,
            f"BBU_{length}_{std_str}": upper,
            f"BBB_{length}_{std_str}": bandwidth,
            f"BBP_{length}_{std_str}": pct_b,
        },
        index=series.index,
    )


def atr(
    high: pd.Series,
    low: pd.Series,
    close: pd.Series,
    length: int = 14,
    **kwargs,
) -> pd.Series:
    """Average True Range."""
    prev_close = close.shift(1)
    tr = pd.concat(
        [
            high - low,
            (high - prev_close).abs(),
            (low - prev_close).abs(),
        ],
        axis=1,
    ).max(axis=1)
    return tr.ewm(com=length - 1, adjust=False).mean()
