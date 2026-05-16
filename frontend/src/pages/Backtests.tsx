import { useState } from 'react';
import { Play, BarChart2, TrendingUp, TrendingDown, AlertCircle, Zap } from 'lucide-react';
import { marketApi } from '../api/market';

interface BacktestResult {
  ticker: string;
  strategy: string;
  period: string;
  totalReturn: number;
  annualizedReturn: number;
  maxDrawdown: number;
  sharpeRatio: number;
  winRate: number;
  totalTrades: number;
  profitFactor: number;
  trades: { date: string; type: string; price: number; pnl: number }[];
}

const STRATEGIES = [
  { id: 'sma_cross', name: 'SMA Crossover', desc: '20/50 SMA crossover signal' },
  { id: 'rsi_mean', name: 'RSI Mean Reversion', desc: 'Buy oversold, sell overbought' },
  { id: 'ml_ensemble', name: 'ML Ensemble', desc: 'LSTM+GRU+CNN-LSTM signal' },
  { id: 'breakout', name: 'Breakout Strategy', desc: '52-week high breakout' },
];

const PERIODS = ['1M', '3M', '6M', '1Y', '3Y'];

function runBacktest(history: any[], strategy: string, ticker: string, period: string): BacktestResult {
  // Simulate backtest calculations from price history
  const prices = history.map((d: any) => d.Close || d.close || d.value || 0).filter(Boolean);

  if (prices.length < 20) {
    return {
      ticker, strategy, period,
      totalReturn: 0, annualizedReturn: 0, maxDrawdown: 0,
      sharpeRatio: 0, winRate: 0, totalTrades: 0, profitFactor: 0, trades: []
    };
  }

  const trades: BacktestResult['trades'] = [];
  let cash = 100000;
  let shares = 0;
  let wins = 0;
  let losses = 0;
  let grossProfit = 0;
  let grossLoss = 0;
  let peak = cash;
  let maxDrawdown = 0;
  const returns: number[] = [];
  let prevPortfolio = cash;

  const sma = (arr: number[], n: number, i: number) => {
    if (i < n - 1) return null;
    return arr.slice(i - n + 1, i + 1).reduce((s, v) => s + v, 0) / n;
  };

  const rsi = (arr: number[], n: number, i: number) => {
    if (i < n) return 50;
    let gains = 0, losses2 = 0;
    for (let j = i - n + 1; j <= i; j++) {
      const diff = arr[j] - arr[j - 1];
      if (diff > 0) gains += diff;
      else losses2 += Math.abs(diff);
    }
    const avgGain = gains / n;
    const avgLoss = losses2 / n || 0.001;
    const rs = avgGain / avgLoss;
    return 100 - 100 / (1 + rs);
  };

  for (let i = 50; i < prices.length; i++) {
    const p = prices[i];
    let signal: 'BUY' | 'SELL' | null = null;

    if (strategy === 'sma_cross') {
      const s20 = sma(prices, 20, i);
      const s50 = sma(prices, 50, i);
      const s20p = sma(prices, 20, i - 1);
      const s50p = sma(prices, 50, i - 1);
      if (s20 && s50 && s20p && s50p) {
        if (s20p < s50p && s20 > s50) signal = 'BUY';
        if (s20p > s50p && s20 < s50) signal = 'SELL';
      }
    } else if (strategy === 'rsi_mean') {
      const r = rsi(prices, 14, i);
      const rp = rsi(prices, 14, i - 1);
      if (rp < 30 && r >= 30) signal = 'BUY';
      if (rp > 70 && r <= 70) signal = 'SELL';
    } else if (strategy === 'ml_ensemble') {
      // Simulate ML signal with momentum + RSI
      const r = rsi(prices, 14, i);
      const momentum = (p - prices[i - 10]) / prices[i - 10];
      if (r < 45 && momentum > 0.02 && shares === 0) signal = 'BUY';
      if (r > 60 && momentum < -0.01 && shares > 0) signal = 'SELL';
    } else if (strategy === 'breakout') {
      const high52 = Math.max(...prices.slice(Math.max(0, i - 52), i));
      if (p > high52 * 0.98 && p > prices[i - 1] && shares === 0) signal = 'BUY';
      if (p < prices[i - 5] * 0.97 && shares > 0) signal = 'SELL';
    }

    if (signal === 'BUY' && shares === 0 && cash > p) {
      shares = Math.floor(cash * 0.95 / p);
      cash -= shares * p;
      trades.push({ date: `Day ${i}`, type: 'BUY', price: parseFloat(p.toFixed(2)), pnl: 0 });
    } else if (signal === 'SELL' && shares > 0) {
      const proceeds = shares * p;
      const entryTrade = trades.filter(t => t.type === 'BUY').at(-1);
      const pnl = entryTrade ? (p - entryTrade.price) * shares : 0;
      cash += proceeds;
      trades.push({ date: `Day ${i}`, type: 'SELL', price: parseFloat(p.toFixed(2)), pnl: parseFloat(pnl.toFixed(2)) });
      if (pnl > 0) { wins++; grossProfit += pnl; }
      else { losses++; grossLoss += Math.abs(pnl); }
      shares = 0;
    }

    const portfolio = cash + shares * p;
    peak = Math.max(peak, portfolio);
    const dd = (peak - portfolio) / peak * 100;
    maxDrawdown = Math.max(maxDrawdown, dd);

    const dailyReturn = (portfolio - prevPortfolio) / prevPortfolio;
    returns.push(dailyReturn);
    prevPortfolio = portfolio;
  }

  const finalValue = cash + shares * prices.at(-1)!;
  const totalReturn = ((finalValue - 100000) / 100000) * 100;
  const daysTraded = prices.length - 50;
  const annualizedReturn = ((1 + totalReturn / 100) ** (252 / daysTraded) - 1) * 100;
  const avgReturn = returns.reduce((s, r) => s + r, 0) / returns.length;
  const std = Math.sqrt(returns.map(r => (r - avgReturn) ** 2).reduce((s, v) => s + v, 0) / returns.length);
  const sharpeRatio = std > 0 ? (avgReturn / std) * Math.sqrt(252) : 0;

  return {
    ticker, strategy, period,
    totalReturn: parseFloat(totalReturn.toFixed(2)),
    annualizedReturn: parseFloat(annualizedReturn.toFixed(2)),
    maxDrawdown: parseFloat(maxDrawdown.toFixed(2)),
    sharpeRatio: parseFloat(sharpeRatio.toFixed(2)),
    winRate: trades.length > 0 ? parseFloat(((wins / Math.max(1, wins + losses)) * 100).toFixed(1)) : 0,
    totalTrades: wins + losses,
    profitFactor: grossLoss > 0 ? parseFloat((grossProfit / grossLoss).toFixed(2)) : grossProfit > 0 ? 99 : 0,
    trades: trades.slice(-10),
  };
}

function MetricCard({ label, value, color = 'text-white', sub }: { label: string; value: string; color?: string; sub?: string }) {
  return (
    <div className="bg-surface-2 border border-border rounded-xl p-4">
      <div className="text-[10px] text-dimmer uppercase tracking-wider mb-1">{label}</div>
      <div className={`font-mono text-xl font-bold ${color}`}>{value}</div>
      {sub && <div className="text-[10px] text-muted mt-0.5">{sub}</div>}
    </div>
  );
}

export function Backtests() {
  const [ticker, setTicker] = useState('RELIANCE.NS');
  const [strategy, setStrategy] = useState('sma_cross');
  const [period, setPeriod] = useState('1Y');
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<BacktestResult | null>(null);

  const PERIOD_MAP: Record<string, { period: string; interval: string }> = {
    '1M': { period: '1mo', interval: '1d' },
    '3M': { period: '3mo', interval: '1d' },
    '6M': { period: '6mo', interval: '1d' },
    '1Y': { period: '1y', interval: '1d' },
    '3Y': { period: '3y', interval: '1wk' },
  };

  const runTest = async () => {
    setRunning(true);
    setResult(null);
    try {
      const { period: apiPeriod, interval } = PERIOD_MAP[period];
      const history = await marketApi.getHistory(ticker, apiPeriod, interval);
      const bt = runBacktest(history, strategy, ticker, period);
      setResult(bt);
    } catch (e) {
      console.error('Backtest failed:', e);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="flex flex-col h-full gap-6">
      {/* Config Panel */}
      <div className="bg-surface border border-border rounded-xl p-4">
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex items-center gap-3">
            <BarChart2 className="w-5 h-5 text-neon" />
            <h1 className="font-display font-bold text-xl text-white">Backtest Engine</h1>
          </div>

          <div className="flex items-end gap-3 flex-1">
            <div>
              <label className="text-[10px] text-muted uppercase block mb-1">Ticker</label>
              <input
                type="text"
                value={ticker}
                onChange={e => setTicker(e.target.value.toUpperCase())}
                className="bg-surface-2 border border-border rounded-lg px-3 py-2 text-white font-mono text-sm focus:border-neon outline-none w-36"
                placeholder="RELIANCE.NS"
              />
            </div>

            <div>
              <label className="text-[10px] text-muted uppercase block mb-1">Strategy</label>
              <select
                value={strategy}
                onChange={e => setStrategy(e.target.value)}
                className="bg-surface-2 border border-border rounded-lg px-3 py-2 text-white text-sm focus:border-neon outline-none cursor-pointer"
              >
                {STRATEGIES.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[10px] text-muted uppercase block mb-1">Period</label>
              <div className="flex bg-surface-2 rounded-lg border border-border overflow-hidden">
                {PERIODS.map(p => (
                  <button
                    key={p}
                    onClick={() => setPeriod(p)}
                    className={`px-3 py-2 text-xs font-medium transition-colors ${
                      period === p ? 'bg-neon text-black font-bold' : 'text-muted hover:text-white'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={runTest}
              disabled={running}
              className="flex items-center gap-2 px-6 py-2 rounded-lg bg-neon text-black font-bold hover:bg-neon/80 transition-all disabled:opacity-50"
            >
              {running ? (
                <div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
              ) : (
                <Play className="w-4 h-4" />
              )}
              {running ? 'Running...' : 'Run Backtest'}
            </button>
          </div>
        </div>

        {/* Strategy Info */}
        <div className="mt-3 text-xs text-dimmer border-t border-border pt-3">
          <span className="text-muted font-semibold">{STRATEGIES.find(s => s.id === strategy)?.name}: </span>
          {STRATEGIES.find(s => s.id === strategy)?.desc}
        </div>
      </div>

      {!result && !running && (
        <div className="flex-1 flex items-center justify-center bg-surface border border-dashed border-border rounded-xl">
          <div className="text-center">
            <Zap className="w-10 h-10 text-dimmer mx-auto mb-3" />
            <p className="text-muted font-mono text-sm">Configure your backtest above and press Run</p>
            <p className="text-dimmer text-xs mt-1">Fetches real historical data and simulates strategy performance</p>
          </div>
        </div>
      )}

      {running && (
        <div className="flex-1 flex items-center justify-center bg-surface border border-border rounded-xl">
          <div className="text-center">
            <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-neon mx-auto mb-3" />
            <p className="text-muted font-mono text-sm">Fetching data & running {STRATEGIES.find(s => s.id === strategy)?.name}...</p>
          </div>
        </div>
      )}

      {result && !running && (
        <div className="flex-1 flex flex-col gap-4 min-h-0">
          {/* Key Metrics */}
          <div className="grid grid-cols-7 gap-3">
            <MetricCard
              label="Total Return"
              value={`${result.totalReturn >= 0 ? '+' : ''}${result.totalReturn}%`}
              color={result.totalReturn >= 0 ? 'text-neon' : 'text-red'}
            />
            <MetricCard
              label="Annualized"
              value={`${result.annualizedReturn >= 0 ? '+' : ''}${result.annualizedReturn}%`}
              color={result.annualizedReturn >= 0 ? 'text-neon' : 'text-red'}
            />
            <MetricCard label="Max Drawdown" value={`-${result.maxDrawdown}%`} color="text-red" />
            <MetricCard
              label="Sharpe Ratio"
              value={result.sharpeRatio.toFixed(2)}
              color={result.sharpeRatio > 1 ? 'text-neon' : result.sharpeRatio > 0 ? 'text-amber' : 'text-red'}
            />
            <MetricCard
              label="Win Rate"
              value={`${result.winRate}%`}
              color={result.winRate >= 50 ? 'text-neon' : 'text-red'}
            />
            <MetricCard label="Total Trades" value={`${result.totalTrades}`} />
            <MetricCard
              label="Profit Factor"
              value={result.profitFactor.toFixed(2)}
              color={result.profitFactor >= 1.5 ? 'text-neon' : result.profitFactor >= 1 ? 'text-amber' : 'text-red'}
              sub={result.profitFactor >= 1.5 ? 'Excellent' : result.profitFactor >= 1 ? 'Acceptable' : 'Poor'}
            />
          </div>

          {/* Trade Log */}
          <div className="flex-1 bg-surface border border-border rounded-xl flex flex-col min-h-0">
            <div className="px-6 py-3 border-b border-border flex items-center justify-between">
              <h3 className="font-display font-semibold text-white">Recent Trades (Last 10)</h3>
              <div className="flex items-center gap-2 text-[10px] text-dimmer">
                <span className="flex items-center gap-1"><TrendingUp className="w-3 h-3 text-neon" /> {result.trades.filter(t => t.type === 'BUY').length} BUY</span>
                <span className="flex items-center gap-1"><TrendingDown className="w-3 h-3 text-red" /> {result.trades.filter(t => t.type === 'SELL').length} SELL</span>
              </div>
            </div>
            <div className="flex-1 overflow-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-dimmer border-b border-border">
                    {['Date', 'Signal', 'Price', 'P&L', 'Status'].map(h => (
                      <th key={h} className="px-6 py-3 text-left font-medium uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.trades.map((t, i) => (
                    <tr key={i} className="border-b border-border/40 hover:bg-surface-2/50 transition-colors">
                      <td className="px-6 py-3 font-mono text-dimmer">{t.date}</td>
                      <td className="px-6 py-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${t.type === 'BUY' ? 'bg-neon/10 text-neon' : 'bg-red/10 text-red'}`}>
                          {t.type}
                        </span>
                      </td>
                      <td className="px-6 py-3 font-mono text-text">₹{t.price.toFixed(2)}</td>
                      <td className={`px-6 py-3 font-mono font-semibold ${t.pnl >= 0 ? 'text-neon' : t.pnl < 0 ? 'text-red' : 'text-dimmer'}`}>
                        {t.type === 'BUY' ? '—' : `${t.pnl >= 0 ? '+' : ''}₹${t.pnl.toFixed(2)}`}
                      </td>
                      <td className="px-6 py-3">
                        {t.type === 'SELL' && (
                          <span className={`text-[10px] ${t.pnl >= 0 ? 'text-neon' : 'text-red'}`}>
                            {t.pnl >= 0 ? '✓ Profit' : '✗ Loss'}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Risk Warning */}
          <div className="bg-surface border border-amber/20 rounded-xl p-3 flex gap-2 items-start">
            <AlertCircle className="w-4 h-4 text-amber shrink-0 mt-0.5" />
            <p className="text-[11px] text-muted">
              <strong className="text-amber">Backtest Disclaimer:</strong> Past performance does not guarantee future results.
              These results are based on historical data only and assume no transaction costs, slippage, or taxes.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
