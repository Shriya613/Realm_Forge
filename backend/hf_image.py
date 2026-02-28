import os
import requests
import io
import asyncio
from dotenv import load_dotenv

load_dotenv(override=True)
HF_TOKEN = os.getenv("HF_TOKEN")

# Public HF Inference endpoint for FLUX or SDXL
# Using SDXL base for stable fast generations
API_URL = "https://router.huggingface.co/hf-inference/models/stabilityai/stable-diffusion-xl-base-1.0"

async def generate_region_image(prompt: str) -> bytes:
    load_dotenv(override=True)
    hf_token = os.getenv("HF_TOKEN")
    
    if not hf_token:
        raise ValueError("HF_TOKEN missing in .env")
    
    headers = {"Authorization": f"Bearer {hf_token}"}
    
    enhanced_prompt = f"cyberpunk, sci-fi landscape, conceptual art, vivid, masterpiece, 8k resolution, highly detailed, {prompt}"
    
    # We offload requests to avoid blocking the FastAPI thread
    loop = asyncio.get_event_loop()
    
    def fetch():
        response = requests.post(API_URL, headers=headers, json={"inputs": enhanced_prompt})
        if response.status_code != 200:
            raise Exception(f"HF Error Status {response.status_code}: {response.text}")
        return response.content
        
    return await loop.run_in_executor(None, fetch)
