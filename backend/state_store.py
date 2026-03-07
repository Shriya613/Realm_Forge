from typing import Dict, Any

# Simple in-memory dict to hold game sessions (MVP for Hackathon)
ACTIVE_SESSIONS: Dict[str, Any] = {}

def get_session(session_id: str) -> Any:
    return ACTIVE_SESSIONS.get(session_id)

def create_session(session_id: str, world_data: dict, player_name: str):
    # Seed quest tracking from world data
    quests = world_data.get("quests", [])
    active_quests = [
        {"id": q["id"], "title": q["title"], "region_id": q["region_id"], "status": "active"}
        for q in quests
    ]

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
        "log": [],                # Action history for context
        "active_quests": active_quests,
        "conquered_regions": [],
        "region_turns": {}        # {region_id: turn_count} for 7-turn arc enforcement
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

def get_region_turn(session_id: str, region_id: str) -> int:
    """Return the current turn count for a region (1-indexed)."""
    session = ACTIVE_SESSIONS.get(session_id, {})
    return session.get("region_turns", {}).get(region_id, 0)

def increment_region_turn(session_id: str, region_id: str) -> int:
    """Increment and return the new turn count for a region."""
    session = ACTIVE_SESSIONS.get(session_id)
    if not session:
        return 1
    if "region_turns" not in session:
        session["region_turns"] = {}
    session["region_turns"][region_id] = session["region_turns"].get(region_id, 0) + 1
    return session["region_turns"][region_id]

def reset_region_turn(session_id: str, region_id: str):
    """Reset turn counter when leaving/re-entering a region."""
    session = ACTIVE_SESSIONS.get(session_id)
    if session and "region_turns" in session:
        session["region_turns"][region_id] = 0

def complete_quest_for_region(session_id: str, region_id: str):
    """Mark quests associated with this region as complete."""
    session = ACTIVE_SESSIONS.get(session_id)
    if not session:
        return
    for q in session.get("active_quests", []):
        if q.get("region_id") == region_id and q.get("status") == "active":
            q["status"] = "complete"

