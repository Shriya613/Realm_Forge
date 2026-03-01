from fastapi import WebSocket
from typing import Dict, List
import json

class ConnectionManager:
    def __init__(self):
        # session_id -> list of (websocket, player_name)
        self.rooms: Dict[str, List[dict]] = {}

    async def connect(self, websocket: WebSocket, session_id: str, player_name: str):
        await websocket.accept()
        if session_id not in self.rooms:
            self.rooms[session_id] = []
        self.rooms[session_id].append({"ws": websocket, "name": player_name})
        await self.broadcast(session_id, {
            "type": "player_joined",
            "player": player_name,
            "players": [p["name"] for p in self.rooms[session_id]]
        }, exclude=websocket)

    def disconnect(self, websocket: WebSocket, session_id: str):
        if session_id in self.rooms:
            self.rooms[session_id] = [p for p in self.rooms[session_id] if p["ws"] != websocket]
            if not self.rooms[session_id]:
                del self.rooms[session_id]

    async def broadcast(self, session_id: str, message: dict, exclude: WebSocket = None):
        if session_id not in self.rooms:
            return
        dead = []
        for peer in self.rooms[session_id]:
            if peer["ws"] == exclude:
                continue
            try:
                await peer["ws"].send_text(json.dumps(message))
            except Exception:
                dead.append(peer)
        for d in dead:
            self.rooms[session_id].remove(d)

    async def send_to_all(self, session_id: str, message: dict):
        await self.broadcast(session_id, message, exclude=None)

    def get_players(self, session_id: str) -> List[str]:
        return [p["name"] for p in self.rooms.get(session_id, [])]

manager = ConnectionManager()
