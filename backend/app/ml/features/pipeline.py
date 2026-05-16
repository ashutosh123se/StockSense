import pandas as pd
import numpy as np
import app.ta as ta

def build_feature_pipeline(df: pd.DataFrame) -> pd.DataFrame:
    """
    Simplified feature pipeline matching the 8 features used during training.
    """
    df = df.copy()
    
    # Ensure columns are lowercase for consistency
    df.columns = [c.lower() for c in df.columns]
    
    # RSI
    df['rsi'] = ta.rsi(df['close'], length=14)
    
    # MACD
    macd = ta.macd(df['close'])
    df['macd'] = macd['MACD_12_26_9']
    df['macd_signal'] = macd['MACDs_12_26_9']
    
    # Bollinger Bands
    bbands = ta.bbands(df['close'], length=20)
    df['bb_upper'] = bbands.filter(like='BBU').iloc[:, 0]
    df['bb_lower'] = bbands.filter(like='BBL').iloc[:, 0]
    
    # EMA
    df['ema_20'] = ta.ema(df['close'], length=20)
    df['ema_50'] = ta.ema(df['close'], length=50)
    
    # Ensure all required columns are present and in order
    features = ['close', 'rsi', 'macd', 'macd_signal', 'bb_upper', 'bb_lower', 'ema_20', 'ema_50']
    
    # Fill any NaNs
    df = df.fillna(method='ffill').fillna(0)
    
    return df[features]
