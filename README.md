# StockSense ML

A production-grade, full-stack stock market prediction platform for Indian markets (NSE/BSE) powered by deep learning models (LSTM, GRU, CNN-LSTM hybrid).

## Architecture

![Architecture](https://via.placeholder.com/800x400?text=Architecture+Diagram)

- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS, Zustand, Lightweight Charts.
- **Backend**: FastAPI, PyTorch, Celery, Redis, PostgreSQL + TimescaleDB.
- **ML Pipeline**: LSTM, GRU, CNN-LSTM models with an Ensemble inference engine. MLflow for tracking.
- **Infrastructure**: Docker Compose, MinIO, Nginx, Prometheus.

## Setup Instructions

### Prerequisites
- Node.js 18+
- Python 3.11+
- Docker & Docker Compose
- Poetry

### Local Development

1. **Start Infrastructure Services**
   ```bash
   cd infra
   docker-compose up -d postgres redis minio mlflow
   ```

2. **Backend Setup**
   ```bash
   cd backend
   poetry install
   # Run migrations
   poetry run alembic upgrade head
   # Start server
   poetry run uvicorn app.main:app --reload
   ```

3. **Frontend Setup**
   ```bash
   cd frontend
   npm install
   npm run dev
   ```

4. **Celery Workers**
   ```bash
   cd backend
   poetry run celery -A app.tasks.worker worker --loglevel=info
   ```

## Production Deployment
Use the production docker-compose file:
```bash
docker-compose -f infra/docker-compose.prod.yml up -d --build
```
Ensure you have set all the required environment variables in a `.env` file.
