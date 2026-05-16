import yfinance as yf
import pandas as pd
import pandas_ta as ta
import numpy as np
from typing import Tuple, List
import os

class DataProvider:
    def __init__(self, cache_dir: str = "data_cache"):
        self.cache_dir = cache_dir
        os.makedirs(cache_dir, exist_ok=True)

    def fetch_historical_data(self, ticker: str, period: str = "5y", interval: str = "1d") -> pd.DataFrame:
        """Fetch and cache historical data from yfinance"""
        cache_path = os.path.join(self.cache_dir, f"{ticker}_{period}_{interval}.csv")
        
        if os.path.exists(cache_path):
            print(f"Loading cached data for {ticker}")
            df = pd.read_csv(cache_path, index_col=0, parse_dates=True)
            return df
        
        print(f"Fetching fresh data for {ticker} from yfinance...")
        stock = yf.Ticker(ticker)
        df = stock.history(period=period, interval=interval)
        
        if df.empty:
            raise ValueError(f"No data found for ticker {ticker}")
            
        df.to_csv(cache_path)
        return df

    def add_technical_indicators(self, df: pd.DataFrame) -> pd.DataFrame:
        """Add RSI, MACD, and Bollinger Bands for training features"""
        df = df.copy()
        
        # RSI
        df['RSI'] = ta.rsi(df['Close'], length=14)
        
        # MACD
        macd = ta.macd(df['Close'])
        df['MACD'] = macd['MACD_12_26_9']
        df['MACD_Signal'] = macd['MACDs_12_26_9']
        
        # Bollinger Bands
        bbands = ta.bbands(df['Close'], length=20)
        # Dynamically find columns as names can vary by pandas_ta version
        df['BB_Upper'] = bbands.filter(like='BBU').iloc[:, 0]
        df['BB_Lower'] = bbands.filter(like='BBL').iloc[:, 0]
        
        # EMA
        df['EMA_20'] = ta.ema(df['Close'], length=20)
        df['EMA_50'] = ta.ema(df['Close'], length=50)
        
        # Returns
        df['Returns'] = df['Close'].pct_change()
        
        return df.dropna()

    def prepare_sequences(self, data: np.ndarray, window_size: int = 60) -> Tuple[np.ndarray, np.ndarray]:
        """Create windowed sequences for LSTM/GRU training"""
        X, y = [], []
        for i in range(window_size, len(data)):
            X.append(data[i-window_size:i])
            y.append(data[i, 0]) # Target is the 'Close' price (assumed at index 0)
            
        return np.array(X), np.array(y)

if __name__ == "__main__":
    # Test for a major Indian stock
    provider = DataProvider()
    data = provider.fetch_historical_data("RELIANCE.NS")
    data_with_features = provider.add_technical_indicators(data)
    print(f"Prepared data shape: {data_with_features.shape}")
    print(data_with_features.tail())
