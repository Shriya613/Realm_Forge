from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import logging
import io
import json

from backend.world_gen import generate_world
from backend.game_logic import process_action
from backend.state_store import (
    create_session, get_session, update_session,
    increment_region_turn, reset_region_turn, complete_quest_for_region
)
from backend.narration import generate_narration
from backend.hf_image import generate_region_image
from backend.ws_manager import manager
from backend.voice import transcribe_audio
from backend.audio import generate_sfx_library
from backend.portraits import generate_faction_portraits

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

class ResetWorldRequest(BaseModel):
    session_id: str = "demo_session"

@app.post("/reset-world", summary="Reset world progress (3-strike defeat)")
async def reset_world(request: ResetWorldRequest):
    """Clear conquered regions when player fails a node 3 times."""
    session = get_session(request.session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    session["conquered_regions"] = []
    return {"status": "success", "message": "World reset"}

RETRY_ENERGY_COST = 20

@app.post("/retry-node", summary="Deduct energy for retrying a defeated node")
async def retry_node(request: ResetWorldRequest):
    """Deduct 20 energy when player retries after defeat."""
    session = get_session(request.session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    player = session["players"][0]
    player["energy"] = max(0, player["energy"] - RETRY_ENERGY_COST)
    return {"status": "success", "energy": player["energy"]}

@app.post("/generate-world", summary="Generate a complete game world")
async def create_world(request: WorldRequest):
    """
    Generates world via Mistral Small, then adds Gemini faction portraits
    in parallel (non-blocking if portraits fail).
    """
    try:
        logger.info(f"Generating world with prompt: {request.prompt}")
        world_data = await generate_world(request.prompt)

        # Add Gemini faction portraits in parallel (gracefully skipped on error)
        try:
            world_data = await generate_faction_portraits(world_data)
            logger.info("[portraits] Faction portraits generated")
        except Exception as pe:
            logger.warning(f"[portraits] Skipped: {pe}")

        # Store session
        create_session(request.session_id, world_data, request.player_name)
        return {"status": "success", "data": world_data, "session_id": request.session_id}
    except Exception as e:
        logger.error(f"Error generating world: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/sfx-library", summary="Pre-generate SFX library via ElevenLabs")
async def get_sfx_library():
    """Called once at game start — generates all sound effects in parallel."""
    try:
        library = await generate_sfx_library()
        logger.info(f"[audio] SFX library generated: {list(library.keys())}")
        return {"status": "success", "sfx": library}
    except Exception as e:
        logger.error(f"[audio] SFX library failed: {e}")
        return {"status": "error", "sfx": {}}

@app.post("/action", summary="Submit a player action to the DM")
async def player_action(request: ActionRequest):
    try:
        session = get_session(request.session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")

        # Increment turn counter for this region
        turn_number = increment_region_turn(request.session_id, request.region_id)
        logger.info(f"[action] region={request.region_id} turn={turn_number}")
        
        # Inject context for what region this action is aimed at
        contextual_action = f"Target Region ID: {request.region_id}. Action text: {request.action}"
        
        dm_response = await process_action(contextual_action, session, request.region_id, turn_number)
        
        # Update session
        session['log'].append({"user": request.action, "dm": dm_response['narration']})
        
        player = session['players'][0]
        state_changes = dm_response['state_changes']
        
        player['xp'] += state_changes['xp_gained']
        new_hp = max(0, min(player['max_hp'], player['hp'] + state_changes['hp_delta']))
        defeated = new_hp <= 0
        if defeated:
            new_hp = 15  # Defeat survival (v2 mechanic)
        player['hp'] = new_hp
        player['energy'] = max(0, min(player['max_energy'], player['energy'] + state_changes['energy_delta']))
        
        if state_changes['loot_dropped']:
            player['inventory'].extend(state_changes['loot_dropped'])
            
        story_bridge = None
        if state_changes['region_status'] == "conquered":
            if request.region_id not in session.get('conquered_regions', []):
                session['conquered_regions'].append(request.region_id)
            # Complete any quests tied to this region + award bonus XP
            complete_quest_for_region(request.session_id, request.region_id)
            quest_bonus = 25
            player['xp'] += quest_bonus
            logger.info(f"[quests] Region {request.region_id} conquered — quest complete, +{quest_bonus} XP")
            reset_region_turn(request.session_id, request.region_id)

            # ── Build story bridge from chapter_outro + next chapter_intro ──
            world = session.get('world', {})
            regions = world.get('regions', [])
            conquered_id = request.region_id
            region_idx = next((i for i, r in enumerate(regions) if r.get('id') == conquered_id), -1)
            current_region = regions[region_idx] if region_idx >= 0 else {}
            next_region = regions[region_idx + 1] if region_idx >= 0 and region_idx + 1 < len(regions) else None

            story_bridge = {
                "outro": current_region.get("chapter_outro", ""),
                "next_region_name": next_region.get("name", "") if next_region else None,
                "next_intro": next_region.get("chapter_intro", "") if next_region else None,
                "is_final": next_region is None,
            }

        return {
            "status": "success",
            "response": dm_response,
            "xp": player['xp'],
            "hp": player['hp'],
            "energy": player['energy'],
            "inventory": player['inventory'],
            "active_quests": session.get('active_quests', []),
            "stage": dm_response.get("stage", "approach"),
            "choices": dm_response.get("choices", []),
            "defeated": defeated,
            "turn_number": turn_number,
            "story_bridge": story_bridge,
        }
    except Exception as e:
        logger.error(f"Error processing action: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/quests/{session_id}", summary="Get quest state for a session")
async def get_quests(session_id: str):
    """Return the active_quests list for a session so the frontend can render a tracker."""
    session = get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return {"status": "success", "quests": session.get("active_quests", [])}


class NarrationRequest(BaseModel):
    text: str
    voice_id: str = "JBFqnCBcs6831ApcRzwK"

class TranscribeRequest(BaseModel):
    audio_b64: str
    language: str = "en"

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


@app.post("/transcribe", summary="Transcribe player voice via Voxtral")
async def transcribe_endpoint(request: TranscribeRequest):
    """Receive base64 audio from frontend PTT, return transcribed text via Voxtral."""
    try:
        text = await transcribe_audio(request.audio_b64, request.language)
        logger.info(f"[Voxtral] Transcribed: '{text}'")
        return {"status": "success", "text": text}
    except Exception as e:
        logger.error(f"[Voxtral] Transcription failed: {e}")
        return {"status": "error", "text": "", "error": str(e)}


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

@app.get("/session/{session_id}", summary="Get world data for an existing session")
async def get_session_data(session_id: str):
    session = get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return {
        "session_id": session_id,
        "world": session.get("world"),
        "players": [p["name"] for p in session.get("players", [])]
    }

@app.get("/")
def read_root():
    return {"message": "Realm Forge API running. WebSocket: ws://localhost:8000/ws/{session_id}/{player_name}"}
