let playerName = "Guest";
let currentSessionId = "demo_session_" + Math.floor(Math.random() * 10000);
let worldData = null;
let currentRegionId = null;

// DOM Elements
const uiLayer = document.getElementById('ui-layer');
const loginScreen = document.getElementById('login-screen');
const rulesScreen = document.getElementById('rules-screen');
const promptScreen = document.getElementById('prompt-screen');
const loadingScreen = document.getElementById('loading-screen');
const loadingStatus = document.getElementById('loading-status');
const gameInterface = document.getElementById('game-interface');

// HUD & Views
const hudName = document.getElementById('hud-name');
const hudXp = document.getElementById('hud-xp');
const hudHp = document.getElementById('hud-hp');
const hudEnergy = document.getElementById('hud-energy');
const hudWorld = document.getElementById('hud-world');
const hudStatus = document.getElementById('hud-status');

const overworldMap = document.getElementById('overworld-map');
const regionEncounter = document.getElementById('region-encounter');
const playerAvatar = document.getElementById('player-avatar');

// Region Details
const dynamicBg = document.getElementById('dynamic-bg');
const inventoryList = document.getElementById('inventory-list');
const currentRegionName = document.getElementById('current-region-name');
const currentRegionDesc = document.getElementById('current-region-desc');
const dmText = document.getElementById('dm-text');
const actionButtons = document.getElementById('action-buttons');
const imageLoader = document.getElementById('image-loading-spinner');
const btnLeaveNode = document.getElementById('btn-leave-node');

// Minigame
const minigameOverlay = document.getElementById('minigame-overlay');
const cursor = document.getElementById('hack-cursor');
const btnHackStop = document.getElementById('btn-hack-stop');
let minigameInterval;
let cursorPosition = 0;
let cursorDirection = 1;

// Default starting background
dynamicBg.style.backgroundImage = "url('https://images.unsplash.com/photo-1601042879364-f3947d3f9c16?ixlib=rb-4.0.3&auto=format&fit=crop&w=1920&q=80')";

// --- FLOW: SCREENS ---
document.getElementById('btn-next').addEventListener('click', () => {
    const nameInput = document.getElementById('char-name').value.trim();
    if (nameInput) {
        playerName = nameInput.toUpperCase();
        hudName.innerText = playerName;
        loginScreen.classList.remove('active');
        setTimeout(() => rulesScreen.classList.add('active'), 400); 
    } else {
        alert("Enter your callsign protocol.");
    }
});

document.getElementById('btn-accept-rules').addEventListener('click', () => {
    rulesScreen.classList.remove('active');
    setTimeout(() => promptScreen.classList.add('active'), 400);
});

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
        
        setTimeout(() => { enterGame(); }, 1500);
    } catch (e) {
        console.error(e);
        loadingStatus.innerText = "Connection lost. Using localized backup matrix...";
    }
}

// --- ENTER DOM GAME ---
function enterGame() {
    uiLayer.classList.remove('active');
    
    const bgm = document.getElementById('bg-music');
    if (bgm) { bgm.volume = 0.3; bgm.play().catch(e => console.log("Audio play blocked", e)); }
    
    setTimeout(() => {
        uiLayer.classList.add('hidden');
        gameInterface.classList.remove('hidden');
        hudWorld.innerText = worldData.world_name.toUpperCase();
        
        setupMapEngine();
    }, 500);
}

// --- GAME MAP ENGINE ---
let enemies = [];
let playerPos = { x: 50, y: 50 }; // % based
let gameLoopActive = false;
let canEnterNode = null;
let insideNode = false;

const keys = { w: false, a: false, s: false, d: false };

window.addEventListener('keydown', e => {
    if (uiLayer.classList.contains('active') || insideNode) return;
    const k = e.key.toLowerCase();
    if(k === 'w' || e.key === 'ArrowUp') keys.w = true;
    if(k === 'a' || e.key === 'ArrowLeft') keys.a = true;
    if(k === 's' || e.key === 'ArrowDown') keys.s = true;
    if(k === 'd' || e.key === 'ArrowRight') keys.d = true;
    
    if (e.key === 'e' || e.key === 'Enter') {
        if (canEnterNode) {
            triggerNodeEncounter(canEnterNode);
        }
    }
});

window.addEventListener('keyup', e => {
    const k = e.key.toLowerCase();
    if(k === 'w' || e.key === 'ArrowUp') keys.w = false;
    if(k === 'a' || e.key === 'ArrowLeft') keys.a = false;
    if(k === 's' || e.key === 'ArrowDown') keys.s = false;
    if(k === 'd' || e.key === 'ArrowRight') keys.d = false;
});

function setupMapEngine() {
    overworldMap.querySelectorAll('.overworld-node, .enemy').forEach(e => e.remove());
    enemies = [];
    
    // Create Realm Nodes
    worldData.regions.forEach((region, index) => {
        const mappedX = (Math.abs(region.position.x % 100)) || (15 + (index * 20) % 70);
        const mappedY = (Math.abs(region.position.y % 100)) || (15 + (index * 30) % 70);
        region.renderX = mappedX;
        region.renderY = mappedY;
        
        const node = document.createElement('div');
        node.className = 'overworld-node';
        node.style.left = `${mappedX}%`;
        node.style.top = `${mappedY}%`;
        node.innerHTML = `<span>${region.name}</span>`;
        
        overworldMap.appendChild(node);
        region.domNode = node;
    });

    // Create Roaming Enemies
    for(let i=0; i<4; i++) {
        const en = document.createElement('div');
        en.className = 'avatar-entity enemy';
        overworldMap.appendChild(en);
        enemies.push({
            el: en, 
            x: Math.random() * 80 + 10, 
            y: Math.random() * 80 + 10,
            dx: (Math.random() - 0.5) * 0.2, // fast roaming drift
            dy: (Math.random() - 0.5) * 0.2
        });
    }

    if (worldData.regions.length > 0) {
        playerPos.x = worldData.regions[0].renderX;
        playerPos.y = worldData.regions[0].renderY;
    }
    
    gameLoopActive = true;
    requestAnimationFrame(gameLoop);
}

function gameLoop() {
    if (!gameLoopActive) return;
    
    if (!insideNode) {
        const speed = 0.2; // roughly % of screen per frame
        if(keys.w) playerPos.y -= speed;
        if(keys.s) playerPos.y += speed;
        if(keys.a) playerPos.x -= speed * 1.5; // aspect ratio width comp
        if(keys.d) playerPos.x += speed * 1.5;
        
        playerPos.x = Math.max(2, Math.min(98, playerPos.x));
        playerPos.y = Math.max(2, Math.min(98, playerPos.y));
        
        playerAvatar.style.left = `${playerPos.x}%`;
        playerAvatar.style.top = `${playerPos.y}%`;
        
        // Move enemies
        enemies.forEach(en => {
            en.x += en.dx;
            en.y += en.dy;
            if(en.x < 1 || en.x > 99) en.dx *= -1;
            if(en.y < 1 || en.y > 99) en.dy *= -1;
            en.el.style.left = `${en.x}%`;
            en.el.style.top = `${en.y}%`;
            
            // Random combat encounter check
            const dist = Math.hypot(playerPos.x - en.x, playerPos.y - en.y);
            if (dist < 3) {
                en.dx *= -1; en.dy *= -1; // Bounce away
                triggerRandomEncounter();
            }
        });

        // Region Proximity Detect
        let closestNode = null;
        let pDist = 6;
        worldData.regions.forEach(r => {
            r.domNode.classList.remove('active-hover');
            const dist = Math.hypot(playerPos.x - r.renderX, playerPos.y - r.renderY);
            if (dist < pDist) {
                closestNode = r;
            }
        });

        canEnterNode = closestNode;
        if (canEnterNode) {
            canEnterNode.domNode.classList.add('active-hover');
            hudStatus.innerText = "PRESS 'E' TO ENTER";
            hudStatus.style.color = "#00ffcc";
        } else {
            hudStatus.innerText = "ONLINE";
            hudStatus.style.color = "#00ff00";
        }
    }
    
    requestAnimationFrame(gameLoop);
}

// --- NODE ENCOUNTERS ---
function triggerNodeEncounter(region) {
    insideNode = true;
    currentRegionId = region.id;
    
    // UI Transitions
    overworldMap.classList.add('hidden');
    regionEncounter.classList.remove('hidden');
    
    currentRegionName.innerText = region.name.toUpperCase();
    currentRegionDesc.innerText = region.description + "\n\nSTRATEGIC INTEL: " + region.strategic_value;
    
    actionButtons.classList.remove('hidden');
    dmText.innerHTML = "Node breached. Awaiting deployment directive.";
    dmText.style.color = "#00ffcc";

    // Dynamic Image Fetch
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
    newBg.onerror = () => { imageLoader.classList.add('hidden'); };
}

btnLeaveNode.addEventListener('click', () => {
    insideNode = false;
    currentRegionId = null;
    regionEncounter.classList.add('hidden');
    overworldMap.classList.remove('hidden');
    
    dynamicBg.classList.remove('focus');
    dynamicBg.style.backgroundImage = "url('https://images.unsplash.com/photo-1601042879364-f3947d3f9c16?ixlib=rb-4.0.3&auto=format&fit=crop&w=1920&q=80')";
});

function triggerRandomEncounter() {
    hudStatus.innerText = "OVERWORLD HOSTILE INTERCEPTS!";
    hudStatus.style.color = "#ff3333";
    sendAction("Player was ambushed by a roaming entity in the overworld while traveling.", "map_encounter");
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
    
    cursorPosition = 0;
    cursorDirection = 2; 
    minigameInterval = setInterval(() => {
        cursorPosition += cursorDirection;
        if(cursorPosition > 95 || cursorPosition < 0) cursorDirection *= -1;
        cursor.style.left = `${cursorPosition}%`;
    }, 20);
}

btnHackStop.addEventListener('click', () => {
    clearInterval(minigameInterval);
    minigameOverlay.classList.add('hidden');
    actionButtons.classList.remove('hidden');
    
    if(cursorPosition >= 40 && cursorPosition <= 60) {
        sendAction("HACK with PERFECT stealth and critical breach, grabbing top-tier loot.");
    } else {
        sendAction("HACK violently, triggering alarms and risking taking heavy damage.");
    }
});

async function sendAction(actionStr, bypassRegionId = null) {
    if (!insideNode) return; // ignore overworld clicks if any leak
    
    dmText.innerHTML = "Computing probabilities... Data stream active...";
    dmText.style.color = "#8ab4f8";
    actionButtons.classList.add('hidden'); 
    
    try {
        const response = await fetch('http://127.0.0.1:8000/action', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: actionStr,
                region_id: bypassRegionId || currentRegionId,
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
            
            // RPG Metrics
            hudXp.innerText = data.xp;
            hudHp.innerText = data.hp;
            hudEnergy.innerText = data.energy;
            
            // Re-render inventory
            if (data.inventory && data.inventory.length > 0) {
                inventoryList.innerHTML = "";
                data.inventory.forEach(item => {
                    const iSlot = document.createElement('div');
                    iSlot.className = "inv-item";
                    iSlot.innerText = item;
                    inventoryList.appendChild(iSlot);
                });
            }
            
            // Screen Shake for combat damage
            if (dmResponse.state_changes.hp_delta < -10) {
                 dynamicBg.style.transform = "translateX(10px)";
                 setTimeout(() => dynamicBg.style.transform = "translateX(-10px)", 50);
                 setTimeout(() => dynamicBg.style.transform = "translateX(0)", 100);
            }
            
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
    } catch(e) {}
}
