from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import logging
import io
import json

from backend.world_gen import generate_world
from backend.game_logic import process_action
from backend.state_store import create_session, get_session, update_session
from backend.narration import generate_narration
from backend.hf_image import generate_region_image
from backend.ws_manager import manager

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
        
        dm_response = await process_action(contextual_action, session, request.region_id)
        
        # Update session
        session['log'].append({"user": request.action, "dm": dm_response['narration']})
        
        player = session['players'][0]
        state_changes = dm_response['state_changes']
        
        player['xp'] += state_changes['xp_gained']
        player['hp'] = max(0, min(player['max_hp'], player['hp'] + state_changes['hp_delta']))
        player['energy'] = max(0, min(player['max_energy'], player['energy'] + state_changes['energy_delta']))
        
        if state_changes['loot_dropped']:
            player['inventory'].extend(state_changes['loot_dropped'])
            
        if state_changes['region_status'] == "conquered":
             session['conquered_regions'].append(request.region_id)
             
        return {
            "status": "success", 
            "response": dm_response, 
            "xp": player['xp'],
            "hp": player['hp'],
            "energy": player['energy'],
            "inventory": player['inventory'],
            "stage": dm_response.get("stage", "approach"),
            "choices": dm_response.get("choices", [])
        }
    except Exception as e:
        logger.error(f"Error processing action: {e}")
        raise HTTPException(status_code=500, detail=str(e))


class NarrationRequest(BaseModel):
    text: str
    voice_id: str = "JBFqnCBcs6831ApcRzwK"

@app.post("/narration", summary="Generate ElevenLabs Narration")
async def get_narration(request: NarrationRequest):
    try:
        audio_bytes = generate_narration(request.text, request.voice_id)
        return StreamingResponse(io.BytesIO(audio_bytes), media_type="audio/mpeg")
    except Exception as e:
        logger.error(f"Narration generation failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/region-image", summary="Generate a dynamic background image via HuggingFace")
async def get_region_image(prompt: str):
    try:
        image_bytes = await generate_region_image(prompt)
        return StreamingResponse(io.BytesIO(image_bytes), media_type="image/jpeg")
    except Exception as e:
        logger.error(f"Image generation failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ─── WEBSOCKET: MULTIPLAYER ────────────────────────────────────────────────
class MovePayload(BaseModel):
    x: float
    y: float

@app.websocket("/ws/{session_id}/{player_name}")
async def websocket_endpoint(websocket: WebSocket, session_id: str, player_name: str):
    await manager.connect(websocket, session_id, player_name)
    logger.info(f"[WS] {player_name} joined session {session_id}")
    
    # Notify new player of who is already in the session
    await websocket.send_text(json.dumps({
        "type": "session_info",
        "players": manager.get_players(session_id)
    }))
    
    try:
        while True:
            raw = await websocket.receive_text()
            data = json.loads(raw)
            msg_type = data.get("type")

            if msg_type == "move":
                # Broadcast avatar position to other players
                await manager.broadcast(session_id, {
                    "type": "peer_move",
                    "player": player_name,
                    "x": data.get("x"),
                    "y": data.get("y")
                }, exclude=websocket)

            elif msg_type == "action_narration":
                # Broadcast Architect's narration to all players
                await manager.broadcast(session_id, {
                    "type": "action_narration",
                    "player": player_name,
                    "narration": data.get("narration"),
                    "outcome": data.get("outcome"),
                    "stage": data.get("stage")
                }, exclude=websocket)

            elif msg_type == "chat":
                # Simple in-game chat relay
                await manager.broadcast(session_id, {
                    "type": "chat",
                    "player": player_name,
                    "message": data.get("message")
                }, exclude=websocket)

    except WebSocketDisconnect:
        manager.disconnect(websocket, session_id)
        await manager.broadcast(session_id, {
            "type": "player_left",
            "player": player_name,
            "players": manager.get_players(session_id)
        })
        logger.info(f"[WS] {player_name} disconnected from session {session_id}")

@app.get("/")
def read_root():
    return {"message": "Realm Forge API running. WebSocket: ws://localhost:8000/ws/{session_id}/{player_name}"}
