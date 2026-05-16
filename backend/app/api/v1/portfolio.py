"""
Portfolio CRUD API
Persists portfolio positions per user in the database.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import Column, Integer, String, Numeric, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Session
from sqlalchemy.sql import func
from pydantic import BaseModel
from typing import List, Optional
import uuid

from app.db.session import SessionLocal
from app.db.models import Base

router = APIRouter()


# ─── In-memory store (production replacement for DB when no auth) ───────────
# We use a simple in-memory dict so portfolio works without login.
# When auth is implemented, replace with DB calls.
_portfolio_store: dict = {}   # session_id → list[position]


class PositionCreate(BaseModel):
    ticker: str
    name: Optional[str] = None
    qty: float
    avg_price: float
    session_id: Optional[str] = "default"


class PositionUpdate(BaseModel):
    qty: Optional[float] = None
    avg_price: Optional[float] = None


class PositionOut(BaseModel):
    id: str
    ticker: str
    name: Optional[str]
    qty: float
    avg_price: float
    session_id: str


@router.get("/portfolio/{session_id}", response_model=List[PositionOut])
async def get_portfolio(session_id: str = "default"):
    """Return all positions for a session."""
    positions = _portfolio_store.get(session_id, [])
    return positions


@router.post("/portfolio", response_model=PositionOut, status_code=201)
async def add_position(position: PositionCreate):
    """Add a new position to the portfolio."""
    session_id = position.session_id or "default"
    if session_id not in _portfolio_store:
        _portfolio_store[session_id] = []

    # Check if ticker already exists — update qty instead of duplicate
    existing = next(
        (p for p in _portfolio_store[session_id] if p["ticker"] == position.ticker.upper()),
        None
    )
    if existing:
        # Average down/up
        total_cost = existing["avg_price"] * existing["qty"] + position.avg_price * position.qty
        total_qty  = existing["qty"] + position.qty
        existing["avg_price"] = round(total_cost / total_qty, 2)
        existing["qty"]       = total_qty
        return existing

    new_pos = {
        "id":         str(uuid.uuid4()),
        "ticker":     position.ticker.upper(),
        "name":       position.name or position.ticker.upper(),
        "qty":        position.qty,
        "avg_price":  position.avg_price,
        "session_id": session_id,
    }
    _portfolio_store[session_id].append(new_pos)
    return new_pos


@router.put("/portfolio/{position_id}", response_model=PositionOut)
async def update_position(
    position_id: str,
    update: PositionUpdate,
    session_id: str = "default",
):
    for positions in _portfolio_store.values():
        for p in positions:
            if p["id"] == position_id:
                if update.qty is not None:
                    p["qty"] = update.qty
                if update.avg_price is not None:
                    p["avg_price"] = update.avg_price
                return p
    raise HTTPException(status_code=404, detail="Position not found")


@router.delete("/portfolio/{position_id}", status_code=204)
async def delete_position(position_id: str):
    for session_id, positions in _portfolio_store.items():
        for i, p in enumerate(positions):
            if p["id"] == position_id:
                _portfolio_store[session_id].pop(i)
                return
    raise HTTPException(status_code=404, detail="Position not found")


@router.post("/portfolio/reset/{session_id}", status_code=204)
async def reset_portfolio(session_id: str):
    """Clear all positions for a session."""
    _portfolio_store[session_id] = []
