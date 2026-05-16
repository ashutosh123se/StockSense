from sqlalchemy import Column, Integer, String, Boolean, BigInteger, Numeric, DateTime, ForeignKey, JSON, Date, ARRAY
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.sql import func
import uuid

Base = declarative_base()

class User(Base):
    __tablename__ = 'users'
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email = Column(String, unique=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    full_name = Column(String)
    plan = Column(String, default='free')
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now(), server_default=func.now())

class Stock(Base):
    __tablename__ = 'stocks'
    id = Column(Integer, primary_key=True, autoincrement=True)
    ticker = Column(String, nullable=False)
    name = Column(String)
    exchange = Column(String, nullable=False)
    sector = Column(String)
    industry = Column(String)
    market_cap = Column(BigInteger)
    is_active = Column(Boolean, default=True)

class OHLCV(Base):
    __tablename__ = 'ohlcv'
    time = Column(DateTime(timezone=True), primary_key=True)
    stock_id = Column(Integer, ForeignKey('stocks.id'), primary_key=True)
    open = Column(Numeric(12, 2))
    high = Column(Numeric(12, 2))
    low = Column(Numeric(12, 2))
    close = Column(Numeric(12, 2))
    volume = Column(BigInteger)
    delivery_pct = Column(Numeric(5, 2))

class MLModel(Base):
    __tablename__ = 'ml_models'
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String, nullable=False)
    version = Column(String, nullable=False)
    exchange = Column(String)
    accuracy_directional = Column(Numeric(5, 4))
    accuracy_multiclass = Column(Numeric(5, 4))
    sharpe_ratio = Column(Numeric(6, 4))
    trained_at = Column(DateTime(timezone=True))
    artifact_path = Column(String)
    hyperparameters = Column(JSON)
    metrics = Column(JSON)
    is_production = Column(Boolean, default=False)

class Prediction(Base):
    __tablename__ = 'predictions'
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    stock_id = Column(Integer, ForeignKey('stocks.id'))
    model_id = Column(UUID(as_uuid=True), ForeignKey('ml_models.id'))
    predicted_at = Column(DateTime(timezone=True), server_default=func.now())
    horizon = Column(String, nullable=False)
    direction = Column(String, nullable=False)
    confidence = Column(Numeric(5, 4))
    price_at_prediction = Column(Numeric(12, 2))
    predicted_price = Column(Numeric(12, 2))
    actual_price = Column(Numeric(12, 2))
    was_correct = Column(Boolean)
    probabilities = Column(JSON)

class Signal(Base):
    __tablename__ = 'signals'
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    stock_id = Column(Integer, ForeignKey('stocks.id'))
    generated_at = Column(DateTime(timezone=True), server_default=func.now())
    signal_type = Column(String, nullable=False)
    entry_price = Column(Numeric(12, 2))
    target_price = Column(Numeric(12, 2))
    stop_loss = Column(Numeric(12, 2))
    risk_reward = Column(Numeric(6, 2))
    confidence = Column(Numeric(5, 4))
    model_used = Column(String)
    timeframe = Column(String)
    status = Column(String, default='active')
    pnl_pct = Column(Numeric(7, 4))
