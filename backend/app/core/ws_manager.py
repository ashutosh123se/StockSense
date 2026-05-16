from fastapi import WebSocket
from typing import List, Dict
import json

class ConnectionManager:
    def __init__(self):
        # active_connections: { "ticker": [websocket1, websocket2] }
        self.active_connections: Dict[str, List[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, ticker: str):
        await websocket.accept()
        if ticker not in self.active_connections:
            self.active_connections[ticker] = []
        self.active_connections[ticker].append(websocket)

    def disconnect(self, websocket: WebSocket, ticker: str):
        if ticker in self.active_connections:
            self.active_connections[ticker].remove(websocket)
            if not self.active_connections[ticker]:
                del self.active_connections[ticker]

    async def send_personal_message(self, message: str, websocket: WebSocket):
        await websocket.send_text(message)

    async def broadcast_ticker_update(self, ticker: str, data: dict):
        if ticker in self.active_connections:
            message = json.dumps(data)
            for connection in self.active_connections[ticker]:
                await connection.send_text(message)

ws_manager = ConnectionManager()
