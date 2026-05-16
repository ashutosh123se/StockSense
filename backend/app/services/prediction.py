"""
Production Prediction Service
─────────────────────────────
Strategy:
  1. Try ML Ensemble (LSTM + GRU + CNN-LSTM) for price regression.
  2. Blend ensemble output with Signal Engine TA score for direction.
  3. If models not loaded / inference fails, fall back to pure TA.
"""
import torch
import numpy as np
import os
import joblib
from typing import Dict, Any
from datetime import datetime

from app.services.market_data import market_data_service
from app.ml.features.pipeline import build_feature_pipeline
from app.ml.models.lstm import StockLSTM
from app.ml.models.gru import StockGRU
from app.ml.models.cnn_lstm import StockCNNLSTM
from app.services.signal_engine import signal_engine


class PredictionService:
    SEQ_LEN = 60

    def __init__(self):
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self.model_dir = os.path.join(os.getcwd(), "..", "ml-training", "models")
        self.models_loaded = False

        # Lazy init — only load if files exist
        self._lstm = None
        self._gru  = None
        self._cnn  = None
        self.scaler = None
        self._load_models()

    # ─────────────────────────────────────────────────────────────────
    def _load_models(self):
        paths = {
            "lstm":    ("lstm.pt",     StockLSTM,    dict(input_size=8, num_classes=1)),
            "gru":     ("gru.pt",      StockGRU,     dict(input_size=8, num_classes=1)),
            "cnn_lstm":("cnn-lstm.pt", StockCNNLSTM, dict(input_size=8, num_classes=1)),
        }
        attr_map = {"lstm": "_lstm", "gru": "_gru", "cnn_lstm": "_cnn"}
        all_loaded = True

        for name, (filename, cls, kwargs) in paths.items():
            path = os.path.join(self.model_dir, filename)
            if os.path.exists(path):
                model = cls(**kwargs).to(self.device)
                try:
                    model.load_state_dict(torch.load(path, map_location=self.device))
                    model.eval()
                    setattr(self, attr_map[name], model)
                    print(f"[PredictionService] Loaded {name} from {path}")
                except Exception as e:
                    print(f"[PredictionService] WARNING: Could not load {name}: {e}")
                    all_loaded = False
            else:
                print(f"[PredictionService] WARNING: {path} not found")
                all_loaded = False

        scaler_path = os.path.join(self.model_dir, "scaler.pkl")
        if os.path.exists(scaler_path):
            self.scaler = joblib.load(scaler_path)
            print(f"[PredictionService] Loaded scaler from {scaler_path}")
        else:
            all_loaded = False

        self.models_loaded = all_loaded

    # ─────────────────────────────────────────────────────────────────
    def _ml_inference(self, features_df) -> float | None:
        """Run ensemble inference. Returns scaled prediction or None on failure."""
        if not self.models_loaded:
            return None
        try:
            scaled = self.scaler.transform(features_df.values)
            if len(scaled) < self.SEQ_LEN:
                return None
            seq = torch.FloatTensor(scaled[-self.SEQ_LEN:]).unsqueeze(0).to(self.device)

            preds = []
            for model in [self._lstm, self._gru, self._cnn]:
                with torch.no_grad():
                    out = model(seq)
                    val = out[0].item() if isinstance(out, tuple) else out.item()
                    preds.append(val)

            # Ensemble average (weighted: CNN-LSTM has highest accuracy → slightly higher weight)
            weights = [0.30, 0.30, 0.40]
            avg = sum(w * p for w, p in zip(weights, preds))

            # Inverse-scale: Close is feature index 0
            dummy = np.zeros((1, 8))
            dummy[0, 0] = avg
            target_price = float(self.scaler.inverse_transform(dummy)[0, 0])
            return target_price
        except Exception as e:
            print(f"[PredictionService] ML inference error: {e}")
            return None

    # ─────────────────────────────────────────────────────────────────
    async def get_prediction(self, ticker: str) -> Dict[str, Any]:
        try:
            df = await market_data_service.get_historical_data(ticker, period="1y")
            if df is None or len(df) < 60:
                raise ValueError("Insufficient historical data")

            df_lower = df.copy()
            df_lower.columns = [c.lower() for c in df_lower.columns]
            current_price = float(df_lower["close"].iloc[-1])

            # ── 1. Technical Analysis signal (always available) ──
            ta_result = await signal_engine.analyze_ticker(ticker, df)

            # ── 2. ML Ensemble price regression ──
            features_df = build_feature_pipeline(df)
            ml_target = self._ml_inference(features_df)

            if ml_target is not None and ml_target > 0:
                # Blend ML target with TA signal
                ml_change_pct = (ml_target - current_price) / current_price * 100

                # Use ML for price target, TA for direction confidence
                ta_score = ta_result["composite_score"]   # -1 to +1

                # Weighted blend: 60% ML direction, 40% TA score
                ml_score_raw = np.clip(ml_change_pct / 5, -1, 1)  # ±5% → ±1
                blended_score = 0.60 * float(ml_score_raw) + 0.40 * ta_score

                if blended_score > 0.12:
                    direction = "BUY"
                elif blended_score < -0.12:
                    direction = "SELL"
                else:
                    direction = "HOLD"

                abs_score = abs(blended_score)
                confidence = round(min(0.95, 0.55 + abs_score * 0.45), 4)

                target_price = round(ml_target, 2)
                atr = ta_result["indicators"].get("atr", current_price * 0.015)
                stop_loss = round(
                    current_price - 1.5 * atr if direction in ("BUY","HOLD")
                    else current_price + 1.5 * atr, 2
                )
                price_change_pct = round(ml_change_pct, 2)
                data_source = "ml_ensemble+ta"
            else:
                # Pure TA fallback
                direction     = ta_result["direction"]
                confidence    = ta_result["confidence"]
                target_price  = ta_result["target_price"]
                stop_loss     = ta_result["stop_loss"]
                blended_score = ta_result["composite_score"]
                price_change_pct = ta_result["price_change_pct"]
                data_source   = "technical_analysis"

            # Build probabilities
            if direction == "BUY":
                probs = {
                    "BUY":  round(confidence, 3),
                    "HOLD": round((1 - confidence) * 0.55, 3),
                    "SELL": round((1 - confidence) * 0.45, 3),
                }
            elif direction == "SELL":
                probs = {
                    "BUY":  round((1 - confidence) * 0.35, 3),
                    "HOLD": round((1 - confidence) * 0.65, 3),
                    "SELL": round(confidence, 3),
                }
            else:
                probs = {"BUY": 0.28, "HOLD": 0.47, "SELL": 0.25}

            risk_reward = round(
                abs(target_price - current_price) / abs(stop_loss - current_price)
                if abs(stop_loss - current_price) > 0 else 1.0, 2
            )

            return {
                "ticker":           ticker,
                "prediction":       direction,
                "confidence":       confidence,
                "composite_score":  round(float(blended_score), 4),
                "probabilities":    probs,
                "current_price":    round(current_price, 2),
                "target_price":     target_price,
                "stop_loss":        stop_loss,
                "risk_reward":      risk_reward,
                "price_change_pct": price_change_pct,
                "indicators":       ta_result.get("indicators", {}),
                "indicator_scores": ta_result.get("indicator_scores", {}),
                "data_source":      data_source,
                "models_loaded":    self.models_loaded,
                "timestamp":        datetime.utcnow().isoformat(),
                "is_mock":          False,
            }

        except Exception as e:
            print(f"[PredictionService] Error for {ticker}: {e}")
            return {
                "ticker":    ticker,
                "error":     str(e),
                "is_mock":   True,
                "prediction": "HOLD",
                "confidence": 0.5,
                "probabilities": {"BUY": 0.33, "HOLD": 0.34, "SELL": 0.33},
            }


prediction_service = PredictionService()
