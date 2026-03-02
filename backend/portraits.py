"""
backend/portraits.py — Gemini Imagen faction portrait generator
Generates pixel-art RPG portraits for each faction leader in parallel.
Adds 'portrait_b64' field to each faction in the world dict.
"""
import os
import asyncio
import httpx
from dotenv import load_dotenv

load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
IMAGEN_URL = "https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict"

PERSONALITY_MAP = {
    "aggressive": "battle-scarred warrior, fierce eyes, war paint, scars",
    "cunning":    "sharp eyes, sly smirk, elaborate clothing, many hidden pockets",
    "defensive":  "heavy ornate armor, cautious expression, shield crest emblem",
    "diplomatic": "elegant flowing robes, open hands, wise calm expression"
}

async def generate_portrait(faction: dict, world_theme: str) -> str:
    """
    Generate a faction leader portrait via Gemini Imagen 3.
    Returns base64-encoded PNG string, or raises on failure.
    """
    personality_desc = PERSONALITY_MAP.get(
        faction.get("personality", "aggressive"), "mysterious shadowed figure"
    )

    prompt = (
        f"Fantasy RPG character portrait, pixel art style, "
        f"faction leader of '{faction['name']}', "
        f"{personality_desc}, "
        f"world theme: {world_theme}. "
        f"Square portrait, dramatic dark background, "
        f"detailed face, glowing eyes, cinematic rim lighting. "
        f"No text, no watermarks, no borders."
    )

    payload = {
        "instances": [{"prompt": prompt}],
        "parameters": {
            "sampleCount": 1,
            "aspectRatio": "1:1",
            "outputMimeType": "image/png"
        }
    }

    async with httpx.AsyncClient(timeout=35) as client:
        response = await client.post(
            f"{IMAGEN_URL}?key={GEMINI_API_KEY}",
            json=payload
        )
        response.raise_for_status()
        data = response.json()
        return data["predictions"][0]["bytesBase64Encoded"]


async def generate_faction_portraits(world: dict) -> dict:
    """
    Generate portraits for all factions in parallel.
    Adds portrait_b64 field to each faction (None on failure).
    Returns the updated world dict.
    """
    theme = world.get("theme", "fantasy")
    factions = world.get("factions", [])

    tasks = [generate_portrait(f, theme) for f in factions]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    for faction, result in zip(factions, results):
        if isinstance(result, Exception):
            print(f"[portraits] Failed for {faction['name']}: {result}")
            faction["portrait_b64"] = None
        else:
            faction["portrait_b64"] = result

    world["factions"] = factions
    return world
