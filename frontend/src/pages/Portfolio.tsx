import { useState, useEffect, useCallback } from 'react';
import { Plus, TrendingUp, TrendingDown, Trash2, RefreshCw, PieChart, DollarSign, Activity, Edit2, Check, X } from 'lucide-react';
import { portfolioApi, marketApi } from '../api';
import type { PortfolioPosition } from '../api';

interface EnrichedPosition extends PortfolioPosition {
  currentPrice: number;
  change:       number;
  changePct:    number;
  totalValue:   number;
  pnl:          number;
  pnlPct:       number;
}

const SESSION_ID = 'default';

// ─── SVG Donut allocation chart ───────────────────────────────────────────────
const PALETTE = ['#00E5A0', '#F59E0B', '#FF4D6A', '#60A5FA', '#A78BFA', '#F472B6', '#34D399', '#FB923C'];

function AllocationDonut({ positions }: { positions: EnrichedPosition[] }) {
  const total = positions.reduce((s, p) => s + p.totalValue, 0);
  if (total === 0) return <div className="text-dimmer text-xs text-center py-8">No positions</div>;

  let cum = 0;
  return (
    <div className="flex flex-col items-center w-full">
      <div className="relative w-28 h-28">
        <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
          {positions.map((p, i) => {
            const pct = (p.totalValue / total) * 100;
            const el = (
              <circle key={p.id}
                cx="18" cy="18" r="15.9" fill="none"
                stroke={PALETTE[i % PALETTE.length]} strokeWidth="3"
                strokeDasharray={`${pct} ${100 - pct}`}
                strokeDashoffset={100 - cum}
              />
            );
            cum += pct;
            return el;
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[9px] text-muted">TOTAL</span>
          <span className="font-mono text-xs text-white font-bold">
            ₹{(total / 100000).toFixed(1)}L
          </span>
        </div>
      </div>
      <div className="mt-3 w-full space-y-1">
        {positions.map((p, i) => (
          <div key={p.id} className="flex items-center justify-between text-[10px]">
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full" style={{ background: PALETTE[i % PALETTE.length] }} />
              <span className="text-muted">{p.ticker.split('.')[0]}</span>
            </div>
            <span className="font-mono text-dimmer">{((p.totalValue / total) * 100).toFixed(1)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function Portfolio() {
  const [positions, setPositions]   = useState<EnrichedPosition[]>([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showAdd, setShowAdd]       = useState(false);
  const [editId, setEditId]         = useState<string | null>(null);
  const [editQty, setEditQty]       = useState('');
  const [newTicker, setNewTicker]   = useState('');
  const [newName, setNewName]       = useState('');
  const [newQty, setNewQty]         = useState('');
  const [newAvg, setNewAvg]         = useState('');

  // ── Enrich positions with live prices ────────────────────────────────────
  const enrichPositions = useCallback(async (raw: PortfolioPosition[]) => {
    if (raw.length === 0) return [];
    const enriched = await Promise.all(raw.map(async (pos) => {
      try {
        const q = await marketApi.getQuote(pos.ticker);
        const cp = q.price ?? pos.avg_price;
        return {
          ...pos,
          currentPrice: cp,
          change:       q.change     ?? 0,
          changePct:    q.change_pct ?? 0,
          totalValue:   pos.qty * cp,
          pnl:          (cp - pos.avg_price) * pos.qty,
          pnlPct:       ((cp - pos.avg_price) / pos.avg_price) * 100,
        };
      } catch {
        const cp = pos.avg_price;
        return { ...pos, currentPrice: cp, change: 0, changePct: 0, totalValue: pos.qty * cp, pnl: 0, pnlPct: 0 };
      }
    }));
    return enriched;
  }, []);

  const loadPortfolio = useCallback(async (showSpinner = false) => {
    if (showSpinner) setRefreshing(true);
    try {
      const raw = await portfolioApi.getAll(SESSION_ID);
      const enriched = await enrichPositions(raw);
      setPositions(enriched);
    } catch (e) {
      console.error('Portfolio load failed:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [enrichPositions]);

  useEffect(() => { loadPortfolio(); }, []);

  // ── Stats ────────────────────────────────────────────────────────────────
  const totalValue = positions.reduce((s, p) => s + p.totalValue, 0);
  const totalCost  = positions.reduce((s, p) => s + p.avg_price * p.qty, 0);
  const totalPnl   = positions.reduce((s, p) => s + p.pnl, 0);
  const totalPnlPct = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0;
  const dayChange  = positions.reduce((s, p) => s + p.change * p.qty, 0);
  const best       = positions.length ? positions.reduce((a, b) => a.pnlPct > b.pnlPct ? a : b) : null;

  // ── Add position ─────────────────────────────────────────────────────────
  const addPosition = async () => {
    if (!newTicker || !newQty || !newAvg) return;
    const ticker = newTicker.includes('.') ? newTicker.toUpperCase() : `${newTicker.toUpperCase()}.NS`;
    await portfolioApi.add({
      ticker,
      name:       newName || ticker,
      qty:        parseFloat(newQty),
      avg_price:  parseFloat(newAvg),
      session_id: SESSION_ID,
    });
    setShowAdd(false);
    setNewTicker(''); setNewName(''); setNewQty(''); setNewAvg('');
    await loadPortfolio(true);
  };

  // ── Remove position ──────────────────────────────────────────────────────
  const removePosition = async (id: string) => {
    await portfolioApi.remove(id);
    setPositions(prev => prev.filter(p => p.id !== id));
  };

  // ── Inline edit qty ──────────────────────────────────────────────────────
  const saveEdit = async (id: string) => {
    if (!editQty) return;
    await portfolioApi.update(id, { qty: parseFloat(editQty) }, SESSION_ID);
    setEditId(null);
    await loadPortfolio(true);
  };

  const INR = (v: number) => v.toLocaleString('en-IN', { maximumFractionDigits: 0 });

  return (
    <div className="flex flex-col h-full gap-4">
      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Portfolio Value', value: `₹${INR(totalValue)}`, icon: <DollarSign className="w-4 h-4 text-neon"/>, sub: `${positions.length} positions` },
          { label: 'Total P&L', value: `${totalPnl >= 0 ? '+' : ''}₹${INR(totalPnl)}`, icon: totalPnl >= 0 ? <TrendingUp className="w-4 h-4 text-neon"/> : <TrendingDown className="w-4 h-4 text-red"/>, sub: `${totalPnlPct >= 0 ? '+' : ''}${totalPnlPct.toFixed(2)}% overall`, color: totalPnl >= 0 ? 'text-neon' : 'text-red' },
          { label: 'Best Performer', value: best?.ticker.split('.')[0] ?? '—', icon: <Activity className="w-4 h-4 text-amber"/>, sub: best ? `+${best.pnlPct.toFixed(2)}%` : '—', color: 'text-amber' },
          { label: 'Day Change', value: `${dayChange >= 0 ? '+' : ''}₹${INR(dayChange)}`, icon: <PieChart className="w-4 h-4 text-muted"/>, sub: 'Today' },
        ].map(s => (
          <div key={s.label} className="bg-surface border border-border rounded-xl p-4">
            <div className="flex justify-between items-start mb-1">{s.icon}<span className="text-[10px] text-dimmer uppercase">{s.label}</span></div>
            <div className={`font-mono text-xl font-bold ${s.color ?? 'text-white'}`}>{s.value}</div>
            <div className="text-[10px] text-dimmer mt-0.5">{s.sub}</div>
          </div>
        ))}
      </div>

      <div className="flex-1 flex gap-4 min-h-0">
        {/* Positions Table */}
        <div className="flex-1 bg-surface border border-border rounded-xl flex flex-col min-h-0">
          <div className="flex items-center justify-between px-5 py-3 border-b border-border flex-shrink-0">
            <h2 className="font-display font-semibold text-white">Positions</h2>
            <div className="flex gap-2">
              <button onClick={() => loadPortfolio(true)} disabled={refreshing} className="p-1.5 rounded-lg bg-surface-2 border border-border text-muted hover:text-white">
                <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              </button>
              <button onClick={() => setShowAdd(true)} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-neon text-black text-xs font-bold hover:bg-neon/80">
                <Plus className="w-3.5 h-3.5" /> Add
              </button>
            </div>
          </div>
          {loading ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="animate-spin rounded-full h-7 w-7 border-t-2 border-b-2 border-neon" />
            </div>
          ) : positions.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-dimmer text-sm">No positions yet. Add your first position!</div>
          ) : (
            <div className="flex-1 overflow-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-dimmer border-b border-border">
                    {['Ticker', 'Qty', 'Avg Price', 'CMP', 'Day %', 'Value', 'P&L', 'P&L %', ''].map(h => (
                      <th key={h} className="px-4 py-2.5 text-left font-medium uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {positions.map(pos => (
                    <tr key={pos.id} className="border-b border-border/50 hover:bg-surface-2/40 transition-colors">
                      <td className="px-4 py-2.5">
                        <div className="font-mono font-bold text-white">{pos.ticker.split('.')[0]}</div>
                        <div className="text-[10px] text-dimmer truncate max-w-[110px]">{pos.name}</div>
                      </td>
                      <td className="px-4 py-2.5">
                        {editId === pos.id ? (
                          <div className="flex items-center gap-1">
                            <input type="number" value={editQty} onChange={e => setEditQty(e.target.value)}
                              className="w-16 bg-surface-3 border border-neon/50 rounded px-1 text-white font-mono text-xs outline-none" />
                            <button onClick={() => saveEdit(pos.id)} className="text-neon"><Check className="w-3 h-3"/></button>
                            <button onClick={() => setEditId(null)} className="text-dimmer"><X className="w-3 h-3"/></button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1">
                            <span className="font-mono text-text">{pos.qty}</span>
                            <button onClick={() => { setEditId(pos.id); setEditQty(String(pos.qty)); }} className="text-dimmer hover:text-white">
                              <Edit2 className="w-2.5 h-2.5"/>
                            </button>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-text">₹{pos.avg_price.toFixed(2)}</td>
                      <td className="px-4 py-2.5 font-mono text-white font-semibold">₹{pos.currentPrice.toFixed(2)}</td>
                      <td className={`px-4 py-2.5 font-mono ${pos.changePct >= 0 ? 'text-neon' : 'text-red'}`}>
                        {pos.changePct >= 0 ? '+' : ''}{pos.changePct.toFixed(2)}%
                      </td>
                      <td className="px-4 py-2.5 font-mono text-text">₹{INR(pos.totalValue)}</td>
                      <td className={`px-4 py-2.5 font-mono font-semibold ${pos.pnl >= 0 ? 'text-neon' : 'text-red'}`}>
                        {pos.pnl >= 0 ? '+' : ''}₹{Math.abs(pos.pnl).toFixed(0)}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${pos.pnlPct >= 0 ? 'bg-neon/10 text-neon' : 'bg-red/10 text-red'}`}>
                          {pos.pnlPct >= 0 ? '+' : ''}{pos.pnlPct.toFixed(2)}%
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        <button onClick={() => removePosition(pos.id)} className="text-dimmer hover:text-red transition-colors">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Side panel */}
        <div className="w-44 flex-shrink-0 flex flex-col gap-3">
          <div className="bg-surface border border-border rounded-xl p-4">
            <h3 className="text-xs font-semibold text-white uppercase mb-3">Allocation</h3>
            <AllocationDonut positions={positions} />
          </div>
          <div className="bg-surface border border-border rounded-xl p-4 flex-1">
            <h3 className="text-xs font-semibold text-white uppercase mb-3">Risk</h3>
            <div className="space-y-3">
              {[
                { l: 'Invested', v: `₹${INR(totalCost)}` },
                { l: 'Current', v: `₹${INR(totalValue)}` },
                { l: 'Unrealised', v: `${totalPnl >= 0 ? '+' : ''}₹${INR(totalPnl)}`, c: totalPnl >= 0 ? 'text-neon' : 'text-red' },
              ].map(r => (
                <div key={r.l}>
                  <div className="text-[9px] text-dimmer">{r.l}</div>
                  <div className={`font-mono text-xs font-semibold ${r.c ?? 'text-white'}`}>{r.v}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Add modal */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="bg-surface border border-border rounded-xl p-6 w-80 shadow-2xl">
            <h3 className="font-display font-bold text-white mb-4">Add Position</h3>
            <div className="space-y-3">
              {[
                { label: 'Ticker (e.g. RELIANCE.NS)', val: newTicker, set: setNewTicker, ph: 'RELIANCE.NS', upper: true },
                { label: 'Name (optional)', val: newName, set: setNewName, ph: 'Reliance Industries' },
                { label: 'Quantity', val: newQty, set: setNewQty, ph: '10', num: true },
                { label: 'Avg Buy Price (₹)', val: newAvg, set: setNewAvg, ph: '2700', num: true },
              ].map(f => (
                <div key={f.label}>
                  <label className="text-xs text-muted block mb-1">{f.label}</label>
                  <input
                    type={f.num ? 'number' : 'text'}
                    value={f.val}
                    onChange={e => f.set(f.upper ? e.target.value.toUpperCase() : e.target.value)}
                    className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-white font-mono text-sm focus:border-neon outline-none"
                    placeholder={f.ph}
                  />
                </div>
              ))}
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setShowAdd(false)} className="flex-1 py-2 rounded-lg bg-surface-2 border border-border text-muted text-sm hover:text-white">Cancel</button>
              <button onClick={addPosition} className="flex-1 py-2 rounded-lg bg-neon text-black font-bold text-sm hover:bg-neon/80">Add</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
