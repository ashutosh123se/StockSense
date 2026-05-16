"""
StockSense ML — FastAPI Application Entry Point
"""
import os
import asyncio
import logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("stocksense")

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.ws_manager import ws_manager
from app.services.market_data import market_data_service
from app.db.session import engine
from app.db.models import Base

# ─── Create DB tables on startup (non-fatal if DB unavailable) ───────────────
try:
    Base.metadata.create_all(bind=engine)
    logger.info("DB tables created / verified")
except Exception as e:
    logger.warning(f"DB unavailable at startup (some features disabled): {e}")

# ─── Import routers ───────────────────────────────────────────────────────────
from app.api.v1 import auth, signals, portfolio
from app.services.prediction import prediction_service

# ─── Production route prefix (Firebase App Hosting / IDX) ───────────────────
# When deployed, the backend is proxied at /_/backend.
# ROOT_PATH tells FastAPI its mount point so OpenAPI docs & redirects work.
ROOT_PATH = os.environ.get("ROOT_PATH", "")

# ─── App ─────────────────────────────────────────────────────────────────────
app = FastAPI(
    title=settings.PROJECT_NAME,
    version="1.0.0",
    description="StockSense ML — Production-grade stock prediction platform for NSE/BSE",
    root_path=ROOT_PATH,          # e.g. "/_/backend" in production
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Register routers ────────────────────────────────────────────────────────
app.include_router(auth.router,      prefix="/api/v1",  tags=["auth"])
app.include_router(signals.router,   prefix="/api/v1",  tags=["signals"])
app.include_router(portfolio.router, prefix="/api/v1",  tags=["portfolio"])


# ─── Health & Version ────────────────────────────────────────────────────────
@app.get("/health", tags=["system"])
async def health_check():
    return {
        "status": "ok",
        "service": "stocksense-ml",
        "version": "1.0.0",
        "models_loaded": prediction_service.models_loaded,
    }


# ─── Market Data Routes ───────────────────────────────────────────────────────
@app.get("/api/v1/market/quote/{ticker}", tags=["market"])
async def get_quote(ticker: str):
    return await market_data_service.get_realtime_quote(ticker)


@app.get("/api/v1/market/history/{ticker}", tags=["market"])
async def get_history(ticker: str, period: str = "1y", interval: str = "1d"):
    df = await market_data_service.get_historical_data(ticker, period, interval)
    return df.reset_index().to_dict(orient="records")


# ─── Prediction Routes ────────────────────────────────────────────────────────
@app.get("/api/v1/prediction/{ticker}", tags=["prediction"])
async def get_prediction(ticker: str):
    return await prediction_service.get_prediction(ticker)


# ─── Model Status Route ───────────────────────────────────────────────────────
@app.get("/api/v1/models/status", tags=["models"])
async def get_models_status():
    model_dir = os.path.join(os.getcwd(), "..", "ml-training", "models")
    model_files = {
        "lstm":     ("lstm.pt",     "LSTM"),
        "gru":      ("gru.pt",      "GRU"),
        "cnn_lstm": ("cnn-lstm.pt", "CNN-LSTM"),
    }
    models = {}
    for key, (filename, label) in model_files.items():
        path = os.path.join(model_dir, filename)
        if os.path.exists(path):
            size_mb = os.path.getsize(path) / (1024 * 1024)
            models[key] = {
                "label":    label,
                "trained":  True,
                "file":     filename,
                "size_mb":  round(size_mb, 2),
            }
        else:
            models[key] = {"label": label, "trained": False, "file": filename}

    scaler_path = os.path.join(model_dir, "scaler.pkl")
    models["scaler"] = {"trained": os.path.exists(scaler_path)}

    return {
        "models":        models,
        "ensemble_ready": prediction_service.models_loaded,
        "device":        str(prediction_service.device),
        "model_dir":     model_dir,
    }


# ─── WebSocket — Real-time price streaming ────────────────────────────────────
@app.websocket("/ws/market/{ticker}")
async def websocket_endpoint(websocket: WebSocket, ticker: str):
    await ws_manager.connect(websocket, ticker)
    consecutive_errors = 0
    try:
        while True:
            try:
                quote = await market_data_service.get_realtime_quote(ticker)
                await websocket.send_json(quote)
                consecutive_errors = 0
            except Exception as e:
                consecutive_errors += 1
                if consecutive_errors > 5:
                    break
                await websocket.send_json({"error": str(e), "ticker": ticker})
            await asyncio.sleep(10)  # 10-second interval to respect rate limits
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket, ticker)
    except Exception:
        ws_manager.disconnect(websocket, ticker)
