from typing import Dict, Any

# Simple in-memory dict to hold game sessions (MVP for Hackathon)
ACTIVE_SESSIONS: Dict[str, Any] = {}

def get_session(session_id: str) -> Any:
    return ACTIVE_SESSIONS.get(session_id)

def create_session(session_id: str, world_data: dict, player_name: str):
    ACTIVE_SESSIONS[session_id] = {
        "world": world_data,
        "players": [
            {
                "name": player_name, 
                "role": "Cyber-Mercenary", 
                "xp": 0,
                "hp": 100,
                "max_hp": 100,
                "energy": 50,
                "max_energy": 50,
                "inventory": []
            }
        ],
        "log": [],   # Action history for context
        "active_quests": [],
        "conquered_regions": []
    }
    return ACTIVE_SESSIONS[session_id]

def update_session(session_id: str, updates: dict):
    if session_id in ACTIVE_SESSIONS:
        # Shallow update, sufficient for MVP
        for k, v in updates.items():
            if isinstance(v, list) and k in ACTIVE_SESSIONS[session_id] and isinstance(ACTIVE_SESSIONS[session_id][k], list):
                ACTIVE_SESSIONS[session_id][k].extend(v)
            else:
                ACTIVE_SESSIONS[session_id][k] = v
