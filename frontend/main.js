let playerName = "Guest";
let currentSessionId = "demo_session_" + Math.floor(Math.random() * 10000);
let worldData = null;
let currentRegionId = null;

// DOM Elements
const uiLayer = document.getElementById('ui-layer');
const loginScreen = document.getElementById('login-screen');
const promptScreen = document.getElementById('prompt-screen');
const loadingScreen = document.getElementById('loading-screen');
const loadingStatus = document.getElementById('loading-status');
const gameInterface = document.getElementById('game-interface');

// HUD
const hudName = document.getElementById('hud-name');
const hudXp = document.getElementById('hud-xp');
const hudWorld = document.getElementById('hud-world');

// Main Content
const dynamicBg = document.getElementById('dynamic-bg');
const regionsList = document.getElementById('regions-list');
const currentRegionName = document.getElementById('current-region-name');
const currentRegionDesc = document.getElementById('current-region-desc');
const dmText = document.getElementById('dm-text');
const actionButtons = document.getElementById('action-buttons');
const imageLoader = document.getElementById('image-loading-spinner');

// RPG Stats
const hudHp = document.getElementById('hud-hp');
const hudEnergy = document.getElementById('hud-energy');
const inventoryList = document.getElementById('inventory-list');

// Minigame
const minigameOverlay = document.getElementById('minigame-overlay');
const cursor = document.getElementById('hack-cursor');
const btnHackStop = document.getElementById('btn-hack-stop');
let minigameInterval;
let cursorPosition = 0;
let cursorDirection = 1;

// Default starting background (Cyber theme placeholder)
dynamicBg.style.backgroundImage = "url('https://images.unsplash.com/photo-1601042879364-f3947d3f9c16?ixlib=rb-4.0.3&auto=format&fit=crop&w=1920&q=80')";

// --- FLOW 1: LOGIN ---
document.getElementById('btn-next').addEventListener('click', () => {
    const nameInput = document.getElementById('char-name').value.trim();
    if (nameInput) {
        playerName = nameInput.toUpperCase();
        hudName.innerText = playerName;
        loginScreen.classList.remove('active');
        setTimeout(() => promptScreen.classList.add('active'), 400); 
    } else {
        alert("Enter your callsign protocol.");
    }
});

// --- FLOW 2: PROMPT ---
document.getElementById('btn-generate').addEventListener('click', async () => {
    const promptInput = document.getElementById('world-prompt').value.trim();
    if (promptInput) {
        promptScreen.classList.remove('active');
        setTimeout(() => {
            loadingScreen.classList.add('active');
            loadingStatus.innerText = "The Architect is building reality clusters from the prompt...";
            generateWorld(promptInput);
        }, 400);
    } else {
        alert("Define the simulation parameters.");
    }
});

// --- API: Generate World ---
async function generateWorld(promptString) {
    try {
        const response = await fetch('http://127.0.0.1:8000/generate-world', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: promptString, player_name: playerName, session_id: currentSessionId })
        });
        
        if (!response.ok) throw new Error("Server Error");
        
        const data = await response.json();
        worldData = data.data;

        loadingStatus.innerText = "Nodes established. Connecting sensory link...";
        
        setTimeout(() => {
            enterGame();
        }, 1500);

    } catch (e) {
        console.error(e);
        loadingStatus.innerText = "Connection lost. Using localized backup matrix...";
        // For hackathon fallback: Implement fallback logic if needed
    }
}

// --- ENTER DOM GAME ---
function enterGame() {
    uiLayer.classList.remove('active');
    
    // Play sci-fi background track
    const bgm = document.getElementById('bg-music');
    if (bgm) {
        bgm.volume = 0.3;
        bgm.play().catch(e => console.log("Audio play blocked", e));
    }
    
    setTimeout(() => {
        uiLayer.classList.add('hidden');
        gameInterface.classList.remove('hidden');
        hudWorld.innerText = worldData.world_name.toUpperCase();
        
        renderRegions();
    }, 500);
}

function renderRegions() {
    regionsList.innerHTML = "";
    worldData.regions.forEach(region => {
        const btn = document.createElement('div');
        btn.className = 'region-btn';
        btn.innerHTML = `
            <span class="region-name">${region.name}</span>
            <span class="region-diff">DANGER: ${region.difficulty}</span>
        `;
        
        btn.addEventListener('click', () => {
            // Remove active from others
            document.querySelectorAll('.region-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            selectRegion(region);
        });
        
        regionsList.appendChild(btn);
    });
}

function selectRegion(region) {
    currentRegionId = region.id;
    currentRegionName.innerText = region.name.toUpperCase();
    currentRegionDesc.innerText = region.description + "\n\nSTRATEGIC INTEL: " + region.strategic_value;
    
    // Reset Action Box
    actionButtons.classList.remove('hidden');
    dmText.innerHTML = "Node selected. Awaiting directive.";
    dmText.style.color = "#00ffcc";

    // Request dynamic background from HuggingFace
    imageLoader.classList.remove('hidden');
    dynamicBg.classList.remove('focus');
    
    const bgUrl = `http://127.0.0.1:8000/region-image?prompt=${encodeURIComponent(region.description)}`;
    
    const newBg = new Image();
    newBg.src = bgUrl;
    newBg.onload = () => {
        dynamicBg.style.backgroundImage = `url('${bgUrl}')`;
        dynamicBg.classList.add('focus');
        imageLoader.classList.add('hidden');
    };
    newBg.onerror = () => {
        imageLoader.classList.add('hidden');
    };
}

// --- API: Actions ---
document.querySelectorAll('.action-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        if(!currentRegionId) return;
        const actionType = btn.getAttribute('data-action');
        
        if (actionType === "HACK") {
            startMinigame();
        } else {
            sendAction(actionType);
        }
    });
});

function startMinigame() {
    actionButtons.classList.add('hidden');
    minigameOverlay.classList.remove('hidden');
    dmText.innerText = "Bypassing ICE... Sync your cycle to breach the node.";
    dmText.style.color = "#ff00cc";
    
    // Simple pendulum loop
    cursorPosition = 0;
    cursorDirection = 2; // speed
    minigameInterval = setInterval(() => {
        cursorPosition += cursorDirection;
        if(cursorPosition > 95 || cursorPosition < 0) {
            cursorDirection *= -1;
        }
        cursor.style.left = `${cursorPosition}%`;
    }, 20);
}

btnHackStop.addEventListener('click', () => {
    clearInterval(minigameInterval);
    minigameOverlay.classList.add('hidden');
    actionButtons.classList.remove('hidden');
    
    // Check if within green zone (roughly 40% to 60%)
    if(cursorPosition >= 40 && cursorPosition <= 60) {
        // Critical success
        sendAction("HACK with PERFECT stealth and critical breach, grabbing top-tier loot.");
    } else {
        // Failure or messy
        sendAction("HACK violently, triggering alarms and risking taking heavy damage.");
    }
});

async function sendAction(actionStr) {
    dmText.innerHTML = "Computing probabilities... Data stream active...";
    dmText.style.color = "#8ab4f8";
    actionButtons.classList.add('hidden'); // prevent double clicking
    
    try {
        const response = await fetch('http://127.0.0.1:8000/action', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: actionStr,
                region_id: currentRegionId,
                session_id: currentSessionId
            })
        });
        
        const data = await response.json();
        actionButtons.classList.remove('hidden');

        if (response.ok) {
            let textColor = "#fff";
            const dmResponse = data.response;
            if(dmResponse.outcome === "failure") textColor = "#ff3333";
            if(dmResponse.outcome === "success") textColor = "#00ffcc";
            if(dmResponse.outcome === "partial") textColor = "#ffcc00";

            dmText.innerText = dmResponse.narration;
            dmText.style.color = textColor;
            hudXp.innerText = data.xp;
            
            // Queue audio playback
            playNarration(dmResponse.narration);
        } else {
            dmText.innerText = "Error: Architect connection refused.";
        }
    } catch(e) {
        actionButtons.classList.remove('hidden');
        dmText.innerText = "Critical Fault: Architect unreachable.";
    }
}

async function playNarration(text) {
    try {
        const response = await fetch('http://127.0.0.1:8000/narration', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: text })
        });
        
        if (response.ok) {
            const blob = await response.blob();
            const audioUrl = URL.createObjectURL(blob);
            const audio = new Audio(audioUrl);
            audio.play();
        }
    } catch(e) {
        console.error("Narration Audio Failed:", e);
    }
}
