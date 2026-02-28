import os
import requests
from dotenv import load_dotenv

load_dotenv(override=True)
def generate_narration(text: str, voice_id: str) -> bytes:
    load_dotenv(override=True)
    api_key = os.getenv("ELEVENLABS_API_KEY")
    
    if not api_key:
        raise ValueError("ELEVENLABS_API_KEY is missing in .env")
    
    url = f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}"
    headers = {
        "Accept": "audio/mpeg",
        "Content-Type": "application/json",
        "xi-api-key": api_key
    }
    data = {
        "text": text,
        "model_id": "eleven_monolingual_v1",
        "voice_settings": {
            "stability": 0.5,
            "similarity_boost": 0.75
        }
    }
    
    response = requests.post(url, json=data, headers=headers)
    if response.status_code != 200:
         raise Exception(f"ElevenLabs error {response.status_code}: {response.text}")
         
    return response.content
