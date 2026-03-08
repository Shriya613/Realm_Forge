# Realm Forge — Powered by Mistral AI

An AI-powered turn-based adventure game where every world, story, and encounter is generated live by [Mistral AI](https://mistral.ai). No two playthroughs are the same. Can see demo by clicking realm_forge.mp4.
Built for the Mistral AI Hackathon 2026.

---

## What is it?

You enter a world prompt — _"a cyberpunk city in ruins"_ or _"an ancient elvish forest at war"_ — and Mistral generates a full world: factions, regions, lore, and a 7-turn story arc for every node you enter.

Each encounter plays out as a narrative RPG beat:

- The Architect (AI dungeon master) narrates the scene
- You pick from 3 context-aware choices (hover for hints)
- Your HP rises and falls based on how well you play
- Survive all 7 turns → node conquered. Lose HP → defeated, try again

The map connects nodes across difficulty tiers (Easy → Medium → Hard). Clear a full world to claim the trophy.

**AI stack:**

- **Mistral** (Ministral 8B) — world generation, dungeon master narration
- **ElevenLabs** — voice narration
- **Gemini** — faction portrait generation
- **Voxtral** — voice-to-text (push-to-talk)
- **HuggingFace** — region background images

---

## Requirements

- Python 3.10+
- Node.js 18+
- API keys for Mistral, ElevenLabs, HuggingFace, and Gemini

---

## Installation

**1. Clone the repo**

```bash
git clone <repo-url>
cd Mistral_hacked
```

**2. Set up API keys**

```bash
cp .env.example .env
# Open .env and fill in your API keys
```

**3. Make the launcher executable**

```bash
chmod +x start.sh
```

That's it. The launcher handles all Python and Node dependencies automatically.

---

## Running the Game

You need **two terminals** open — one for the backend, one for the frontend.

### ▶️ Start

**Terminal 1 — Backend (FastAPI)**

```bash
cd Mistral_hacked
source .venv/bin/activate          # activate virtual environment
uvicorn backend.main:app --host 127.0.0.1 --port 8000 --reload
```

**Terminal 2 — Frontend (Vite dev server)**

```bash
cd Mistral_hacked/frontend
npm install                         # only needed first time
npm run dev
```

Open **http://localhost:5174** in your browser to play.

---

### ⏹️ Stop

- **Backend:** Press `Ctrl + C` in Terminal 1
- **Frontend:** Press `Ctrl + C` in Terminal 2

---

### 🔁 Quick Restart (after code changes)

The backend runs with `--reload` so Python changes apply automatically.  
For frontend changes, Vite hot-reloads instantly — no restart needed.  
If something looks stale, do a hard refresh: `Cmd + Shift + R` (Mac) / `Ctrl + Shift + R` (Windows).

---

## Project structure

```
Mistral_hacked/
├── backend/
│   ├── main.py          # FastAPI routes (/generate-world, /action, /ws/...)
│   ├── game_logic.py    # Mistral DM narration + state_changes
│   ├── world_gen.py     # World + region generation
│   ├── state_store.py   # In-memory session state
│   ├── narration.py     # ElevenLabs TTS
│   ├── portraits.py     # Gemini faction portraits
│   ├── hf_image.py      # HuggingFace region backgrounds
│   └── voice.py         # Voxtral transcription
├── frontend/
│   ├── realm-forge-wired.jsx   # Main React game component
│   ├── main.jsx                # React entry point
│   └── index.html              # HTML shell
├── prompts/
│   ├── dm_system.txt    # Dungeon master system prompt (7-turn arc rules)
│   └── world_gen_system.txt
├── .env.example
├── requirements.txt
├── start.sh             # Single-command launcher
└── README.md
```

---

## API keys

| Key                  | Where to get it                        |
| -------------------- | -------------------------------------- |
| `MISTRAL_API_KEY`    | https://console.mistral.ai             |
| `ELEVENLABS_API_KEY` | https://elevenlabs.io                  |
| `HF_TOKEN`           | https://huggingface.co/settings/tokens |
| `GEMINI_API_KEY`     | https://aistudio.google.com/app/apikey |
