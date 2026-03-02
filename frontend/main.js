import { PushToTalk } from './voxtral.js';
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
const hudName   = document.getElementById('hud-name');
const hudXp     = document.getElementById('hud-xp');
const hudHp     = document.getElementById('hud-hp');
const hudEnergy = document.getElementById('hud-energy');
const hudWorld  = document.getElementById('hud-world');
const hudStatus = document.getElementById('hud-status');
const hudNodes  = document.getElementById('hud-nodes');
const hudBossStat = document.getElementById('hud-boss-stat');

// ── Central HUD Update + Progress Bar ────────────────────────────────────
function updateHUD(stats = {}) {
    if (stats.xp     !== undefined) hudXp.innerText     = parseInt(stats.xp)     || 0;
    if (stats.hp     !== undefined) hudHp.innerText     = parseInt(stats.hp)     || 0;
    if (stats.energy !== undefined) hudEnergy.innerText = parseInt(stats.energy) || 0;

    // Conquered nodes counter + boss unlock
    if (worldData) {
        const regions   = worldData.regions || [];
        const conquered = (window._conqueredRegions || []).length;
        const total     = regions.length;
        const bossIdx   = Math.max(1, total - 1);  // last region is boss
        const bossUnlocked = conquered >= bossIdx && total > 1;

        // HUD badge
        hudNodes.innerText = `${conquered}/${bossIdx}`;

        // Progress bar
        const pct = Math.min(100, (conquered / bossIdx) * 100);
        const fill = document.getElementById('progress-fill');
        const ptext = document.getElementById('progress-text');
        const pbar = document.getElementById('progress-bar');
        const wc = document.getElementById('win-condition');
        if (fill) fill.style.width = `${pct}%`;
        if (ptext) ptext.textContent = bossUnlocked ? '⚔️ BOSS UNLOCKED' : `${conquered} / ${bossIdx} NODES`;
        if (pbar) pbar.classList.toggle('boss-ready', bossUnlocked);
        if (wc && worldData.win_condition) wc.textContent = `OBJECTIVE: ${worldData.win_condition}`;

        if (bossUnlocked) {
            hudBossStat.style.display = '';
            if (conquered < total) {
                addChatMsg('⚔️ BOSS UNLOCKED — Enter the final node!', 'peer-action');
            }
        } else {
            hudBossStat.style.display = 'none';
        }
    }
}

const overworldMap = document.getElementById('overworld-map');
const regionEncounter = document.getElementById('region-encounter');
const playerAvatar = document.getElementById('player-avatar');

// Region Details
const dynamicBg = document.getElementById('dynamic-bg');
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
dynamicBg.style.backgroundImage = "url('https://images.unsplash.com/photo-1518005020951-eccb494ad742?ixlib=rb-4.0.3&auto=format&fit=crop&w=1920&q=80')";

const lobbyScreen = document.getElementById('lobby-screen');

// --- FLOW: SCREENS ---
const btnHelp = document.getElementById('btn-help');
if (btnHelp) {
    btnHelp.addEventListener('click', () => {
        rulesScreen.classList.add('active');
        uiLayer.classList.remove('hidden');
        uiLayer.classList.add('active');
    });
}

document.getElementById('btn-next').addEventListener('click', () => {
    const nameInput = document.getElementById('char-name').value.trim();
    if (nameInput) {
        playerName = nameInput.toUpperCase();
        hudName.innerText = playerName;
        loginScreen.classList.remove('active');
        setTimeout(() => lobbyScreen.classList.add('active'), 400);
    } else {
        alert("Enter your callsign protocol.");
    }
});

// Lobby: Create new session
document.getElementById('btn-create-session').addEventListener('click', () => {
    lobbyScreen.classList.remove('active');
    setTimeout(() => rulesScreen.classList.add('active'), 400);
});

// Lobby: Join existing session
document.getElementById('btn-join-lobby').addEventListener('click', () => {
    const joinId = document.getElementById('join-session-input').value.trim();
    if (joinId) {
        currentSessionId = joinId;
        document.getElementById('mp-session-id').innerText = currentSessionId;
        lobbyScreen.classList.remove('active');
        // Joining an existing session — skip world gen, go straight to game screen
        setTimeout(() => {
            loadingScreen.classList.add('active');
            loadingStatus.innerText = "Syncing to session " + currentSessionId + "...";
            // Fetch existing world from backend session
            joinExistingSession(currentSessionId);
        }, 400);
    } else {
        alert("Paste a valid session ID.");
    }
});

async function joinExistingSession(sessionId) {
    try {
        const res = await fetch(`http://127.0.0.1:8000/session/${sessionId}`);
        if (res.ok) {
            const data = await res.json();
            worldData = data.world;
            loadingStatus.innerText = "Session linked. Entering reality...";
            setTimeout(() => enterGame(), 1000);
        } else {
            loadingStatus.innerText = "Session not found. Please check the ID.";
        }
    } catch (e) {
        loadingStatus.innerText = "Could not reach server. Check your connection.";
    }
}

document.getElementById('btn-accept-rules').addEventListener('click', () => {
    rulesScreen.classList.remove('active');
    if (worldData) {
        uiLayer.classList.remove('active');
        setTimeout(() => uiLayer.classList.add('hidden'), 400);
    } else {
        setTimeout(() => promptScreen.classList.add('active'), 400);
    }
});

document.getElementById('btn-generate').addEventListener('click', async () => {
    const promptInput = document.getElementById('world-prompt').value.trim();
    if (promptInput) {
        promptScreen.classList.remove('active');
        setTimeout(() => {
            loadingScreen.classList.add('active');
            generateWorld(promptInput);
        }, 400);
    } else {
        alert("Define the simulation parameters.");
    }
});

// Animated loading status messages
const LOADING_MSGS = [
    "Parsing reality parameters...",
    "The Architect is sculpting the world...",
    "Generating factions and regions...",
    "Placing nodes on the overworld...",
    "Seeding quests and boss encounters...",
    "Calibrating simulation integrity...",
    "Almost ready — finalising the nodes..."
];

function startLoadingAnimation() {
    let i = 0;
    loadingStatus.innerText = LOADING_MSGS[0];
    return setInterval(() => {
        i = (i + 1) % LOADING_MSGS.length;
        loadingStatus.innerText = LOADING_MSGS[i];
    }, 1800);
}

// --- API: Generate World ---
async function generateWorld(promptString) {
    const t0 = performance.now();
    const msgInterval = startLoadingAnimation();

    try {
        const response = await fetch('http://127.0.0.1:8000/generate-world', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: promptString, player_name: playerName, session_id: currentSessionId })
        });
        if (!response.ok) throw new Error("Server Error");

        const data = await response.json();
        worldData = data.data;
        const elapsed = ((performance.now() - t0) / 1000).toFixed(1);
        clearInterval(msgInterval);
        loadingStatus.innerText = `✅ World generated in ${elapsed}s — entering simulation...`;

        setTimeout(() => { enterGame(); }, 1000);
    } catch (e) {
        clearInterval(msgInterval);
        console.error(e);
        loadingStatus.innerText = "⚠️ Connection lost. Check backend and try again.";
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
        
        // Show session ID + initialize WebSocket
        document.getElementById('mp-session-id').innerText = currentSessionId;
        initWebSocket(currentSessionId);
        
        // Init Voxtral push-to-talk — voice commands feed into sendAction
        if (!window._ptt) {
            window._ptt = new PushToTalk((transcribedText) => {
                // Transcribed voice command ➜ send as action (same as clicking a button)
                if (transcribedText && transcribedText.length > 1) {
                    sendAction(transcribedText);
                }
            });
        }

        // Init progress bar from world data
        updateHUD();
        
        setupMapEngine();
    }, 500);
}

// ─── MULTIPLAYER WEBSOCKET ─────────────────────────────────────────────────
let ws = null;
const peerAvatars = {}; // player_name -> DOM element

function initWebSocket(sessionId) {
    const wsUrl = `ws://127.0.0.1:8000/ws/${sessionId}/${encodeURIComponent(playerName)}`;
    ws = new WebSocket(wsUrl);
    
    ws.onopen = () => {
        addChatMsg(`Connected to session ${sessionId}`, 'system');
    };

    ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        
        if (msg.type === 'session_info') {
            document.getElementById('mp-player-count').innerText = msg.players.length;
            addChatMsg(`Players in session: ${msg.players.join(', ')}`, 'system');
        }
        
        if (msg.type === 'player_joined') {
            document.getElementById('mp-player-count').innerText = msg.players.length;
            addChatMsg(`${msg.player} has joined the simulation.`, 'system');
        }
        
        if (msg.type === 'player_left') {
            document.getElementById('mp-player-count').innerText = msg.players.length;
            addChatMsg(`${msg.player} has disconnected.`, 'system');
            // Remove their avatar
            if (peerAvatars[msg.player]) {
                peerAvatars[msg.player].remove();
                delete peerAvatars[msg.player];
            }
        }
        
        if (msg.type === 'peer_move') {
            // Render or update peer avatar on the overworld map
            if (!peerAvatars[msg.player]) {
                const av = document.createElement('div');
                av.className = 'avatar-entity peer';
                const lbl = document.createElement('span');
                lbl.style.cssText = 'position:absolute; top:16px; font-size:9px; white-space:nowrap; color:#ff00cc;';
                lbl.innerText = msg.player;
                av.appendChild(lbl);
                overworldMap.appendChild(av);
                peerAvatars[msg.player] = av;
            }
            peerAvatars[msg.player].style.left = `${msg.x}%`;
            peerAvatars[msg.player].style.top = `${msg.y}%`;
        }
        
        if (msg.type === 'action_narration') {
            addChatMsg(`[${msg.player}] ${msg.narration}`, 'peer-action');
        }
        
        if (msg.type === 'chat') {
            addChatMsg(`${msg.player}: ${msg.message}`, '');
        }
    };

    ws.onclose = () => { addChatMsg('Connection lost.', 'system'); };
    ws.onerror = (e) => console.log('[WS] Error:', e);
}

function wsSend(data) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(data));
    }
}

function addChatMsg(text, cls = '') {
    const chatFeed = document.getElementById('chat-feed');
    if (!chatFeed) return;
    const el = document.createElement('div');
    el.className = `chat-msg ${cls}`;
    el.innerText = text;
    chatFeed.appendChild(el);
    chatFeed.scrollTop = chatFeed.scrollHeight;
}

// ─── MULTIPLAYER: CHAT SIDEBAR + VOICE PTT ─────────────────────────────────────
const chatSidebar = document.getElementById('chat-sidebar');
const btnToggleChat = document.getElementById('btn-toggle-chat');
const btnVoice = document.getElementById('btn-voice');
let chatCollapsed = false;
let voiceActive = false;
let mediaRecorder = null;
let audioChunks = [];

// Collapse/expand chat
btnToggleChat.addEventListener('click', () => {
    chatCollapsed = !chatCollapsed;
    chatSidebar.classList.toggle('collapsed', chatCollapsed);
    btnToggleChat.innerText = chatCollapsed ? '▶' : '◀';
    btnToggleChat.title = chatCollapsed ? 'Expand chat' : 'Collapse chat';
});

// Voice PTT — click to toggle OR hold V
btnVoice.addEventListener('click', () => toggleVoice());
window.addEventListener('keydown', e => { if (e.key === 'v' && !e.repeat && !insideNode) startVoice(); });
window.addEventListener('keyup', e => { if (e.key === 'v') stopVoice(); });

function toggleVoice() {
    if (voiceActive) stopVoice(); else startVoice();
}

async function startVoice() {
    if (voiceActive) return;
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        voiceActive = true;
        btnVoice.classList.add('live');
        addChatMsg('🎙️ Voice active — speak now', 'system');
        
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];
        mediaRecorder.ondataavailable = e => audioChunks.push(e.data);
        mediaRecorder.onstop = async () => {
            const blob = new Blob(audioChunks, { type: 'audio/webm' });
            // Convert to base64 and relay over WebSocket to peers
            const reader = new FileReader();
            reader.onloadend = () => {
                wsSend({ type: 'voice', data: reader.result, player: playerName });
            };
            reader.readAsDataURL(blob);
            stream.getTracks().forEach(t => t.stop());
        };
        mediaRecorder.start();
    } catch (e) {
        addChatMsg('Microphone access denied.', 'system');
    }
}

function stopVoice() {
    if (!voiceActive) return;
    voiceActive = false;
    btnVoice.classList.remove('live');
    if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
}

// Multiplayer UI controls
document.getElementById('btn-copy-session').addEventListener('click', () => {
    navigator.clipboard.writeText(currentSessionId);
    document.getElementById('btn-copy-session').innerText = '✅';
    setTimeout(() => document.getElementById('btn-copy-session').innerText = '📋', 2000);
});

document.getElementById('btn-chat-send').addEventListener('click', () => sendChatMessage());
document.getElementById('chat-input').addEventListener('keydown', e => { if (e.key === 'Enter') sendChatMessage(); });

function sendChatMessage() {
    const input = document.getElementById('chat-input');
    const msg = input.value.trim();
    if (msg) {
        addChatMsg(`${playerName}: ${msg}`, '');
        wsSend({ type: 'chat', message: msg });
        input.value = '';
    }
}

// --- GAME MAP ENGINE ---
let enemies = [];
let playerPos = { x: 50, y: 50 }; // % based
let gameLoopActive = false;
let canEnterNode = null;
let insideNode = false;

const keys = { w: false, a: false, s: false, d: false };

window.addEventListener('keydown', e => {
    // Overworld movement inputs
    if (!uiLayer.classList.contains('active') && !insideNode) {
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
    }
    
    // UI Global Nav
    if (e.key === 'Escape') {
        if (rulesScreen.classList.contains('active')) {
            document.getElementById('btn-accept-rules').click();
        } else if (insideNode) {
            btnLeaveNode.click();
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
        
        // Broadcast position to co-op peers every frame
        wsSend({ type: 'move', x: playerPos.x, y: playerPos.y });
        
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

// Stage badge rendering
const stageLabels = { approach: "🔍 APPROACH", challenge: "⚔️ CHALLENGE", resolution: "🏆 RESOLUTION", complete: "✅ COMPLETE" };

// --- NODE ENCOUNTERS ---
function triggerNodeEncounter(region) {
    insideNode = true;
    currentRegionId = region.id;
    
    // UI Transitions
    overworldMap.classList.add('hidden');
    regionEncounter.classList.remove('hidden');
    
    currentRegionName.innerText = region.name.toUpperCase();
    currentRegionDesc.innerText = region.description;
    
    actionButtons.innerHTML = "";
    dmText.innerHTML = "<em style='color:#8ab4f8'>Entering node... The Architect is observing.</em>";
    dmText.style.color = "#8ab4f8";

    // Dynamic Image Fetch
    imageLoader.classList.remove('hidden');
    dynamicBg.classList.remove('focus');
    const bgUrl = `http://127.0.0.1:8000/region-image?prompt=${encodeURIComponent(region.description)}`;
    const newBg = new Image();
    newBg.src = bgUrl;
    newBg.onload = () => { dynamicBg.style.backgroundImage = `url('${bgUrl}')`; dynamicBg.classList.add('focus'); imageLoader.classList.add('hidden'); };
    newBg.onerror = () => { imageLoader.classList.add('hidden'); };

    // Kick off first beat of the story automatically
    sendAction("Player enters the region and surveys the situation.");
}

btnLeaveNode.addEventListener('click', () => {
    insideNode = false;
    currentRegionId = null;
    regionEncounter.classList.add('hidden');
    overworldMap.classList.remove('hidden');
    
    dynamicBg.classList.remove('focus');
    dynamicBg.style.backgroundImage = "url('https://images.unsplash.com/photo-1518005020951-eccb494ad742?ixlib=rb-4.0.3&auto=format&fit=crop&w=1920&q=80')";
});

function triggerRandomEncounter() {
    hudStatus.innerText = "OVERWORLD HOSTILE INTERCEPTS!";
    hudStatus.style.color = "#ff3333";
    sendAction("Player was ambushed by a roaming entity in the overworld while traveling.", "map_encounter");
}

// --- Dynamic Choice Buttons ---
function renderChoices(choices, stage) {
    actionButtons.innerHTML = "";
    actionButtons.classList.remove('hidden');

    // Stage badge
    const badge = document.createElement('div');
    badge.style.cssText = "color:#00ffcc; font-size:0.85em; margin-bottom:10px; letter-spacing:2px;";
    badge.innerText = stageLabels[stage] || stage.toUpperCase();
    actionButtons.appendChild(badge);

    if (stage === "complete") {
        // Track this region as conquered
        if (currentRegionId && !(window._conqueredRegions || []).includes(currentRegionId)) {
            window._conqueredRegions = window._conqueredRegions || [];
            window._conqueredRegions.push(currentRegionId);
            updateHUD(); // refresh nodes counter + check boss unlock
        }

        const doneBtn = document.createElement('button');
        doneBtn.className = 'action-btn';
        doneBtn.innerText = '← Return to Map';
        doneBtn.addEventListener('click', () => btnLeaveNode.click());
        actionButtons.appendChild(doneBtn);
        return;
    }

    choices.forEach(choice => {
        const btn = document.createElement('button');
        btn.className = 'action-btn';
        btn.title = choice.description; // tooltip on hover
        btn.innerText = choice.label;

        // Intercept HACK choice for minigame
        if (choice.label.toLowerCase().includes('hack') || choice.id === 'hack') {
            btn.addEventListener('click', () => startMinigame(choice));
        } else {
            btn.addEventListener('click', () => sendAction(choice.label + ': ' + choice.description));
        }
        actionButtons.appendChild(btn);
    });
}

// Keep minigame for HACK-labelled choices
let pendingHackChoice = null;
function startMinigame(choice) {
    pendingHackChoice = choice;
    actionButtons.classList.add('hidden');
    minigameOverlay.classList.remove('hidden');
    dmText.innerText = "Bypassing ICE... Sync your cursor to the GREEN ZONE.";
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
    const label = pendingHackChoice?.label || 'HACK';
    if(cursorPosition >= 40 && cursorPosition <= 60) {
        sendAction(`${label}: Perfect stealth breach — critical success.`);
    } else {
        sendAction(`${label}: Sloppy breach — alarms triggered, taking damage.`);
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
            
            // Update HUD (single source of truth)
            updateHUD({ xp: data.xp, hp: data.hp, energy: data.energy });
            
            // Screen Shake for heavy damage
            if (parseInt(dmResponse.state_changes?.hp_delta ?? 0) < -10) {
                 dynamicBg.style.transform = "translateX(10px)";
                 setTimeout(() => dynamicBg.style.transform = "translateX(-10px)", 50);
                 setTimeout(() => dynamicBg.style.transform = "translateX(0)", 100);
            }
            
            // Render dynamic choices from Mistral's response
            renderChoices(data.choices || [], data.stage || 'approach');
            
            // Broadcast narration to all co-op players
            wsSend({ type: 'action_narration', narration: dmResponse.narration, outcome: dmResponse.outcome, stage: data.stage });
            
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
            // Verify we actually got audio bytes, not a JSON error
            if (!blob.type.includes('audio')) {
                const errText = await blob.text();
                console.warn('[Narration] Unexpected response type:', blob.type, errText);
                return;
            }
            const audioUrl = URL.createObjectURL(blob);
            const audio = new Audio(audioUrl);
            audio.onended = () => URL.revokeObjectURL(audioUrl); // cleanup memory
            await audio.play();
        } else {
            // Parse error body for debugging
            const errBody = await response.text();
            console.warn(`[Narration] ${response.status} error:`, errBody);
            if (response.status === 401) {
                addChatMsg('⚠️ Voice offline — ElevenLabs key needs text_to_speech permission.', 'system');
            }
        }
    } catch(e) {
        console.warn('[Narration] fetch failed:', e.message);
    }
}
