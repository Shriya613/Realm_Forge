from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import logging

from backend.world_gen import generate_world
from backend.game_logic import process_action
from backend.state_store import create_session, get_session, update_session

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
    player_name: str = "Hero"
    session_id: str = "demo_session"

class ActionRequest(BaseModel):
    action: str
    session_id: str = "demo_session"
    region_id: str = ""

@app.post("/generate-world", summary="Generate a complete game world")
async def create_world(request: WorldRequest):
    """
    Takes a player prompt and returns the AI-generated world as JSON.
    """
    try:
        logger.info(f"Generating world with prompt: {request.prompt}")
        world_data = await generate_world(request.prompt)
        # Store in memory
        create_session(request.session_id, world_data, request.player_name)
        return {"status": "success", "data": world_data, "session_id": request.session_id}
    except Exception as e:
        logger.error(f"Error generating world: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/action", summary="Submit a player action to the DM")
async def player_action(request: ActionRequest):
    try:
        session = get_session(request.session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        
        # Inject context for what region this action is aimed at
        contextual_action = f"Target Region ID: {request.region_id}. Action text: {request.action}"
        
        dm_response = await process_action(contextual_action, session)
        
        # Update our session with history, XP, HP, Energy and Loot tracking
        session['log'].append({"user": request.action, "dm": dm_response['narration']})
        
        player = session['players'][0]
        state_changes = dm_response['state_changes']
        
        player['xp'] += state_changes['xp_gained']
        
        # Adjust HP with bounds checking
        player['hp'] = max(0, min(player['max_hp'], player['hp'] + state_changes['hp_delta']))
        
        # Adjust Energy with bounds checking
        player['energy'] = max(0, min(player['max_energy'], player['energy'] + state_changes['energy_delta']))
        
        if state_changes['loot_dropped']:
            player['inventory'].extend(state_changes['loot_dropped'])
            
        if state_changes['region_status'] == "conquered":
             session['conquered_regions'].append(request.region_id)
             
        # Return state changes locally to update HUD
        return {
            "status": "success", 
            "response": dm_response, 
            "xp": player['xp'],
            "hp": player['hp'],
            "energy": player['energy'],
            "inventory": player['inventory']
        }
    except Exception as e:
        logger.error(f"Error processing action: {e}")
        raise HTTPException(status_code=500, detail=str(e))

from backend.narration import generate_narration

class NarrationRequest(BaseModel):
    text: str
    voice_id: str = "JBFqnCBcs6831ApcRzwK" # Very deep male cinematic voice

@app.post("/narration", summary="Generate ElevenLabs Narration")
async def get_narration(request: NarrationRequest):
    try:
        audio_bytes = generate_narration(request.text, request.voice_id)
        return StreamingResponse(io.BytesIO(audio_bytes), media_type="audio/mpeg")
    except Exception as e:
        logger.error(f"Narration generation failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

from fastapi.responses import StreamingResponse
import io
from backend.hf_image import generate_region_image

@app.get("/region-image", summary="Generate a dynamic background image via HuggingFace")
async def get_region_image(prompt: str):
    """
    Takes a region description and returns a generated HuggingFace image as JPEG byte stream.
    Used dynamically via URL src by the frontend.
    """
    try:
        image_bytes = await generate_region_image(prompt)
        return StreamingResponse(io.BytesIO(image_bytes), media_type="image/jpeg")
    except Exception as e:
        logger.error(f"Image generation failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/")
def read_root():
    return {"message": "Realm Forge Backend is running!"}
