import json
import traceback
from backend.world_gen import World

mock_mistral_response = {
  "world_name": "The Ashen Archipelago",
  "lore": "This island was once peaceful, until the volcano erupted and the pirates came. Now it is a place of betrayal and fire.",
  "theme": "pirate betrayal",
  "factions": [
    {
      "id": "faction_1",
      "name": "The Ironclad Brotherhood",
      "description": "Ruthless pirates who rule the seas with an iron fist.",
      "personality": "aggressive",
      "voice_tone": "gruff"
    }
  ],
  "regions": [
    {
      "id": "region_1",
      "name": "Cinder Bay",
      "description": "A bay filled with ash and sunken ships.",
      "faction_id": "faction_1",
      "difficulty": "medium",
      "strategic_value": "Controls access to the open ocean.",
      "position": {"x": 10, "y": 20}
    }
  ],
  "quests": [
    {
      "id": "quest_1",
      "title": "Recover the stolen compass",
      "description": "Find the compass taken by the Ironclad Brotherhood.",
      "region_id": "region_1",
      "boss_impact": "Reduces the boss's evasion by 20%."
    }
  ],
  "boss": {
    "name": "Admiral Vex, the Betrayer",
    "description": "The treacherous leader of the Ironclad Brotherhood.",
    "faction_id": "faction_1",
    "base_difficulty": 8,
    "adaptive_behavior": "If players use fire, he uses water shields.",
    "weakness": "vulnerable to loud noises",
    "voice_tone": "menacing"
  }
}

try:
    print("Testing Pydantic model validation on mock Mistral response...")
    world = World(**mock_mistral_response)
    print("✅ Pydantic model successfully validated the mock response!")
    print(f"Parsed World Name: {world.world_name}")
except Exception as e:
    print("❌ Validation Failed!")
    traceback.print_exc()
