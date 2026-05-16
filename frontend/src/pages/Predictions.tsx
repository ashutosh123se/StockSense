import { useState, useEffect } from 'react';
import { predictionApi, marketApi } from '../api';
import type { PredictionResult } from '../api';
import { BrainCircuit, TrendingUp, AlertCircle, RefreshCw, Cpu, ChevronRight } from 'lucide-react';
import { StockChart } from '../components/charts/StockChart';

const POPULAR: { ticker: string; name: string }[] = [
  { ticker: 'RELIANCE.NS', name: 'Reliance' },
  { ticker: 'TCS.NS', name: 'TCS' },
  { ticker: 'HDFCBANK.NS', name: 'HDFC Bank' },
  { ticker: 'INFY.NS', name: 'Infosys' },
  { ticker: 'WIPRO.NS', name: 'Wipro' },
  { ticker: 'SBIN.NS', name: 'SBI' },
];

function ProbBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-white font-mono">{label}</span>
        <span className="text-muted">{(value * 100).toFixed(1)}%</span>
      </div>
      <div className="w-full h-2 bg-surface-2 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${value * 100}%`, background: color }}
        />
      </div>
    </div>
  );
}

function IndicatorGauge({ label, value, min, max, goodHigh }: {
  label: string; value: number; min: number; max: number; goodHigh: boolean;
}) {
  const pct = Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));
  const isGood = goodHigh ? pct > 60 : pct < 40;
  const color = isGood ? '#00E5A0' : pct > 80 || pct < 20 ? '#FF4D6A' : '#F59E0B';
  return (
    <div className="bg-surface-2 border border-border rounded-lg p-3">
      <div className="flex justify-between text-xs mb-2">
        <span className="text-muted">{label}</span>
        <span className="font-mono text-white">{value.toFixed(2)}</span>
      </div>
      <div className="relative w-full h-1.5 bg-surface-3 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: color }} />
      </div>
      <div className="flex justify-between text-[9px] text-dimmer mt-1">
        <span>{min}</span><span>{max}</span>
      </div>
    </div>
  );
}

export function Predictions() {
  const [ticker, setTicker]       = useState('RELIANCE.NS');
  const [input, setInput]         = useState('RELIANCE.NS');
  const [prediction, setPrediction] = useState<PredictionResult | null>(null);
  const [history, setHistory]     = useState<any[]>([]);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState<string | null>(null);

  const fetchPrediction = async (t = ticker) => {
    setLoading(true);
    setError(null);
    try {
      const [pred, hist] = await Promise.all([
        predictionApi.get(t),
        marketApi.getHistory(t, '3mo', '1d'),
      ]);
      if (pred.error) throw new Error(pred.error as any);
      setPrediction(pred);
      if (Array.isArray(hist)) {
        setHistory(
          hist
            .map((d: any) => ({
              time:  new Date(d.Date || d.date || d.time).getTime() / 1000,
              value: d.close || d.Close,
            }))
            .filter(d => d.value > 0)
            .sort((a, b) => a.time - b.time)
        );
      }
    } catch (e: any) {
      setError(e.message ?? 'Inference failed');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchPrediction(); }, [ticker]);

  const handleRun = () => {
    const t = input.trim().toUpperCase();
    if (!t) return;
    const ticker = t.includes('.') ? t : `${t}.NS`;
    setTicker(ticker);
  };

  const dir = prediction?.prediction ?? 'HOLD';
  const dirColor = dir === 'BUY' ? 'text-neon' : dir === 'SELL' ? 'text-red' : 'text-amber';
  const dirBorder = dir === 'BUY' ? 'border-neon/40' : dir === 'SELL' ? 'border-red/40' : 'border-amber/40';

  return (
    <div className="flex flex-col h-full gap-4">
      {/* Header */}
      <div className="bg-surface border border-border rounded-xl p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BrainCircuit className="w-5 h-5 text-neon" />
            <h1 className="font-display font-bold text-xl text-white">Predictions Explorer</h1>
          </div>
          <button onClick={() => fetchPrediction()} disabled={loading} className="flex items-center gap-1.5 text-xs text-muted hover:text-white transition-colors">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>
        {/* Quick picks */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-dimmer">Quick:</span>
          {POPULAR.map(p => (
            <button
              key={p.ticker}
              onClick={() => { setInput(p.ticker); setTicker(p.ticker); }}
              className={`px-2.5 py-1 rounded text-xs font-medium border transition-all ${
                ticker === p.ticker
                  ? 'bg-neon/10 border-neon/40 text-neon'
                  : 'bg-surface-2 border-border text-muted hover:text-white'
              }`}
            >
              {p.name}
            </button>
          ))}
          <div className="flex items-center gap-2 ml-auto">
            <input
              type="text" value={input}
              onChange={e => setInput(e.target.value.toUpperCase())}
              onKeyDown={e => e.key === 'Enter' && handleRun()}
              className="bg-surface-2 border border-border rounded-lg px-3 py-1.5 text-white font-mono text-xs focus:border-neon outline-none w-36"
              placeholder="TICKER.NS"
            />
            <button onClick={handleRun} className="bg-neon text-black font-bold px-4 py-1.5 rounded-lg text-xs hover:bg-neon/80 flex items-center gap-1">
              Run <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red/10 border border-red/30 rounded-xl p-3 flex gap-2 items-center text-xs text-red">
          <AlertCircle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}

      {loading && (
        <div className="flex-1 flex items-center justify-center bg-surface border border-border rounded-xl">
          <div className="text-center">
            <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-neon mx-auto mb-3" />
            <p className="text-muted text-sm font-mono">Running ML Ensemble + TA Analysis...</p>
            <p className="text-dimmer text-xs mt-1">LSTM + GRU + CNN-LSTM</p>
          </div>
        </div>
      )}

      {!loading && prediction && (
        <div className="flex-1 flex gap-4 min-h-0">
          {/* Left: Chart + KPIs */}
          <div className="flex-1 flex flex-col gap-4 min-h-0">
            <div className="bg-surface border border-border rounded-xl flex-1 flex flex-col">
              <div className="px-4 py-3 border-b border-border flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-muted" />
                <span className="font-display font-semibold text-white text-sm">Price Chart — {ticker}</span>
                <span className={`ml-auto text-[10px] px-2 py-0.5 rounded border font-mono ${
                  prediction.data_source === 'ml_ensemble+ta' ? 'border-neon/30 text-neon bg-neon/5' : 'border-border text-dimmer'
                }`}>
                  {prediction.data_source === 'ml_ensemble+ta' ? '🤖 ML+TA' : '📊 TA Only'}
                </span>
              </div>
              <div className="flex-1 min-h-0">
                {history.length > 0 ? <StockChart data={history} /> : (
                  <div className="h-full flex items-center justify-center text-dimmer text-xs">Loading chart…</div>
                )}
              </div>
            </div>

            {/* KPI row */}
            <div className="grid grid-cols-4 gap-3">
              {[
                { l: 'Current Price', v: `₹${prediction.current_price?.toFixed(2)}`, color: 'text-white' },
                { l: 'Target Price', v: `₹${prediction.target_price?.toFixed(2)}`, color: 'text-neon' },
                { l: 'Stop Loss', v: `₹${prediction.stop_loss?.toFixed(2)}`, color: 'text-red' },
                {
                  l: 'Est. Return',
                  v: `${prediction.price_change_pct >= 0 ? '+' : ''}${prediction.price_change_pct?.toFixed(2)}%`,
                  color: prediction.price_change_pct >= 0 ? 'text-neon' : 'text-red'
                },
              ].map(k => (
                <div key={k.l} className="bg-surface border border-border rounded-xl p-3">
                  <div className="text-[10px] text-dimmer mb-1 uppercase">{k.l}</div>
                  <div className={`font-mono text-lg font-bold ${k.color}`}>{k.v}</div>
                </div>
              ))}
            </div>

            {/* Technical Indicators */}
            {prediction.indicators && (
              <div className="grid grid-cols-3 gap-3">
                <IndicatorGauge label="RSI (14)" value={prediction.indicators.rsi ?? 50} min={0} max={100} goodHigh={false} />
                <IndicatorGauge label="Vol Ratio" value={prediction.indicators.volume_ratio ?? 1} min={0} max={3} goodHigh={true} />
                <div className="bg-surface-2 border border-border rounded-lg p-3">
                  <div className="text-xs text-muted mb-1">MACD Histogram</div>
                  <div className={`font-mono text-sm font-bold ${(prediction.indicators.macd_hist ?? 0) > 0 ? 'text-neon' : 'text-red'}`}>
                    {prediction.indicators.macd_hist?.toFixed(4)}
                  </div>
                  <div className="text-[10px] text-dimmer mt-1">
                    {(prediction.indicators.macd_hist ?? 0) > 0 ? 'Bullish momentum' : 'Bearish momentum'}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Right: Signal Analysis */}
          <div className="w-72 flex flex-col gap-4">
            <div className="bg-surface border border-border rounded-xl p-5">
              {/* Direction + Confidence */}
              <div className="flex flex-col items-center py-4 border-b border-border mb-4">
                <div className={`w-20 h-20 rounded-full flex items-center justify-center border-4 mb-3 ${dirBorder}`}>
                  <span className={`font-bold text-2xl ${dirColor}`}>{dir}</span>
                </div>
                <div className="text-xs text-muted mb-1">Ensemble Confidence</div>
                <div className="font-mono text-2xl text-white">{((prediction.confidence ?? 0) * 100).toFixed(1)}%</div>
                <div className="text-[10px] text-dimmer mt-1">R:R = 1:{prediction.risk_reward}</div>
              </div>

              {/* Probability Breakdown */}
              <div className="space-y-3 mb-4">
                <div className="text-[10px] font-bold text-dimmer uppercase tracking-widest">Probability Breakdown</div>
                {prediction.probabilities && (
                  <>
                    <ProbBar label="BUY"  value={prediction.probabilities.BUY}  color="#00E5A0" />
                    <ProbBar label="HOLD" value={prediction.probabilities.HOLD} color="#F59E0B" />
                    <ProbBar label="SELL" value={prediction.probabilities.SELL} color="#FF4D6A" />
                  </>
                )}
              </div>

              {/* Indicator Scores */}
              {prediction.indicator_scores && (
                <div className="space-y-2">
                  <div className="text-[10px] font-bold text-dimmer uppercase tracking-widest">Factor Scores</div>
                  {Object.entries(prediction.indicator_scores).map(([key, val]) => (
                    <div key={key} className="flex items-center gap-2">
                      <span className="text-[10px] text-muted w-24">{key.replace('_', ' ')}</span>
                      <div className="flex-1 h-1 bg-surface-2 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width:      `${Math.abs(val as number) * 100}%`,
                            marginLeft: (val as number) < 0 ? `${(1 - Math.abs(val as number)) * 100}%` : undefined,
                            background: (val as number) > 0 ? '#00E5A0' : '#FF4D6A',
                          }}
                        />
                      </div>
                      <span className={`text-[10px] font-mono w-10 text-right ${(val as number) > 0 ? 'text-neon' : 'text-red'}`}>
                        {(val as number) > 0 ? '+' : ''}{(val as number).toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Data Source Badge */}
            <div className="bg-surface border border-border rounded-xl p-3 flex items-center gap-2">
              <Cpu className="w-4 h-4 text-neon shrink-0" />
              <div className="text-[10px] text-muted">
                <strong className="text-white">Source: </strong>
                {prediction.data_source === 'ml_ensemble+ta'
                  ? 'ML Ensemble (LSTM+GRU+CNN-LSTM) + Technical Analysis'
                  : 'Technical Analysis (RSI, MACD, BB, EMA)'}
              </div>
            </div>

            {/* Risk Warning */}
            <div className="bg-surface border border-amber/20 rounded-xl p-3 flex gap-2 items-start">
              <AlertCircle className="w-4 h-4 text-amber shrink-0 mt-0.5" />
              <p className="text-[10px] text-muted leading-relaxed">
                <strong className="text-amber">Risk Warning:</strong> ML + TA signals are probabilistic. Always use stop-loss orders and size positions appropriately.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
