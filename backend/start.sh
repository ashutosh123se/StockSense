#!/bin/bash
# Backend startup script — works on Render, Railway, Cloud Run, Firebase App Hosting
# PORT is injected by the hosting environment
PORT="${PORT:-8080}"
# ROOT_PATH: set to "/_/backend" only on Firebase App Hosting; leave empty on Render/Railway
ROOT_PATH="${ROOT_PATH:-}"

echo "Starting StockSense ML backend on port $PORT with root_path='$ROOT_PATH'"

exec uvicorn app.main:app \
  --host 0.0.0.0 \
  --port "$PORT" \
  --workers 1 \
  --log-level info \
  --proxy-headers \
  --forwarded-allow-ips='*'
