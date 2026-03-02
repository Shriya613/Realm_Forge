import os
import json
from mistralai import Mistral
from pydantic import BaseModel
from typing import Literal, Optional, List
from dotenv import load_dotenv

load_dotenv()

MISTRAL_API_KEY = os.getenv("MISTRAL_API_KEY")
if not MISTRAL_API_KEY:
    raise ValueError("MISTRAL_API_KEY is not set in the environment.")

class Choice(BaseModel):
    id: str
    label: str
    description: str

class StateChanges(BaseModel):
    xp_gained: int
    hp_delta: int = 0
    energy_delta: int = 0
    loot_dropped: List[str] = []
    region_status: Literal["conquered", "contested", "lost", "unchanged"]

class DMResponse(BaseModel):
    narration: str
    stage: Literal["approach", "challenge", "resolution", "complete"]
    choices: List[Choice] = []
    outcome: Literal["success", "partial", "failure", "neutral"]
    state_changes: StateChanges

def get_dm_system_prompt() -> str:
    prompt_path = os.path.join(os.path.dirname(__file__), "..", "prompts", "dm_system.txt")
    with open(prompt_path, "r", encoding="utf-8") as f:
        return f.read()

async def process_action(action: str, current_state: dict, region_id: str = "") -> dict:
    """
    Calls Ministral 8B to act as DM, narrating a stage-driven adventure beat.
    """
    system_prompt = get_dm_system_prompt()
    client = Mistral(api_key=MISTRAL_API_KEY)
    
    # Find the current region data
    region_data = {}
    for r in current_state.get("world", {}).get("regions", []):
        if r["id"] == region_id:
            region_data = r
            break

    # Only send the last 2 log entries to avoid repetition
    recent_log = current_state.get("log", [])[-2:]
    
    # Build a tight context — just what the AI needs
    context = {
        "world_name": current_state.get("world", {}).get("world_name", ""),
        "lore": current_state.get("world", {}).get("lore", ""),
        "current_region": {
            "name": region_data.get("name", "Unknown"),
            "description": region_data.get("description", ""),
            "faction_id": region_data.get("faction_id", ""),
            "difficulty": region_data.get("difficulty", "medium"),
            "strategic_value": region_data.get("strategic_value", "")
        },
        "player_hp": current_state["players"][0]["hp"],
        "player_energy": current_state["players"][0]["energy"],
        "player_xp": current_state["players"][0]["xp"],
        "recent_history": recent_log,
        "conquered_regions": current_state.get("conquered_regions", [])
    }
    
    user_message = f"""
Current Context:
{json.dumps(context, indent=2)}

Player's chosen action:
{action}

Respond with the next story beat, stage, and 3 specific choices for the player. Do NOT repeat anything from recent_history.
    """
    
    response = await client.chat.complete_async(
        model="ministral-8b-latest",
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_message}
        ],
        response_format={"type": "json_object"}
    )
    
    content = response.choices[0].message.content
    try:
        response_data = json.loads(content)
        dm_response = DMResponse(**response_data)
        return dm_response.model_dump()
    except json.JSONDecodeError as e:
        print(f"Failed to parse JSON: {content}")
        raise e
    except Exception as e:
        print(f"Validation error: {e} | Raw: {content}")
        raise e
