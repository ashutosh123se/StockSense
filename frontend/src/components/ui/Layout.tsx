import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, LineChart, History, PieChart,
  BrainCircuit, Settings as SettingsIcon, Bell,
} from 'lucide-react';
import { signalsApi } from '../../api';

interface LayoutProps { children: ReactNode }

type IndexQuote = { name: string; price: number; change: number; change_pct: number };

const navItems = [
  { name: 'Dashboard',   path: '/dashboard',   icon: LayoutDashboard },
  { name: 'Predictions', path: '/predictions', icon: LineChart },
  { name: 'Backtests',   path: '/backtests',   icon: History },
  { name: 'Portfolio',   path: '/portfolio',   icon: PieChart },
  { name: 'Model Lab',   path: '/models',      icon: BrainCircuit },
  { name: 'Settings',    path: '/settings',    icon: SettingsIcon },
];

// ── Real-time index marquee ────────────────────────────────────────────────────
function IndexStrip() {
  const [indices, setIndices] = useState<IndexQuote[]>([]);

  const load = async () => {
    try {
      const res = await signalsApi.getIndices();
      if (res.indices.length > 0) setIndices(res.indices);
    } catch {}
  };

  useEffect(() => {
    load();
    // Refresh every 60 seconds
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, []);

  // Fallback while loading
  const display = indices.length > 0 ? indices : [
    { name: 'NIFTY50',   price: 0, change: 0, change_pct: 0 },
    { name: 'BANKNIFTY', price: 0, change: 0, change_pct: 0 },
    { name: 'SENSEX',    price: 0, change: 0, change_pct: 0 },
  ];

  return (
    <div className="flex items-center gap-6 overflow-x-auto flex-1 no-scrollbar">
      {display.map(idx => (
        <div key={idx.name} className="flex items-center gap-2 whitespace-nowrap flex-shrink-0">
          <span className="text-[10px] text-dimmer font-mono">{idx.name}</span>
          {idx.price > 0 ? (
            <>
              <span className="text-xs font-mono text-white">{idx.price.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
              <span className={`text-[10px] font-mono ${idx.change_pct >= 0 ? 'text-neon' : 'text-red'}`}>
                ({idx.change_pct >= 0 ? '+' : ''}{idx.change_pct.toFixed(2)}%)
              </span>
            </>
          ) : (
            <span className="text-xs font-mono text-dimmer animate-pulse">Loading…</span>
          )}
        </div>
      ))}
    </div>
  );
}

export function Layout({ children }: LayoutProps) {
  const now = new Date();
  // NSE is open Mon–Fri 9:15–15:30 IST
  const istHour   = (now.getUTCHours() + 5.5) % 24;
  const istMinute = now.getUTCMinutes();
  const dayOfWeek = now.getUTCDay(); // 0=Sun
  const marketOpen =
    dayOfWeek >= 1 && dayOfWeek <= 5 &&
    (istHour > 9 || (istHour === 9 && istMinute >= 15)) &&
    (istHour < 15 || (istHour === 15 && istMinute <= 30));

  return (
    <div className="flex h-screen overflow-hidden bg-bg text-text font-body">
      {/* Sidebar */}
      <aside className="w-60 flex-shrink-0 bg-surface border-r border-border flex flex-col">
        <div className="h-14 flex items-center px-5 border-b border-border">
          <span className="font-display font-bold text-lg tracking-tight text-white flex items-center gap-2">
            <BrainCircuit className="text-neon w-5 h-5" />
            StockSense <span className="text-neon">ML</span>
          </span>
        </div>

        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-0.5">
          {navItems.map(item => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.name}
                to={item.path}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all ${
                    isActive
                      ? 'bg-surface-2 text-white border border-border-accent'
                      : 'text-muted hover:bg-surface-2 hover:text-white'
                  }`
                }
              >
                <Icon className="w-4 h-4" />
                <span className="font-medium text-sm">{item.name}</span>
              </NavLink>
            );
          })}
        </nav>

        <div className="p-3 border-t border-border">
          <div className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-surface-2 transition-colors cursor-pointer">
            <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-neon to-blue-500 flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-xs font-medium text-white truncate">Quant Trader</p>
              <p className="text-[10px] text-muted truncate">Pro Plan</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden">
        {/* Header */}
        <header className="h-14 bg-surface border-b border-border flex items-center px-5 gap-4 flex-shrink-0">
          <IndexStrip />

          <div className="flex items-center gap-3 flex-shrink-0">
            <button className="relative p-1.5 text-muted hover:text-white transition-colors rounded-full hover:bg-surface-2">
              <Bell className="w-4 h-4" />
              <span className="absolute top-1 right-1 w-1.5 h-1.5 bg-neon rounded-full" />
            </button>
            <div className={`px-2.5 py-1 rounded text-[10px] font-mono flex items-center gap-1.5 border ${
              marketOpen
                ? 'border-neon/30 text-neon bg-neon/5'
                : 'border-dimmer/30 text-dimmer bg-surface-2'
            }`}>
              <div className={`w-1.5 h-1.5 rounded-full ${marketOpen ? 'bg-neon animate-pulse' : 'bg-dimmer'}`} />
              {marketOpen ? 'MARKET OPEN' : 'MARKET CLOSED'}
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-auto bg-bg p-5">
          {children}
        </div>
      </main>
    </div>
  );
}
