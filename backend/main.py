from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import logging

from backend.world_gen import generate_world

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Realm Forge API")

# Add CORS to allow frontend to communicate with the backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class WorldRequest(BaseModel):
    prompt: str

@app.post("/generate-world", summary="Generate a complete game world")
async def create_world(request: WorldRequest):
    """
    Takes a player prompt and returns the AI-generated world as JSON.
    """
    try:
        logger.info(f"Generating world with prompt: {request.prompt}")
        world_data = await generate_world(request.prompt)
        return {"status": "success", "data": world_data}
    except Exception as e:
        logger.error(f"Error generating world: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/")
def read_root():
    return {"message": "Realm Forge Backend is running!"}
