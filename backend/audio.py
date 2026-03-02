"""
backend/audio.py — ElevenLabs SFX pre-generation
Generates a library of sound effects at world-gen time,
returned as base64 so the frontend can cache and play them instantly.
"""
import os
import base64
import asyncio
import httpx
from dotenv import load_dotenv

load_dotenv()

ELEVENLABS_API_KEY = os.getenv("ELEVENLABS_API_KEY")

# ── SFX event map ──────────────────────────────────────────────────────────────
SFX_LIBRARY = {
    "approach":     "tense mysterious footsteps slow approach",
    "challenge":    "combat encounter dramatic sting impact",
    "success":      "victory chime short triumphant bright",
    "failure":      "defeat sting dark short low",
    "partial":      "ambiguous outcome neutral short mid",
    "conquered":    "region conquered fanfare epic short rise",
    "boss_intro":   "boss encounter massive dramatic deep impact",
    "level_up":     "level up chime ascending bright short",
    "button_click": "UI click select short crisp tap"
}

# ── Core SFX caller ────────────────────────────────────────────────────────────

async def generate_sfx(description: str, duration: float = 1.5) -> bytes:
    """Generate a single sound effect via ElevenLabs sound-generation API."""
    async with httpx.AsyncClient(timeout=25) as client:
        response = await client.post(
            "https://api.elevenlabs.io/v1/sound-generation",
            headers={
                "xi-api-key": ELEVENLABS_API_KEY,
                "Content-Type": "application/json"
            },
            json={
                "text": description,
                "duration_seconds": duration,
                "prompt_influence": 0.3
            }
        )
        response.raise_for_status()
        return response.content

# ── Pre-generate full library in parallel ──────────────────────────────────────

async def generate_sfx_library() -> dict:
    """
    Generate all game SFX in parallel at world-gen time.
    Returns dict of {event_name: base64_mp3_string | None}.
    """
    async def _gen(key: str, desc: str):
        try:
            audio_bytes = await generate_sfx(desc, duration=1.5)
            return key, base64.b64encode(audio_bytes).decode()
        except Exception as e:
            print(f"[audio] SFX failed for '{key}': {e}")
            return key, None

    tasks = [_gen(k, v) for k, v in SFX_LIBRARY.items()]
    results = await asyncio.gather(*tasks)
    return dict(results)
