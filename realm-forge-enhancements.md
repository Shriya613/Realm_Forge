# Realm Forge — Drop-in Enhancement Code

---

## PART 1: Gemini Faction Portraits (Backend — portraits.py)

Add this as a new file `backend/portraits.py`.
Call `generate_faction_portraits(world_json)` right after world gen.

```python
# backend/portraits.py
import os
import base64
import asyncio
import httpx

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
GEMINI_IMAGE_URL = "https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict"

async def generate_portrait(faction: dict, world_theme: str) -> str:
    """
    Generate a portrait for a faction leader using Gemini Imagen.
    Returns base64-encoded PNG string.
    """
    personality_map = {
        "aggressive": "battle-scarred warrior, fierce eyes, war paint",
        "cunning": "sharp eyes, smirk, elaborate clothing, many pockets",
        "defensive": "heavy armor, cautious expression, shield emblem",
        "diplomatic": "elegant robes, open hands, wise expression"
    }

    personality_desc = personality_map.get(
        faction.get("personality", "aggressive"),
        "mysterious figure"
    )

    prompt = (
        f"Fantasy RPG character portrait, pixel art style, "
        f"faction leader named '{faction['name']}', "
        f"{personality_desc}, "
        f"world theme: {world_theme}. "
        f"Square portrait format, dark dramatic background, "
        f"detailed face, glowing eyes, cinematic lighting. "
        f"No text, no watermarks."
    )

    payload = {
        "instances": [{"prompt": prompt}],
        "parameters": {
            "sampleCount": 1,
            "aspectRatio": "1:1",
            "outputMimeType": "image/png"
        }
    }

    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.post(
            f"{GEMINI_IMAGE_URL}?key={GEMINI_API_KEY}",
            json=payload
        )
        response.raise_for_status()
        data = response.json()
        # Returns base64 image data
        return data["predictions"][0]["bytesBase64Encoded"]


async def generate_faction_portraits(world: dict) -> dict:
    """
    Generate portraits for all factions in parallel.
    Adds 'portrait_b64' field to each faction.
    Returns updated world dict.
    """
    theme = world.get("theme", "fantasy")
    factions = world.get("factions", [])

    # Generate all portraits in parallel
    tasks = [generate_portrait(faction, theme) for faction in factions]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    for faction, result in zip(factions, results):
        if isinstance(result, Exception):
            print(f"Portrait generation failed for {faction['name']}: {result}")
            faction["portrait_b64"] = None  # frontend will use fallback
        else:
            faction["portrait_b64"] = result

    world["factions"] = factions
    return world
```

### Wire into world_gen endpoint (backend/main.py)

```python
# In your /generate-world endpoint, after getting world JSON:
from backend.portraits import generate_faction_portraits

@app.post("/generate-world")
async def generate_world(request: WorldGenRequest):
    # ... your existing world gen code ...
    world = await call_mistral_world_gen(request.prompt)
    
    # Add portraits (runs in parallel, ~3-5 seconds)
    world = await generate_faction_portraits(world)
    
    return {"status": "success", "data": world}
```

### Display portrait in Phaser (frontend)

```javascript
// In your action panel scene, when player enters a region:
function showFactionEncounter(faction, regionData) {
    // Get portrait from world data
    const portraitB64 = faction.portrait_b64;
    
    if (portraitB64) {
        // Create image element overlaid on Phaser canvas
        const img = document.createElement('img');
        img.src = `data:image/png;base64,${portraitB64}`;
        img.className = 'faction-portrait';
        document.getElementById('game-container').appendChild(img);
    }
    
    // Show faction name
    document.getElementById('faction-name').textContent = faction.name;
}
```

```css
/* CSS for portrait display */
.faction-portrait {
    position: absolute;
    bottom: 120px;
    right: 260px;
    width: 140px;
    height: 140px;
    border-radius: 8px;
    border: 2px solid #00ffcc;
    box-shadow: 0 0 20px rgba(0, 255, 204, 0.4);
    image-rendering: pixelated;
    animation: portraitReveal 0.3s ease-out;
    z-index: 100;
}

@keyframes portraitReveal {
    from { opacity: 0; transform: scale(0.8) translateY(10px); }
    to   { opacity: 1; transform: scale(1) translateY(0); }
}
```

---

## PART 2: CSS Animated Map Sprites (Frontend — sprites.js)

No assets needed. Pure CSS characters that animate on the Phaser canvas overlay.
Add a `<div id="sprite-layer">` on top of your Phaser canvas.

```javascript
// frontend/sprites.js

const SPRITE_TYPES = {
    player: {
        body: '#00ffcc',
        accent: '#ffffff',
        label: '🦊' // your existing fox avatar - keep it
    },
    enemy: {
        body: '#ff4444',
        accent: '#ff8800',
        label: '👾'
    },
    npc: {
        body: '#ffcc00',
        accent: '#ffffff',
        label: '🧙'
    }
};

class MapSprite {
    constructor(type, x, y, name = '') {
        this.type = type;
        this.x = x;
        this.y = y;
        this.name = name;
        this.el = this.createElement();
        this.roamTarget = { x, y };
        this.roamInterval = null;
    }

    createElement() {
        const config = SPRITE_TYPES[this.type];
        const el = document.createElement('div');
        el.className = `map-sprite sprite-${this.type}`;
        el.innerHTML = `
            <div class="sprite-icon">${config.label}</div>
            <div class="sprite-shadow"></div>
            ${this.name ? `<div class="sprite-name">${this.name}</div>` : ''}
        `;
        el.style.left = `${this.x}px`;
        el.style.top = `${this.y}px`;
        document.getElementById('sprite-layer').appendChild(el);
        return el;
    }

    moveTo(x, y, duration = 1000) {
        this.x = x;
        this.y = y;
        this.el.style.transition = `left ${duration}ms linear, top ${duration}ms linear`;
        this.el.style.left = `${x}px`;
        this.el.style.top = `${y}px`;

        // Flip sprite direction
        if (x > this.x) {
            this.el.querySelector('.sprite-icon').style.transform = 'scaleX(1)';
        } else {
            this.el.querySelector('.sprite-icon').style.transform = 'scaleX(-1)';
        }
    }

    startRoaming(bounds, regionX, regionY, radius = 40) {
        // Wander around a region node
        this.roamInterval = setInterval(() => {
            const angle = Math.random() * Math.PI * 2;
            const dist = Math.random() * radius;
            const newX = Math.max(bounds.left, Math.min(bounds.right, regionX + Math.cos(angle) * dist));
            const newY = Math.max(bounds.top, Math.min(bounds.bottom, regionY + Math.sin(angle) * dist));
            this.moveTo(newX, newY, 1500 + Math.random() * 1000);
        }, 2000 + Math.random() * 1000);
    }

    stopRoaming() {
        if (this.roamInterval) clearInterval(this.roamInterval);
    }

    // Flash red when taking damage
    flashDamage() {
        this.el.style.filter = 'brightness(3) sepia(1) saturate(5) hue-rotate(-30deg)';
        setTimeout(() => { this.el.style.filter = ''; }, 300);
    }

    // Victory bounce
    celebrate() {
        this.el.style.animation = 'spriteCelebrate 0.5s ease-in-out 3';
        setTimeout(() => { this.el.style.animation = ''; }, 1500);
    }

    destroy() {
        this.stopRoaming();
        this.el.style.animation = 'spriteDestroy 0.4s ease-out forwards';
        setTimeout(() => this.el.remove(), 400);
    }
}

// Spawn enemy sprites near each region node
function spawnRegionEnemies(regions, canvasBounds) {
    const sprites = [];
    regions.forEach(region => {
        // Convert region position (0-100) to canvas pixels
        const x = (region.position.x / 100) * canvasBounds.width;
        const y = (region.position.y / 100) * canvasBounds.height;

        // 1-2 enemies per region
        const count = region.difficulty === 'hard' ? 2 : 1;
        for (let i = 0; i < count; i++) {
            const offsetX = x + (Math.random() - 0.5) * 60;
            const offsetY = y + (Math.random() - 0.5) * 60;
            const sprite = new MapSprite('enemy', offsetX, offsetY);
            sprite.startRoaming(canvasBounds, x, y);
            sprites.push(sprite);
        }
    });
    return sprites;
}

export { MapSprite, spawnRegionEnemies };
```

```css
/* Add to your main CSS */
#sprite-layer {
    position: absolute;
    top: 0; left: 0;
    width: 100%; height: 100%;
    pointer-events: none; /* don't block Phaser clicks */
    z-index: 10;
}

.map-sprite {
    position: absolute;
    display: flex;
    flex-direction: column;
    align-items: center;
    transform: translate(-50%, -50%);
    cursor: pointer;
    pointer-events: all;
}

.sprite-icon {
    font-size: 24px;
    animation: spriteIdle 1s ease-in-out infinite alternate;
    filter: drop-shadow(0 2px 4px rgba(0,0,0,0.8));
}

.sprite-shadow {
    width: 16px;
    height: 4px;
    background: rgba(0,0,0,0.4);
    border-radius: 50%;
    margin-top: -4px;
    animation: shadowPulse 1s ease-in-out infinite alternate;
}

.sprite-name {
    font-family: 'Press Start 2P', monospace;
    font-size: 8px;
    color: #00ffcc;
    text-shadow: 0 0 6px #00ffcc;
    margin-top: 2px;
    white-space: nowrap;
}

.sprite-enemy .sprite-icon {
    animation: spriteIdle 0.7s ease-in-out infinite alternate,
               enemyGlow 2s ease-in-out infinite;
}

@keyframes spriteIdle {
    from { transform: translateY(0px) scaleX(var(--dir, 1)); }
    to   { transform: translateY(-4px) scaleX(var(--dir, 1)); }
}

@keyframes shadowPulse {
    from { transform: scaleX(1); opacity: 0.4; }
    to   { transform: scaleX(0.7); opacity: 0.2; }
}

@keyframes enemyGlow {
    0%, 100% { filter: drop-shadow(0 0 4px #ff4444); }
    50%       { filter: drop-shadow(0 0 8px #ff8800); }
}

@keyframes spriteCelebrate {
    0%   { transform: translate(-50%, -50%) scale(1) rotate(0deg); }
    25%  { transform: translate(-50%, -60%) scale(1.2) rotate(-10deg); }
    75%  { transform: translate(-50%, -60%) scale(1.2) rotate(10deg); }
    100% { transform: translate(-50%, -50%) scale(1) rotate(0deg); }
}

@keyframes spriteDestroy {
    0%   { opacity: 1; transform: translate(-50%, -50%) scale(1); }
    50%  { opacity: 0.5; transform: translate(-50%, -70%) scale(1.3); }
    100% { opacity: 0; transform: translate(-50%, -90%) scale(0); }
}
```

### Wire into your Phaser WorldScene

```javascript
// In your WorldScene, after world JSON arrives:
import { spawnRegionEnemies, MapSprite } from './sprites.js';

// After map renders:
const canvasBounds = {
    left: 0, top: 0,
    width: this.scale.width,
    height: this.scale.height
};

// Spawn enemies near each region
this.enemySprites = spawnRegionEnemies(worldData.regions, canvasBounds);

// When player conquers a region, destroy its enemies
function onRegionConquered(regionId) {
    this.enemySprites
        .filter(s => s.regionId === regionId)
        .forEach(s => { s.celebrate(); setTimeout(() => s.destroy(), 1500); });
}
```

---

## PART 3: ElevenLabs SFX + Music (Backend — audio.py)

```python
# backend/audio.py
import os
import base64
import httpx

ELEVENLABS_API_KEY = os.getenv("ELEVENLABS_API_KEY")

# --- TTS (existing, keep this) ---
async def text_to_speech(text: str, voice_id: str = "21m00Tcm4TlvDq8ikWAM") -> bytes:
    """Convert narration text to speech. Returns audio bytes."""
    async with httpx.AsyncClient(timeout=20) as client:
        response = await client.post(
            f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}",
            headers={
                "xi-api-key": ELEVENLABS_API_KEY,
                "Content-Type": "application/json"
            },
            json={
                "text": text,
                "model_id": "eleven_multilingual_v2",
                "voice_settings": {
                    "stability": 0.5,
                    "similarity_boost": 0.8
                }
            }
        )
        response.raise_for_status()
        return response.content  # raw MP3 bytes


# --- SFX Generation ---
async def generate_sfx(description: str, duration: float = 2.0) -> bytes:
    """
    Generate a sound effect using ElevenLabs SFX.
    Returns MP3 bytes.
    
    Example descriptions:
    - "sword clash metal impact short"
    - "magical spell whoosh mystical"
    - "cave ambience dripping echo"
    - "victory fanfare triumphant short"
    - "danger sting tense short"
    """
    async with httpx.AsyncClient(timeout=20) as client:
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


# --- Pre-generate SFX at world gen time ---
# Map of game events to SFX descriptions
SFX_LIBRARY = {
    "approach":   "tense mysterious footsteps slow approach",
    "challenge":  "combat encounter dramatic sting",
    "success":    "victory chime short triumphant",
    "failure":    "defeat sting dark short",
    "partial":    "ambiguous outcome neutral short",
    "conquered":  "region conquered fanfare epic short",
    "boss_intro": "boss encounter massive dramatic impact",
    "level_up":   "level up chime bright ascending",
    "button_click": "UI click select short crisp"
}

async def generate_sfx_library() -> dict:
    """
    Pre-generate all SFX at world gen time.
    Returns dict of {event_name: base64_audio}.
    """
    import asyncio
    
    async def gen_one(key, description):
        try:
            audio_bytes = await generate_sfx(description, duration=1.5)
            return key, base64.b64encode(audio_bytes).decode()
        except Exception as e:
            print(f"SFX generation failed for {key}: {e}")
            return key, None
    
    tasks = [gen_one(k, v) for k, v in SFX_LIBRARY.items()]
    results = await asyncio.gather(*tasks)
    return dict(results)


# --- Music Generation ---
async def generate_region_music(region_name: str, faction_personality: str, world_theme: str) -> bytes:
    """
    Generate ambient music for a region.
    ElevenLabs Music API - returns MP3 bytes.
    """
    music_prompt = (
        f"Fantasy RPG ambient background music, "
        f"{faction_personality} mood, "
        f"{world_theme} theme, "
        f"looping, no vocals, cinematic, "
        f"suitable for {region_name}"
    )
    
    async with httpx.AsyncClient(timeout=40) as client:
        response = await client.post(
            "https://api.elevenlabs.io/v1/text-to-sound-effects",  
            headers={
                "xi-api-key": ELEVENLABS_API_KEY,
                "Content-Type": "application/json"
            },
            json={
                "text": music_prompt,
                "duration_seconds": 30.0,  # 30s loop
                "prompt_influence": 0.5
            }
        )
        response.raise_for_status()
        return response.content
```

### FastAPI endpoint to serve audio

```python
# In backend/main.py — add these endpoints:
from fastapi.responses import Response
from backend.audio import text_to_speech, generate_sfx_library

@app.post("/tts")
async def tts_endpoint(request: TTSRequest):
    """Convert DM narration to speech."""
    audio_bytes = await text_to_speech(request.text, request.voice_id)
    return Response(content=audio_bytes, media_type="audio/mpeg")

@app.get("/sfx-library")
async def get_sfx_library():
    """Pre-generate and return all SFX as base64."""
    library = await generate_sfx_library()
    return {"status": "success", "sfx": library}
```

### Play audio in Phaser (frontend/audio.js)

```javascript
// frontend/audio.js

class GameAudio {
    constructor() {
        this.sfxLibrary = {};
        this.currentMusic = null;
        this.isMuted = false;
    }

    async loadSFXLibrary() {
        // Load pre-generated SFX at game start
        const response = await fetch('/sfx-library');
        const data = await response.json();
        this.sfxLibrary = data.sfx;
        console.log('SFX library loaded:', Object.keys(this.sfxLibrary));
    }

    playSFX(eventName) {
        if (this.isMuted) return;
        const b64 = this.sfxLibrary[eventName];
        if (!b64) return;

        const audio = new Audio(`data:audio/mpeg;base64,${b64}`);
        audio.volume = 0.6;
        audio.play().catch(() => {}); // ignore autoplay errors
    }

    async playTTS(text, voiceId) {
        if (this.isMuted) return;
        
        const response = await fetch('/tts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text, voice_id: voiceId })
        });
        
        const audioBlob = await response.blob();
        const audioUrl = URL.createObjectURL(audioBlob);
        const audio = new Audio(audioUrl);
        audio.volume = 0.9;
        await audio.play();
        
        // Clean up blob URL after playing
        audio.addEventListener('ended', () => URL.revokeObjectURL(audioUrl));
        return audio;
    }

    stopMusic() {
        if (this.currentMusic) {
            this.currentMusic.pause();
            this.currentMusic = null;
        }
    }

    toggleMute() {
        this.isMuted = !this.isMuted;
        if (this.isMuted) this.stopMusic();
        return this.isMuted;
    }
}

// Usage in your game scenes:
const audio = new GameAudio();
await audio.loadSFXLibrary(); // call once at game start

// When player clicks a choice button:
audio.playSFX('button_click');

// When action resolves:
audio.playSFX(outcome); // 'success', 'failure', 'partial'
await audio.playTTS(narrationText, factionVoiceId);

// When region is conquered:
audio.playSFX('conquered');

// When boss appears:
audio.playSFX('boss_intro');
```

---

## PART 4: Voxtral Push-to-Talk (Backend + Frontend)

### Backend (backend/voice.py)

```python
# backend/voice.py
import os
import base64
import httpx

MISTRAL_API_KEY = os.getenv("MISTRAL_API_KEY")

async def transcribe_audio(audio_b64: str, language: str = "en") -> str:
    """
    Transcribe audio using Voxtral Mini Transcribe V2.
    audio_b64: base64-encoded audio (webm/wav from browser MediaRecorder)
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
                "model": "voxtral-mini-transcribe-2",
                "audio": {
                    "type": "base64",
                    "data": audio_b64
                },
                "language": language,
                # Context biasing — help Voxtral understand game terms
                "context": "Fantasy RPG game. Player commands include: attack, scout, negotiate, sneak, retreat, use item, cast spell, flee, approach, challenge."
            }
        )
        response.raise_for_status()
        data = response.json()
        return data.get("text", "").strip()
```

### FastAPI endpoint

```python
# In backend/main.py:
from backend.voice import transcribe_audio
from pydantic import BaseModel

class TranscribeRequest(BaseModel):
    audio_b64: str
    language: str = "en"

@app.post("/transcribe")
async def transcribe_endpoint(request: TranscribeRequest):
    """Transcribe player voice command via Voxtral."""
    try:
        text = await transcribe_audio(request.audio_b64, request.language)
        return {"status": "success", "text": text}
    except Exception as e:
        return {"status": "error", "text": "", "error": str(e)}
```

### Frontend push-to-talk (frontend/voxtral.js)

```javascript
// frontend/voxtral.js
// Drop this in and call initPushToTalk(onTranscribed)
// onTranscribed is your callback that receives the transcribed text

class PushToTalk {
    constructor(onTranscribed) {
        this.onTranscribed = onTranscribed;
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.isRecording = false;
        this.stream = null;
        
        this.initUI();
        this.initKeyboard();
    }

    async initMicrophone() {
        if (this.stream) return; // already initialized
        try {
            this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch (e) {
            console.error('Microphone access denied:', e);
            alert('Please allow microphone access for voice commands.');
        }
    }

    initUI() {
        // Add PTT button to your game UI
        const btn = document.createElement('button');
        btn.id = 'ptt-btn';
        btn.innerHTML = '🎤 Hold V';
        btn.className = 'ptt-button';
        document.getElementById('game-container').appendChild(btn);

        btn.addEventListener('mousedown', () => this.startRecording());
        btn.addEventListener('mouseup', () => this.stopRecording());
        btn.addEventListener('touchstart', (e) => { e.preventDefault(); this.startRecording(); });
        btn.addEventListener('touchend', (e) => { e.preventDefault(); this.stopRecording(); });
    }

    initKeyboard() {
        document.addEventListener('keydown', (e) => {
            if (e.code === 'KeyV' && !e.repeat && !this.isRecording) {
                this.startRecording();
            }
        });
        document.addEventListener('keyup', (e) => {
            if (e.code === 'KeyV') {
                this.stopRecording();
            }
        });
    }

    async startRecording() {
        await this.initMicrophone();
        if (!this.stream || this.isRecording) return;

        this.audioChunks = [];
        this.isRecording = true;

        this.mediaRecorder = new MediaRecorder(this.stream, {
            mimeType: 'audio/webm;codecs=opus'
        });

        this.mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) this.audioChunks.push(e.data);
        };

        this.mediaRecorder.start(100); // collect in 100ms chunks

        // UI feedback
        document.getElementById('ptt-btn').classList.add('recording');
        document.getElementById('ptt-btn').innerHTML = '🔴 Recording...';
        
        // Show in co-op comms panel
        this.appendToComms('🎤 Voice active — speak now');
    }

    async stopRecording() {
        if (!this.isRecording || !this.mediaRecorder) return;
        this.isRecording = false;

        this.mediaRecorder.stop();

        // Wait for final data
        await new Promise(resolve => {
            this.mediaRecorder.onstop = resolve;
        });

        document.getElementById('ptt-btn').classList.remove('recording');
        document.getElementById('ptt-btn').innerHTML = '🎤 Hold V';

        if (this.audioChunks.length === 0) return;

        // Convert to base64
        const blob = new Blob(this.audioChunks, { type: 'audio/webm' });
        const b64 = await this.blobToBase64(blob);

        // Show processing indicator
        this.appendToComms('⌛ Transcribing...');

        // Send to Voxtral
        try {
            const response = await fetch('/transcribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ audio_b64: b64 })
            });
            const data = await response.json();
            
            if (data.status === 'success' && data.text) {
                this.appendToComms(`🗣️ You: "${data.text}"`);
                this.onTranscribed(data.text); // pass to your action pipeline
            } else {
                this.appendToComms('❌ Could not understand. Try again.');
            }
        } catch (e) {
            this.appendToComms('❌ Voice error. Use text input.');
            console.error('Transcription error:', e);
        }
    }

    blobToBase64(blob) {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => {
                // Strip the data URL prefix to get pure base64
                const b64 = reader.result.split(',')[1];
                resolve(b64);
            };
            reader.readAsDataURL(blob);
        });
    }

    appendToComms(message) {
        const commsLog = document.getElementById('comms-log');
        if (commsLog) {
            const line = document.createElement('div');
            line.className = 'comms-line';
            line.textContent = message;
            commsLog.appendChild(line);
            commsLog.scrollTop = commsLog.scrollHeight;
        }
    }
}

// Usage — drop this in your main game init:
// const ptt = new PushToTalk((transcribedText) => {
//     // This fires when Voxtral returns text
//     // Pass it to your existing text command handler
//     handlePlayerTextCommand(transcribedText);
// });

export { PushToTalk };
```

```css
/* PTT Button styling */
.ptt-button {
    position: absolute;
    bottom: 80px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(0, 255, 204, 0.15);
    border: 2px solid #00ffcc;
    color: #00ffcc;
    font-family: 'Press Start 2P', monospace;
    font-size: 10px;
    padding: 8px 16px;
    cursor: pointer;
    border-radius: 4px;
    z-index: 200;
    transition: all 0.1s;
}

.ptt-button:hover {
    background: rgba(0, 255, 204, 0.3);
}

.ptt-button.recording {
    background: rgba(255, 68, 68, 0.3);
    border-color: #ff4444;
    color: #ff4444;
    box-shadow: 0 0 15px rgba(255, 68, 68, 0.5);
    animation: recordingPulse 0.8s ease-in-out infinite;
}

@keyframes recordingPulse {
    0%, 100% { box-shadow: 0 0 10px rgba(255, 68, 68, 0.5); }
    50%       { box-shadow: 0 0 25px rgba(255, 68, 68, 0.9); }
}
```

---

## PART 5: Progress Bar + Win Condition (Frontend — hud.js)

The simplest and most impactful fix. Add this to your HUD.

```javascript
// frontend/hud.js — add to your existing HUD update function

function updateProgressHUD(worldData, gameState) {
    const regions = worldData.regions;
    const totalRegions = regions.length;
    
    // Count conquered (exclude the boss region)
    const conquered = gameState.conquered_regions?.length ?? 0;
    const toConquer = totalRegions - 1; // last region is boss
    const bossUnlocked = conquered >= toConquer;
    
    // Progress bar fill
    const pct = Math.min(100, (conquered / toConquer) * 100);
    document.getElementById('progress-fill').style.width = `${pct}%`;
    document.getElementById('progress-text').textContent = 
        bossUnlocked
            ? `⚔️ BOSS UNLOCKED`
            : `${conquered} / ${toConquer} NODES`;
    
    // Flash when boss unlocks
    if (bossUnlocked) {
        document.getElementById('progress-bar').classList.add('boss-ready');
    }
    
    // Win condition tooltip (shown at game start)
    document.getElementById('win-condition').textContent = 
        `OBJECTIVE: ${worldData.win_condition ?? `Conquer all ${toConquer} nodes to face ${worldData.boss.name}`}`;
}
```

```html
<!-- Add to your game HTML, inside your HUD area -->
<div id="progress-container">
    <div id="win-condition">Loading objective...</div>
    <div id="progress-bar">
        <div id="progress-fill"></div>
        <span id="progress-text">0 / 5 NODES</span>
    </div>
</div>
```

```css
#progress-container {
    position: absolute;
    top: 50px;
    left: 50%;
    transform: translateX(-50%);
    text-align: center;
    z-index: 100;
}

#win-condition {
    font-family: 'Press Start 2P', monospace;
    font-size: 8px;
    color: #888;
    margin-bottom: 6px;
}

#progress-bar {
    width: 300px;
    height: 20px;
    background: rgba(0,0,0,0.5);
    border: 1px solid #00ffcc44;
    border-radius: 3px;
    position: relative;
    overflow: hidden;
}

#progress-fill {
    height: 100%;
    background: linear-gradient(90deg, #00ffcc, #00aaff);
    transition: width 0.5s ease-out;
    box-shadow: 0 0 10px #00ffcc;
}

#progress-text {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    font-family: 'Press Start 2P', monospace;
    font-size: 8px;
    color: white;
    text-shadow: 0 0 4px black;
}

#progress-bar.boss-ready {
    border-color: #ff4444;
    animation: bossReadyPulse 1s ease-in-out infinite;
}

@keyframes bossReadyPulse {
    0%, 100% { box-shadow: 0 0 5px #ff4444; }
    50%       { box-shadow: 0 0 20px #ff4444; }
}
```

### Add win_condition to world gen prompt

In your `world_gen_system.txt`, add this field to the OUTPUT SCHEMA under `boss`:

```
"win_condition": "string — one sentence describing what the player must do to win, e.g. 'Expose Admiral Vex's betrayal by conquering all 5 nodes and facing him at the Obsidian Spire'"
```

---

## Integration Checklist

```
[ ] Add GEMINI_API_KEY to your .env
[ ] backend/portraits.py → wire into /generate-world
[ ] frontend: add #sprite-layer div above Phaser canvas
[ ] frontend/sprites.js → import and call spawnRegionEnemies after world renders
[ ] backend/audio.py → wire /tts and /sfx-library endpoints  
[ ] frontend/audio.js → load SFX at game start, call playSFX on events
[ ] backend/voice.py → wire /transcribe endpoint
[ ] frontend/voxtral.js → init PushToTalk with your handlePlayerTextCommand callback
[ ] frontend: add #progress-container to HUD HTML
[ ] frontend/hud.js → call updateProgressHUD after every action
[ ] world_gen_system.txt → add win_condition field to schema
```
