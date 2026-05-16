import { useState, useEffect, useRef } from 'react';

export function useTickerSocket(ticker: string) {
  const [data, setData] = useState<any>(null);
  const [status, setStatus] = useState<'connecting' | 'open' | 'closed'>('connecting');
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!ticker) return;

    const wsUrl = `ws://localhost:8000/ws/market/${ticker}`;
    const socket = new WebSocket(wsUrl);
    socketRef.current = socket;

    socket.onopen = () => {
      setStatus('open');
      console.log(`Connected to WS for ${ticker}`);
    };

    socket.onmessage = (event) => {
      const message = JSON.parse(event.data);
      setData(message);
    };

    socket.onclose = () => {
      setStatus('closed');
      console.log(`Disconnected from WS for ${ticker}`);
    };

    socket.onerror = (error) => {
      console.error('WS Error:', error);
    };

    return () => {
      socket.close();
    };
  }, [ticker]);

  return { data, status };
}
