import os
import json
from mistralai import Mistral
from pydantic import BaseModel, Field
from typing import List, Literal, Optional
from dotenv import load_dotenv

load_dotenv()

MISTRAL_API_KEY = os.getenv("MISTRAL_API_KEY")
if not MISTRAL_API_KEY:
    raise ValueError("MISTRAL_API_KEY is not set in the environment.")

# Pydantic models for validation
class Faction(BaseModel):
    id: str
    name: str
    description: str
    personality: Literal["aggressive", "cunning", "defensive", "diplomatic"]
    voice_tone: str

class Position(BaseModel):
    x: int
    y: int

class Region(BaseModel):
    id: str
    name: str
    description: str
    faction_id: Optional[str] = None
    difficulty: Literal["easy", "medium", "hard"]
    strategic_value: str
    position: Position

class Quest(BaseModel):
    id: str
    title: str
    description: str
    region_id: str
    boss_impact: str

class Boss(BaseModel):
    name: str
    description: str
    faction_id: Optional[str] = None
    base_difficulty: int
    adaptive_behavior: str
    weakness: str
    voice_tone: str

class World(BaseModel):
    world_name: str
    lore: str
    theme: str
    factions: List[Faction]
    regions: List[Region]
    quests: List[Quest]
    boss: Boss

def get_system_prompt() -> str:
    prompt_path = os.path.join(os.path.dirname(__file__), "..", "prompts", "world_gen_system.txt")
    with open(prompt_path, "r", encoding="utf-8") as f:
        return f.read()

async def generate_world(player_prompt: str) -> dict:
    """
    Calls Mistral Large 3 to generate the world based on the player prompt.
    Returns the world as a dictionary.
    """
    system_prompt = get_system_prompt()
    client = Mistral(api_key=MISTRAL_API_KEY)
    
    response = await client.chat.complete_async(
        model="mistral-large-latest",
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": player_prompt}
        ],
        response_format={"type": "json_object"}
    )
    
    # Parse the response JSON
    content = response.choices[0].message.content
    try:
        world_data = json.loads(content)
        # Validate using Pydantic
        world = World(**world_data)
        return world.model_dump()
    except json.JSONDecodeError as e:
        print(f"Failed to parse JSON: {content}")
        raise e
    except Exception as e:
        print(f"Validation error: {e}")
        raise e
