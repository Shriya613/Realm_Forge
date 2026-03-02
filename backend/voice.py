import os
import httpx
from dotenv import load_dotenv

load_dotenv()

MISTRAL_API_KEY = os.getenv("MISTRAL_API_KEY")


async def transcribe_audio(audio_b64: str, language: str = "en") -> str:
    """
    Transcribe audio using Voxtral via Mistral API.
    audio_b64: pure base64-encoded audio (webm/opus from browser MediaRecorder)
    Returns transcribed text string.
    """
    async with httpx.AsyncClient(timeout=15) as client:
        response = await client.post(
            "https://api.mistral.ai/v1/audio/transcriptions",
            headers={
                "Authorization": f"Bearer {MISTRAL_API_KEY}",
                "Content-Type": "application/json"
            },
            json={
                "model": "voxtral-mini-2507",
                "audio": {
                    "type": "base64",
                    "data": audio_b64
                },
                "language": language,
                # Context biasing — help Voxtral understand game vocabulary
                "context": (
                    "Fantasy RPG game. Player voice commands include: "
                    "attack, scout, negotiate, sneak, retreat, use item, "
                    "cast spell, flee, approach, challenge, hack, defend."
                )
            }
        )
        response.raise_for_status()
        data = response.json()
        return data.get("text", "").strip()
