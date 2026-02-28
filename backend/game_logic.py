import os
import json
from mistralai import Mistral
from pydantic import BaseModel
from typing import Literal, Optional, Any
from dotenv import load_dotenv

load_dotenv()

MISTRAL_API_KEY = os.getenv("MISTRAL_API_KEY")
if not MISTRAL_API_KEY:
    raise ValueError("MISTRAL_API_KEY is not set in the environment.")

class StateChanges(BaseModel):
    xp_gained: int
    region_status: Literal["conquered", "contested", "lost", "unchanged"]
    quest_triggered: Optional[str] = None
    boss_modifier: Optional[str] = None

class DMResponse(BaseModel):
    narration: str
    outcome: Literal["success", "partial", "failure"]
    state_changes: StateChanges
    tone: Literal["epic", "tense", "mysterious", "humorous", "ominous"]

def get_dm_system_prompt() -> str:
    prompt_path = os.path.join(os.path.dirname(__file__), "..", "prompts", "dm_system.txt")
    with open(prompt_path, "r", encoding="utf-8") as f:
        return f.read()

async def process_action(action: str, current_state: dict) -> dict:
    """
    Calls Ministral 8B to act as DM, narrating the outcome of a player's action.
    """
    system_prompt = get_dm_system_prompt()
    client = Mistral(api_key=MISTRAL_API_KEY)
    
    # We serialize the current state to inject tightly into the user's prompt
    state_context = json.dumps(current_state, indent=2)
    
    user_message = f"""
Current Game State:
{state_context}

Player Action:
{action}
    """
    
    response = await client.chat.complete_async(
        model="ministral-8b-latest",  # Fast DM model
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_message}
        ],
        response_format={"type": "json_object"}
    )
    
    content = response.choices[0].message.content
    try:
        response_data = json.loads(content)
        # Validate using Pydantic
        dm_response = DMResponse(**response_data)
        return dm_response.model_dump()
    except json.JSONDecodeError as e:
        print(f"Failed to parse JSON: {content}")
        raise e
    except Exception as e:
        print(f"Validation error: {e}")
        raise e
