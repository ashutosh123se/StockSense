import { useState } from 'react';
import { Settings as SettingsIcon, Key, Bell, Shield, Database, ChevronRight, Check, Eye, EyeOff } from 'lucide-react';

const SECTIONS = [
  { id: 'api', label: 'API Configuration', icon: Key },
  { id: 'alerts', label: 'Alerts & Notifications', icon: Bell },
  { id: 'risk', label: 'Risk Parameters', icon: Shield },
  { id: 'data', label: 'Data Sources', icon: Database },
];

interface ToggleProps { checked: boolean; onChange: () => void; color?: string }
function Toggle({ checked, onChange, color = '#00E5A0' }: ToggleProps) {
  return (
    <button
      onClick={onChange}
      className={`relative w-10 h-5 rounded-full transition-colors ${checked ? '' : 'bg-surface-3'}`}
      style={{ background: checked ? color : undefined }}
    >
      <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${checked ? 'translate-x-5' : 'translate-x-0.5'}`} />
    </button>
  );
}

export function Settings() {
  const [activeSection, setActiveSection] = useState('api');
  const [showKey, setShowKey] = useState(false);
  const [saved, setSaved] = useState(false);

  const [settings, setSettings] = useState(() => {
    const savedBackend = localStorage.getItem('stocksense_backend_url');
    const savedApiKey = localStorage.getItem('stocksense_api_key');
    const savedMlflow = localStorage.getItem('stocksense_mlflow_url');
    const savedAlerts = localStorage.getItem('stocksense_alerts');
    const parsedAlerts = savedAlerts ? JSON.parse(savedAlerts) : {};

    return {
      backendUrl: savedBackend ?? (import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000'),
      apiKey: savedApiKey ?? 'sk-stocksense-xxxxxxxxxxxxxxxx',
      mlflowUrl: savedMlflow ?? 'http://localhost:5000',
      // Alerts
      priceAlerts: parsedAlerts.priceAlerts ?? true,
      signalAlerts: parsedAlerts.signalAlerts ?? true,
      modelAlerts: parsedAlerts.modelAlerts ?? false,
      emailAlerts: parsedAlerts.emailAlerts ?? false,
      // Risk
      maxPositionPct: 10,
      stopLossDefault: 2,
      takeProfitDefault: 4,
      maxDrawdownAlert: 15,
      // Data
      dataSource: 'yfinance',
      updateInterval: 5,
      cacheEnabled: true,
      mockFallback: true,
    };
  });

  const set = (key: string, value: any) => setSettings(prev => ({ ...prev, [key]: value }));

  const save = () => {
    localStorage.setItem('stocksense_backend_url', settings.backendUrl);
    localStorage.setItem('stocksense_api_key', settings.apiKey);
    localStorage.setItem('stocksense_mlflow_url', settings.mlflowUrl);
    localStorage.setItem('stocksense_alerts', JSON.stringify({
      priceAlerts: settings.priceAlerts,
      signalAlerts: settings.signalAlerts,
      modelAlerts: settings.modelAlerts,
      emailAlerts: settings.emailAlerts,
    }));

    setSaved(true);
    setTimeout(() => {
      setSaved(false);
      window.location.reload();
    }, 1000);
  };

  return (
    <div className="flex flex-col h-full gap-6">
      {/* Header */}
      <div className="bg-surface border border-border rounded-xl p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <SettingsIcon className="w-5 h-5 text-neon" />
          <h1 className="font-display font-bold text-xl text-white">Settings</h1>
        </div>
        <button
          onClick={save}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bold text-sm transition-all ${
            saved ? 'bg-neon/20 text-neon border border-neon/30' : 'bg-neon text-black hover:bg-neon/80'
          }`}
        >
          {saved ? <><Check className="w-4 h-4" /> Saved!</> : 'Save Changes'}
        </button>
      </div>

      <div className="flex-1 flex gap-6 min-h-0">
        {/* Sidebar */}
        <div className="w-52 flex-shrink-0 bg-surface border border-border rounded-xl p-2 flex flex-col gap-1 h-fit">
          {SECTIONS.map(s => (
            <button
              key={s.id}
              onClick={() => setActiveSection(s.id)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all ${
                activeSection === s.id
                  ? 'bg-surface-3 text-white border border-border-accent'
                  : 'text-muted hover:text-white hover:bg-surface-2'
              }`}
            >
              <s.icon className="w-4 h-4" />
              <span>{s.label}</span>
              <ChevronRight className={`w-3 h-3 ml-auto transition-transform ${activeSection === s.id ? 'rotate-90' : ''}`} />
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 bg-surface border border-border rounded-xl p-6 overflow-y-auto">
          {activeSection === 'api' && (
            <div className="space-y-6">
              <div>
                <h2 className="font-display font-semibold text-white mb-1">API Configuration</h2>
                <p className="text-xs text-muted">Configure backend endpoints and authentication keys.</p>
              </div>
              <div className="space-y-4">
                {[
                  { label: 'Backend API URL', key: 'backendUrl', placeholder: 'http://localhost:8000' },
                  { label: 'MLflow Tracking URL', key: 'mlflowUrl', placeholder: 'http://localhost:5000' },
                ].map(f => (
                  <div key={f.key}>
                    <label className="text-xs text-muted block mb-1">{f.label}</label>
                    <input
                      type="text"
                      value={(settings as any)[f.key]}
                      onChange={e => set(f.key, e.target.value)}
                      className="w-full bg-surface-2 border border-border rounded-lg px-4 py-2 text-white font-mono text-sm focus:border-neon outline-none"
                      placeholder={f.placeholder}
                    />
                  </div>
                ))}
                <div>
                  <label className="text-xs text-muted block mb-1">API Secret Key</label>
                  <div className="relative">
                    <input
                      type={showKey ? 'text' : 'password'}
                      value={settings.apiKey}
                      onChange={e => set('apiKey', e.target.value)}
                      className="w-full bg-surface-2 border border-border rounded-lg px-4 py-2 pr-10 text-white font-mono text-sm focus:border-neon outline-none"
                    />
                    <button onClick={() => setShowKey(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-dimmer hover:text-white">
                      {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeSection === 'alerts' && (
            <div className="space-y-6">
              <div>
                <h2 className="font-display font-semibold text-white mb-1">Alerts & Notifications</h2>
                <p className="text-xs text-muted">Configure when and how you receive trading signals and alerts.</p>
              </div>
              <div className="space-y-4">
                {[
                  { label: 'Price Movement Alerts', sub: 'Alert when price moves ±2% in 5 minutes', key: 'priceAlerts' },
                  { label: 'ML Signal Alerts', sub: 'Notify when ensemble generates BUY/SELL signal', key: 'signalAlerts' },
                  { label: 'Model Re-train Alerts', sub: 'Notify when model accuracy degrades below threshold', key: 'modelAlerts' },
                  { label: 'Email Notifications', sub: 'Send alerts via email (requires SMTP config)', key: 'emailAlerts', color: '#60A5FA' },
                ].map(a => (
                  <div key={a.key} className="flex items-center justify-between p-4 bg-surface-2 border border-border rounded-xl">
                    <div>
                      <div className="text-sm text-white font-medium">{a.label}</div>
                      <div className="text-xs text-muted mt-0.5">{a.sub}</div>
                    </div>
                    <Toggle
                      checked={(settings as any)[a.key]}
                      onChange={() => set(a.key, !(settings as any)[a.key])}
                      color={a.color}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeSection === 'risk' && (
            <div className="space-y-6">
              <div>
                <h2 className="font-display font-semibold text-white mb-1">Risk Parameters</h2>
                <p className="text-xs text-muted">Default risk management rules applied to signal generation.</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                {[
                  { label: 'Max Position Size (%)', key: 'maxPositionPct', min: 1, max: 100, suffix: '%' },
                  { label: 'Default Stop Loss (%)', key: 'stopLossDefault', min: 0.5, max: 20, suffix: '%', color: '#FF4D6A' },
                  { label: 'Default Take Profit (%)', key: 'takeProfitDefault', min: 1, max: 50, suffix: '%', color: '#00E5A0' },
                  { label: 'Max Drawdown Alert (%)', key: 'maxDrawdownAlert', min: 1, max: 50, suffix: '%', color: '#F59E0B' },
                ].map(r => (
                  <div key={r.key} className="bg-surface-2 border border-border rounded-xl p-4">
                    <label className="text-xs text-muted block mb-2">{r.label}</label>
                    <div className="flex items-center gap-3">
                      <input
                        type="range"
                        min={r.min}
                        max={r.max}
                        step={0.5}
                        value={(settings as any)[r.key]}
                        onChange={e => set(r.key, parseFloat(e.target.value))}
                        className="flex-1 accent-neon"
                        style={{ accentColor: r.color ?? '#00E5A0' }}
                      />
                      <span className="font-mono text-white text-sm w-12 text-right">{(settings as any)[r.key]}{r.suffix}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeSection === 'data' && (
            <div className="space-y-6">
              <div>
                <h2 className="font-display font-semibold text-white mb-1">Data Sources</h2>
                <p className="text-xs text-muted">Configure data ingestion and caching settings.</p>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="text-xs text-muted block mb-1">Primary Data Provider</label>
                  <div className="flex gap-3">
                    {['yfinance', 'nse_api', 'bse_api'].map(src => (
                      <button
                        key={src}
                        onClick={() => set('dataSource', src)}
                        className={`px-4 py-2 rounded-lg border text-sm font-medium transition-all ${
                          settings.dataSource === src
                            ? 'bg-neon/10 border-neon/50 text-neon'
                            : 'bg-surface-2 border-border text-muted hover:text-white'
                        }`}
                      >
                        {src}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-xs text-muted block mb-1">WebSocket Update Interval</label>
                  <div className="flex items-center gap-3">
                    <input
                      type="range" min={1} max={60} step={1}
                      value={settings.updateInterval}
                      onChange={e => set('updateInterval', parseInt(e.target.value))}
                      className="flex-1 accent-neon"
                    />
                    <span className="font-mono text-white text-sm w-16">{settings.updateInterval}s</span>
                  </div>
                </div>
                {[
                  { label: 'Enable Data Cache', sub: 'Cache historical data locally to reduce API calls', key: 'cacheEnabled' },
                  { label: 'Mock Data Fallback', sub: 'Use mock data when API is unreachable (dev mode)', key: 'mockFallback', color: '#F59E0B' },
                ].map(a => (
                  <div key={a.key} className="flex items-center justify-between p-4 bg-surface-2 border border-border rounded-xl">
                    <div>
                      <div className="text-sm text-white font-medium">{a.label}</div>
                      <div className="text-xs text-muted mt-0.5">{a.sub}</div>
                    </div>
                    <Toggle
                      checked={(settings as any)[a.key]}
                      onChange={() => set(a.key, !(settings as any)[a.key])}
                      color={a.color}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
