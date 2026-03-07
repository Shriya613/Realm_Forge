import json
import traceback
from backend.world_gen import World

mock_mistral_response = {
    "world_name": "The Emerald Veil",
    "lore": "A vast forest hides the ruins of a temple once sacred to the Jewel Keepers. A thieves guild known as the Shadow Hand has stolen the sacred gems and scattered them across four strongholds.",
    "theme": "forest heist, temple ruins, thieves guild",
    "story_arc": "Retrieve all four sacred jewels from the Shadow Hand's strongholds before they sacrifice them at the Ancient Sanctum to awaken a dormant curse.",
    "factions": [
        {
            "id": "faction_shadow_hand",
            "name": "The Shadow Hand",
            "description": "A ruthless thieves guild that operates from the forest canopy and ruins.",
            "personality": "cunning",
            "voice_tone": "whispering"
        },
        {
            "id": "faction_jewel_keepers",
            "name": "The Jewel Keepers",
            "description": "Ancient guardians sworn to protect the sacred gems — now scattered and desperate.",
            "personality": "defensive",
            "voice_tone": "solemn"
        }
    ],
    "regions": [
        {
            "id": "region_whispering_grove",
            "name": "Whispering Grove",
            "description": "A dense grove at the forest edge where the thieves first ambushed the Keepers.",
            "faction_id": "faction_shadow_hand",
            "difficulty": "easy",
            "strategic_value": "Holds the first stolen jewel and the only map to the deeper ruins.",
            "position": {"x": 8, "y": 50},
            "chapter_intro": "The mossy archway looms ahead — low voices drift through the ferns. The thieves are close, and the first jewel glimmers somewhere in the dark.",
            "chapter_outro": "As the last thief flees, a torn parchment falls from their cloak — a crude map pointing deep into the ruins of the Shattered Temple. Someone powerful is coordinating this heist."
        },
        {
            "id": "region_shattered_temple",
            "name": "Shattered Temple",
            "description": "Crumbling stone columns draped in ivy hide the guild's makeshift vault.",
            "faction_id": "faction_shadow_hand",
            "difficulty": "easy",
            "strategic_value": "The vault contains two stolen jewels and the name of the guild's leader.",
            "position": {"x": 36, "y": 50},
            "chapter_intro": "The temple's broken archways cast long shadows. A wax seal on the vault door bears a sigil you recognize — the Shadow Hand's master has been here recently.",
            "chapter_outro": "The vault cracks open. Inside, beside two recovered jewels, is a ledger with a single name: Maren of the Shadowed Glade. She has the final gem — and something else entirely."
        },
        {
            "id": "region_shadowed_glade",
            "name": "Shadowed Glade",
            "description": "A moonlit clearing where the guild's lieutenant makes her camp.",
            "faction_id": "faction_shadow_hand",
            "difficulty": "medium",
            "strategic_value": "Maren holds the third jewel and knows the ritual time for the final sacrifice.",
            "position": {"x": 64, "y": 50},
            "chapter_intro": "Campfire light flickers between the ancient oaks. Maren stands at the edge of the clearing, the third jewel hanging at her throat — watching you approach with a cold smile.",
            "chapter_outro": "Maren falls to her knees, the jewel in your hands. With her last breath she whispers: 'You're too late. The Sanctum wakes at midnight.' The forest trembles. You have one last chance."
        },
        {
            "id": "region_ancient_sanctum",
            "name": "Ancient Sanctum",
            "description": "The buried heart of the old temple, where the curse sleeps beneath cracked stone.",
            "faction_id": "faction_shadow_hand",
            "difficulty": "hard",
            "strategic_value": "The final jewel powers the curse ritual — destroy it to end the Shadow Hand forever.",
            "position": {"x": 92, "y": 50},
            "chapter_intro": "The Sanctum floor glows with cursed runes. The guild master stands at the altar, the last jewel raised high. This ends now.",
            "chapter_outro": "The final jewel shatters. The curse dissolves into the earth, and the forest exhales. The sacred gems are returned — their light restored. The Shadow Hand is broken, and the Emerald Veil is free."
        }
    ],
    "quests": [
        {
            "id": "quest_retrieve_jewels",
            "title": "Retrieve the Sacred Jewels",
            "description": "Recover all four stolen gems from Shadow Hand strongholds before midnight.",
            "region_id": "region_shadowed_glade",
            "boss_impact": "Each jewel recovered weakens the curse ritual by 25%, reducing the boss's power."
        },
        {
            "id": "quest_purify_sanctum",
            "title": "Purify the Ancient Sanctum",
            "description": "Destroy the ritual altar before the curse is fully awakened.",
            "region_id": "region_ancient_sanctum",
            "boss_impact": "Destroying the altar removes the boss's shield and exposes their weakness."
        }
    ],
    "boss": {
        "name": "Caelum, the Veil Breaker",
        "description": "The Shadow Hand's mastermind, wielding a stolen jewel as a weapon of corrupted power.",
        "faction_id": "faction_shadow_hand",
        "base_difficulty": 8,
        "adaptive_behavior": "Grows stronger for each unretrieved jewel remaining — completing quests weakens him.",
        "weakness": "The shattered light of a recovered jewel disrupts his corruption shield.",
        "voice_tone": "cold and theatrical"
    },
    "win_condition": "Retrieve all four sacred jewels and defeat Caelum at the Ancient Sanctum before the curse ritual completes at midnight."
}

print("=" * 60)
print("Testing Pydantic model validation on mock Mistral response...")
print("=" * 60)

try:
    world = World(**mock_mistral_response)
    print(f"\n✅ Pydantic model validated successfully!\n")
    print(f"  World Name  : {world.world_name}")
    print(f"  Theme       : {world.theme}")
    print(f"  Story Arc   : {world.story_arc}")
    print(f"  Factions    : {len(world.factions)}")
    print(f"  Regions     : {len(world.regions)}")
    print(f"  Quests      : {len(world.quests)}")
    print(f"  Win Cond.   : {world.win_condition}")
    print()
    print("  Chapter Arc:")
    for i, r in enumerate(world.regions):
        status = "✅" if r.chapter_intro and r.chapter_outro else "⚠️  MISSING"
        print(f"    [{i+1}] {r.name} ({r.difficulty}) {status}")
        if r.chapter_intro:
            print(f"         intro : {r.chapter_intro[:70]}...")
        if r.chapter_outro:
            print(f"         outro : {r.chapter_outro[:70]}...")
    print()
    print("✅ All fields validated — mock matches current schema.")
except Exception as e:
    print("\n❌ Validation Failed!")
    traceback.print_exc()
