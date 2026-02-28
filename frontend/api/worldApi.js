export const dummyWorld = {
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
      "position": {"x": 200, "y": 300}
    },
    {
      "id": "region_2",
      "name": "Smuggler's Cove",
      "description": "Hidden pirate outpost.",
      "faction_id": "faction_1",
      "difficulty": "easy",
      "strategic_value": "Good for stealth entries.",
      "position": {"x": 400, "y": 200}
    },
    {
      "id": "region_3",
      "name": "Volcano Peak",
      "description": "The fiery center where the boss resides.",
      "faction_id": "faction_1",
      "difficulty": "hard",
      "strategic_value": "High ground advantage.",
      "position": {"x": 600, "y": 400}
    },
    {
      "id": "region_4",
      "name": "The Shattered Atoll",
      "description": "A chain of broken islands swarming with scavengers.",
      "faction_id": "faction_1",
      "difficulty": "medium",
      "strategic_value": "Contains hidden loot.",
      "position": {"x": 500, "y": 600}
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
};
