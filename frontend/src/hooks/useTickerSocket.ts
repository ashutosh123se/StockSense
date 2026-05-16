import { useState, useEffect, useRef } from 'react';
import { WS_BASE } from '../api';

export function useTickerSocket(ticker: string) {
  const [data, setData]     = useState<any>(null);
  const [status, setStatus] = useState<'connecting' | 'open' | 'closed'>('connecting');
  const socketRef           = useRef<WebSocket | null>(null);
  const retryRef            = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeRef           = useRef(true);

  useEffect(() => {
    if (!ticker) return;
    activeRef.current = true;

    const connect = () => {
      const ws = new WebSocket(`${WS_BASE}/ws/market/${ticker}`);
      socketRef.current = ws;

      ws.onopen = () => {
        if (activeRef.current) setStatus('open');
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (!msg.error) setData(msg);
        } catch {}
      };

      ws.onclose = () => {
        if (!activeRef.current) return;
        setStatus('closed');
        // Auto-reconnect after 5 seconds
        retryRef.current = setTimeout(() => {
          if (activeRef.current) {
            setStatus('connecting');
            connect();
          }
        }, 5000);
      };

      ws.onerror = () => ws.close();
    };

    setStatus('connecting');
    connect();

    return () => {
      activeRef.current = false;
      if (retryRef.current) clearTimeout(retryRef.current);
      socketRef.current?.close();
    };
  }, [ticker]);

  return { data, status };
}
