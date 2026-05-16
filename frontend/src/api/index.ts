/**
 * Centralised API client
 * ─────────────────────
 * In development:   VITE_API_BASE_URL is unset → uses http://localhost:8000
 * In production:    VITE_API_BASE_URL=/_/backend  (set via .env.production)
 * WebSocket:        derived from the same base (ws:// or wss://)
 */
import axios from 'axios';

const _httpBase = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000';
export const API_BASE = `${_httpBase}/api/v1`;

// WebSocket base — auto-converts http→ws, https→wss
export const WS_BASE = _httpBase
  .replace(/^https?:\/\//, (m) => (m === 'https://' ? 'wss://' : 'ws://'))
  .replace(/\/$/, '');

const client = axios.create({ baseURL: API_BASE, timeout: 30_000 });

// ─── Market ──────────────────────────────────────────────────────────────────
export const marketApi = {
  getQuote: (ticker: string) =>
    client.get(`/market/quote/${ticker}`).then(r => r.data),

  getHistory: (ticker: string, period = '1y', interval = '1d') =>
    client.get(`/market/history/${ticker}`, { params: { period, interval } }).then(r => r.data),
};

// ─── Signals ─────────────────────────────────────────────────────────────────
export const signalsApi = {
  getWatchlist: (tickers?: string[], limit = 8) =>
    client.get('/signals/watchlist', {
      params: { tickers: tickers?.join(','), limit },
    }).then(r => r.data as { signals: SignalResult[]; count: number }),

  getTicker: (ticker: string) =>
    client.get(`/signals/${ticker}`).then(r => r.data as SignalResult),

  getIndices: () =>
    client.get('/market/indices').then(r => r.data as { indices: IndexQuote[] }),
};

// ─── Prediction ───────────────────────────────────────────────────────────────
export const predictionApi = {
  get: (ticker: string) =>
    client.get(`/prediction/${ticker}`).then(r => r.data as PredictionResult),
};

// ─── Portfolio ────────────────────────────────────────────────────────────────
export const portfolioApi = {
  getAll: (sessionId = 'default') =>
    client.get(`/portfolio/${sessionId}`).then(r => r.data as PortfolioPosition[]),

  add: (pos: { ticker: string; name?: string; qty: number; avg_price: number; session_id?: string }) =>
    client.post('/portfolio', pos).then(r => r.data as PortfolioPosition),

  update: (id: string, update: { qty?: number; avg_price?: number }, sessionId = 'default') =>
    client.put(`/portfolio/${id}`, update, { params: { session_id: sessionId } }).then(r => r.data),

  remove: (id: string) =>
    client.delete(`/portfolio/${id}`),

  reset: (sessionId = 'default') =>
    client.post(`/portfolio/reset/${sessionId}`),
};

// ─── Models ───────────────────────────────────────────────────────────────────
export const modelsApi = {
  getStatus: () =>
    client.get('/models/status').then(r => r.data as ModelStatus),
};

// ─── Types ────────────────────────────────────────────────────────────────────
export type SignalResult = {
  ticker:           string;
  direction:        'BUY' | 'SELL' | 'HOLD';
  confidence:       number;
  composite_score:  number;
  current_price:    number;
  target_price:     number;
  stop_loss:        number;
  risk_reward:      number;
  price_change_pct: number;
  data_source?:     string;
  probabilities:    { BUY: number; HOLD: number; SELL: number };
  indicators: {
    rsi:          number;
    macd:         number;
    macd_signal:  number;
    macd_hist:    number;
    bb_upper:     number;
    bb_lower:     number;
    bb_mid:       number;
    ema_20:       number;
    ema_50:       number;
    atr:          number;
    volume_ratio: number;
  };
  indicator_scores: { ema_cross: number; macd: number; rsi: number; bb_position: number; momentum: number };
};

export type PredictionResult = SignalResult & {
  prediction:    'BUY' | 'SELL' | 'HOLD';
  data_source:   string;
  models_loaded: boolean;
  is_mock:       boolean;
  timestamp:     string;
  error?:        string;
};

export type IndexQuote = {
  name:       string;
  price:      number;
  change:     number;
  change_pct: number;
};

export type PortfolioPosition = {
  id:         string;
  ticker:     string;
  name:       string;
  qty:        number;
  avg_price:  number;
  session_id: string;
};

export type ModelStatus = {
  models:         Record<string, { trained: boolean; label?: string; file?: string; size_mb?: number }>;
  ensemble_ready: boolean;
  device:         string;
};
