import os
import json
from mistralai import Mistral
from pydantic import BaseModel
from typing import Literal, List
from dotenv import load_dotenv
from tenacity import retry, stop_after_attempt, wait_exponential, RetryError

load_dotenv()

MISTRAL_API_KEY = os.getenv("MISTRAL_API_KEY")
if not MISTRAL_API_KEY:
    raise ValueError("MISTRAL_API_KEY is not set in the environment.")

# ── Pydantic Models ────────────────────────────────────────────────────────────

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

# ── Fallback Response (used if all retries fail) ───────────────────────────────

FALLBACK_RESPONSE = {
    "narration": "The Architect's signal flickers... something stirs in the static.",
    "stage": "challenge",
    "choices": [
        {"id": "a", "label": "Press forward",  "description": "Continue despite the silence"},
        {"id": "b", "label": "Fall back",       "description": "Retreat and regroup"},
        {"id": "c", "label": "Wait and watch",  "description": "Observe before acting"}
    ],
    "outcome": "partial",
    "state_changes": {
        "xp_gained": 0, "hp_delta": 0, "energy_delta": 0,
        "loot_dropped": [], "region_status": "unchanged"
    }
}

# ── Helpers ────────────────────────────────────────────────────────────────────

def get_dm_system_prompt() -> str:
    prompt_path = os.path.join(os.path.dirname(__file__), "..", "prompts", "dm_system.txt")
    with open(prompt_path, "r", encoding="utf-8") as f:
        return f.read()

def _trim_messages(messages: list, max_chars: int = 8000) -> list:
    """Keep system prompt + last 3 exchanges if context gets too large."""
    if len(str(messages)) > max_chars:
        return [messages[0]] + messages[-6:]
    return messages

# ── Mistral Call with Retry ────────────────────────────────────────────────────

@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=2, max=8),
    reraise=True
)
async def _call_mistral_with_retry(messages: list) -> str:
    """Call Mistral with automatic exponential-backoff retry (up to 3 attempts)."""
    messages = _trim_messages(messages)
    client = Mistral(api_key=MISTRAL_API_KEY)
    response = await client.chat.complete_async(
        model="ministral-8b-latest",
        messages=messages,
        response_format={"type": "json_object"}
    )
    return response.choices[0].message.content

# ── Main Entry Point ───────────────────────────────────────────────────────────

async def process_action(action: str, current_state: dict, region_id: str = "") -> dict:
    """
    Calls Ministral 8B to narrate a stage-driven adventure beat.
    Retries up to 3x on transient errors, then returns FALLBACK_RESPONSE.
    """
    system_prompt = get_dm_system_prompt()

    # Find the current region data
    region_data = {}
    for r in current_state.get("world", {}).get("regions", []):
        if r["id"] == region_id:
            region_data = r
            break

    # Only send last 2 log entries to avoid repetition
    recent_log = current_state.get("log", [])[-2:]

    # Tight context — only what the AI needs
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

Respond with the next story beat, stage, and 3 specific choices. Do NOT repeat anything from recent_history.
    """

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user",   "content": user_message}
    ]

    try:
        content = await _call_mistral_with_retry(messages)
        response_data = json.loads(content)
        dm_response = DMResponse(**response_data)
        return dm_response.model_dump()

    except RetryError as e:
        print(f"[game_logic] All retries exhausted: {e}. Using fallback.")
        return FALLBACK_RESPONSE

    except json.JSONDecodeError:
        print(f"[game_logic] JSON parse failed. Using fallback.")
        return FALLBACK_RESPONSE

    except Exception as e:
        print(f"[game_logic] Unexpected error: {e}. Using fallback.")
        return FALLBACK_RESPONSE
