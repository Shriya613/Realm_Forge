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
        
        # Update our session with simple history and XP tracking
        session['log'].append({"user": request.action, "dm": dm_response['narration']})
        session['players'][0]['xp'] += dm_response['state_changes']['xp_gained']
        if dm_response['state_changes']['region_status'] == "conquered":
             session['conquered_regions'].append(request.region_id)
             
        # Broadcast/save any state changes here
        return {"status": "success", "response": dm_response, "xp": session['players'][0]['xp']}
    except Exception as e:
        logger.error(f"Error processing action: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/")
def read_root():
    return {"message": "Realm Forge Backend is running!"}
