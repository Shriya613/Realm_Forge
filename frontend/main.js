import { PushToTalk } from './voxtral.js';
import { spawnRegionEnemies, MapSprite } from './sprites.js';
let playerName = "Guest";
let currentSessionId = "demo_session_" + Math.floor(Math.random() * 10000);
let worldData = null;
let currentRegionId = null;
let enemySprites = [];   // active MapSprite instances on the overworld
let sfxLibrary = {};     // pre-generated SFX base64 map
let voiceEnabled = false; // OFF by default — saves ElevenLabs credits
let isMultiplayer = false;
let nodeTimerInterval = null;
let nodeTimeRemaining = 600;
let failedNodes = {};  // { regionId: failCount } for 3-strike world reset
let showDefeatOverlay = false;
let defeatRegionName = '';
let bgmMuted = false;  // BGM mute state

// ── Character class state ────────────────────────────────────────────────
const CLASSES = {
    knight:  { name:'Knight',  icon:'⚔️',  hp:150, energy:35,  color:'#00ff88', perk:'armor'   },
    rogue:   { name:'Rogue',   icon:'🗡️',  hp:90,  energy:70,  color:'#ffcc00', perk:'cunning' },
    mage:    { name:'Mage',    icon:'🔮',  hp:70,  energy:90,  color:'#8833ff', perk:'scholar' },
    paladin: { name:'Paladin', icon:'✝️',  hp:120, energy:50,  color:'#ffcc00', perk:'paladin' },
};
let selectedClass = null; // key into CLASSES

// ── Telemetry tracker ─────────────────────────────────────────────────
const TELEMETRY = {
    actionsTotal: 0,
    successes: 0,
    failures: 0,
    partials: 0,
    totalHpLost: 0,
    lowHpTurns: 0,  // turns spent below 30% HP
    nodesConquered: 0,
    turnsAttempted: 0,
};
function telemetryReset() {
    Object.assign(TELEMETRY, { actionsTotal:0, successes:0, failures:0, partials:0,
        totalHpLost:0, lowHpTurns:0, nodesConquered:0, turnsAttempted:0 });
}
function telemetryRecord(outcome, hpBefore, hpAfter) {
    TELEMETRY.actionsTotal++;
    TELEMETRY.turnsAttempted++;
    if (outcome === 'success')      TELEMETRY.successes++;
    else if (outcome === 'failure') TELEMETRY.failures++;
    else                            TELEMETRY.partials++;
    const lost = Math.max(0, hpBefore - hpAfter);
    TELEMETRY.totalHpLost += lost;
    if (hpAfter < 30) TELEMETRY.lowHpTurns++;
    const score = TELEMETRY.successes * 10 + TELEMETRY.partials * 4 - TELEMETRY.failures * 6;
    const el = document.getElementById('hud-score');
    if (el) el.innerText = Math.max(0, score);
    const stat = document.getElementById('hud-telemetry-stat');
    if (stat) stat.style.display = 'flex';
}
function telemetrySummary() {
    const acc = TELEMETRY.actionsTotal > 0
        ? Math.round((TELEMETRY.successes / TELEMETRY.actionsTotal) * 100) : 0;
    return `accuracy:${acc}% (${TELEMETRY.successes}W/${TELEMETRY.failures}L), ` +
           `totalHpLost:${TELEMETRY.totalHpLost}, lowHpTurns:${TELEMETRY.lowHpTurns}, ` +
           `nodesConquered:${TELEMETRY.nodesConquered}`;
}

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
    if (stats.hp     !== undefined) {
        hudHp.innerText = parseInt(stats.hp) || 0;
        
        // Sync v2 panel HP bar if it's on screen
        const hpText = document.getElementById('v2-hp-text');
        const hpFill = document.getElementById('v2-hp-fill');
        if (hpText && hpFill) {
            hpText.innerText = `${stats.hp}/100`;
            hpFill.style.width = `${Math.min(100, stats.hp)}%`;
            if (stats.hp < 30) {
                hpFill.style.background = '#ff4444';
                hpText.style.color = '#ff4444';
            } else {
                hpFill.style.background = '#00ff88';
                hpText.style.color = '#00ff88';
            }
        }
        // ── Heartbeat ──────────────────────────────────────────
        const hbOverlay = document.getElementById('heartbeat-overlay');
        if (hbOverlay) {
            if (parseInt(stats.hp) < 30) {
                hbOverlay.classList.add('critical');
                startHeartbeat();
            } else {
                hbOverlay.classList.remove('critical');
                stopHeartbeat();
            }
        }
    }
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
        if (ptext) ptext.textContent = bossUnlocked ? 'BOSS UNLOCKED' : `${conquered} / ${bossIdx} NODES`;
        if (pbar) pbar.classList.toggle('boss-ready', bossUnlocked);
        if (wc && worldData.win_condition) wc.textContent = `OBJECTIVE: ${worldData.win_condition}`;

        if (bossUnlocked) {
            hudBossStat.style.display = '';
            if (conquered < total) {
                addChatMsg('BOSS UNLOCKED — Enter the final node!', 'peer-action');
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

// Default starting background is now handled via CSS (Realm Forge v2-style gradient)

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

// ── Character Class Select ────────────────────────────────────────────
const classScreen = document.getElementById('class-screen');
const btnConfirmClass = document.getElementById('btn-confirm-class');

document.querySelectorAll('.class-card').forEach(card => {
    card.addEventListener('click', () => {
        document.querySelectorAll('.class-card').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        selectedClass = card.dataset.class;
        if (btnConfirmClass) {
            btnConfirmClass.style.opacity = '1';
            btnConfirmClass.style.pointerEvents = 'auto';
            const cls = CLASSES[selectedClass];
            btnConfirmClass.textContent = `Play as ${cls.name} ${cls.icon}`;
        }
    });
});

if (btnConfirmClass) {
    btnConfirmClass.addEventListener('click', () => {
        if (!selectedClass) return;
        const cls = CLASSES[selectedClass];
        // Update HUD class badge
        const hudClass = document.getElementById('hud-class');
        if (hudClass) { hudClass.innerText = cls.name; hudClass.style.color = cls.color; }
        // Set initial stats from class
        window._playerStats = { xp:0, hp:cls.hp, energy:cls.energy,
            maxHp:cls.hp, maxEnergy:cls.energy };
        classScreen.classList.remove('active');
        setTimeout(() => rulesScreen.classList.add('active'), 400);
    });
}

function goToClassScreen() {
    lobbyScreen.classList.remove('active');
    setTimeout(() => classScreen.classList.add('active'), 400);
}

// Lobby: Single Player
const btnSolo = document.getElementById('btn-solo');
if (btnSolo) {
    btnSolo.addEventListener('click', () => {
        isMultiplayer = false;
        currentSessionId = "solo_" + Math.floor(Math.random() * 10000);
        document.getElementById('mp-session-id').innerText = currentSessionId;
        const chatSidebar = document.getElementById('chat-sidebar');
        if (chatSidebar) chatSidebar.style.display = 'none';
        const mpBadge = document.querySelector('.mp-badge');
        if (mpBadge) mpBadge.style.display = 'none';
        goToClassScreen();
    });
}

// Lobby: Create new session
document.getElementById('btn-create-session').addEventListener('click', () => {
    isMultiplayer = true;
    goToClassScreen();
});

// Lobby: Join existing session
document.getElementById('btn-join-lobby').addEventListener('click', () => {
    const joinId = document.getElementById('join-session-input').value.trim();
    if (joinId) {
        isMultiplayer = true;
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
// ── Dynamic World Theme ───────────────────────────────────────────────────
function applyWorldTheme(prompt = '', worldName = '') {
    const text = (prompt + ' ' + worldName).toLowerCase();
    let theme = ''; // default cyberpunk teal

    if (/dragon|magic|wizard|elf|dwarf|kingdom|medieval|castle|quest|sword|fantasy/i.test(text)) {
        theme = 'theme-fantasy';
    } else if (/steam|gear|clock|brass|iron|inventor|victorian|coal|machine|industrious/i.test(text)) {
        theme = 'theme-steampunk';
    } else if (/horror|blood|undead|zombie|vampire|dark|cursed|haunted|demon|cult/i.test(text)) {
        theme = 'theme-horror';
    } else if (/forest|nature|jungle|tree|grove|druid|plant|wild|garden|ocean|water/i.test(text)) {
        theme = 'theme-nature';
    } else if (/space|galaxy|planet|star|cosmos|alien|void|nebula|orbit/i.test(text)) {
        theme = 'theme-space';
    }

    // Remove all themes, add the new one
    document.body.classList.remove(
        'theme-fantasy','theme-steampunk','theme-horror','theme-nature','theme-space'
    );
    if (theme) document.body.classList.add(theme);

    // Also update dynamic background gradient to match
    const bg = document.getElementById('dynamic-bg');
    if (bg) {
        const gradients = {
            'theme-fantasy':   'radial-gradient(ellipse at 35% 45%, #1a0e2e 0%, #0d0818 65%)',
            'theme-steampunk': 'radial-gradient(ellipse at 35% 45%, #1a0f00 0%, #0d0800 65%)',
            'theme-horror':    'radial-gradient(ellipse at 35% 45%, #120000 0%, #080000 65%)',
            'theme-nature':    'radial-gradient(ellipse at 35% 45%, #041208 0%, #020a04 65%)',
            'theme-space':     'radial-gradient(ellipse at 35% 45%, #000818 0%, #00040f 65%)',
        };
        bg.style.background = gradients[theme] || 'radial-gradient(ellipse at 35% 45%, #0a1828 0%, #060810 65%)';
    }
}

function enterGame() {
    uiLayer.classList.remove('active');
    
    const bgm = document.getElementById('bg-music');
    if (bgm) { bgm.volume = 0.3; bgm.play().catch(e => console.log("Audio play blocked", e)); }
    
    // Apply world theme from prompt
    applyWorldTheme(worldData?.prompt || '', worldData?.world_name || '');

    setTimeout(() => {
        uiLayer.classList.add('hidden');
        gameInterface.classList.remove('hidden');

        // Update world name in new centered HUD
        const hudWorldEl = document.getElementById('hud-world');
        if (hudWorldEl) hudWorldEl.innerText = (worldData.world_name || '').toUpperCase();
        
        // Update player avatar emoji based on class
        const avatar = document.getElementById('player-avatar');
        if (avatar && selectedClass) {
            const cls = CLASSES[selectedClass];
            avatar.innerText = cls.icon;
            avatar.title = cls.name;
        }

        // Show session ID + initialize WebSocket
        document.getElementById('mp-session-id').innerText = currentSessionId;
        initWebSocket(currentSessionId);
        
        // Init Voxtral push-to-talk — voice commands feed into sendAction
        if (!window._ptt) {
            window._ptt = new PushToTalk((transcribedText) => {
                if (transcribedText && transcribedText.length > 1) {
                    sendAction(transcribedText);
                }
            });
        }

        // Init progress bar from world data
        updateHUD();

        // Apply class stats (or fallback to default)
        const cls = selectedClass ? CLASSES[selectedClass] : null;
        window._playerStats = cls
            ? { xp:0, hp:cls.hp, energy:cls.energy, maxHp:cls.hp, maxEnergy:cls.energy }
            : { xp:0, hp:100, maxHp:100, energy:50, maxEnergy:50 };
        updateHUD({ hp: window._playerStats.hp, energy: window._playerStats.energy });

        // Sync class HUD badge (in case it wasn't set yet)
        if (cls) {
            const hudClass = document.getElementById('hud-class');
            if (hudClass) { hudClass.innerText = cls.name; hudClass.style.color = cls.color; }
        }

        // Reset telemetry + score display for new run
        telemetryReset();
        const scoreEl = document.getElementById('hud-score');
        if (scoreEl) scoreEl.innerText = '0';
        const statEl = document.getElementById('hud-telemetry-stat');
        if (statEl) statEl.style.display = 'none';


        // Init quest tracker from worldData quests
        if (worldData?.quests) {
            const initQuests = worldData.quests.map(q => ({
                id: q.id, title: q.title, region_id: q.region_id, status: 'active'
            }));
            renderQuestTracker(initQuests);
        }


        // SFX library disabled to conserve ElevenLabs credits.
        // Re-enable when on a paid plan: fetch('http://127.0.0.1:8000/sfx-library')...
        // sfxLibrary stays empty {} — playSFX() silently skips missing sounds.
        
    setupMapEngine();
        startMinimap();

        // ── Inventory + Quest panel collapse toggles ──────────────────────
        document.getElementById('inventory-header').addEventListener('click', () => {
            const panel = document.getElementById('inventory-panel');
            const tog = document.getElementById('inventory-toggle');
            panel.classList.toggle('collapsed');
            tog.innerText = panel.classList.contains('collapsed') ? '▾' : '▴';
        });
        document.getElementById('quest-tracker-header').addEventListener('click', () => {
            const panel = document.getElementById('quest-tracker');
            const tog = document.getElementById('quest-tracker-toggle');
            panel.classList.toggle('collapsed');
            tog.innerText = panel.classList.contains('collapsed') ? '▾' : '▴';
        });

        // ── BGM Mute button ───────────────────────────────────────────────
        const btnBgm = document.getElementById('btn-bgm-toggle');
        if (btnBgm) {
            btnBgm.addEventListener('click', () => {
                const bgm = document.getElementById('bg-music');
                bgmMuted = !bgmMuted;
                if (bgm) { bgm.muted = bgmMuted; }
                btnBgm.textContent = bgmMuted ? '🔇 BGM' : '🎵 BGM';
                btnBgm.classList.toggle('hud-btn-active', !bgmMuted);
                btnBgm.classList.toggle('muted', bgmMuted);
            });
        }
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

// ── Toast Notifications (v2) ─────────────────────────────────────────────
function showToast(message, type = 'info') {
    const existing = document.querySelector('.toast-v2');
    if (existing) existing.remove();
    const toast = document.createElement('div');
    toast.className = `toast-v2 ${type}`;
    toast.innerText = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2400);
}

// ─── MULTIPLAYER: CHAT SIDEBAR + VOICE PTT ─────────────────────────────────────
const chatSidebar = document.getElementById('chat-sidebar');
const btnToggleChat = document.getElementById('btn-toggle-chat');
const btnVoice = document.getElementById('btn-voice');

// ── Voice Toggle (ElevenLabs credit gate) ────────────────────────────
const btnVoiceToggle = document.getElementById('btn-voice-toggle');
if (btnVoiceToggle) {
    btnVoiceToggle.addEventListener('click', () => {
        voiceEnabled = !voiceEnabled;
        if (voiceEnabled) {
            btnVoiceToggle.textContent = '🔊 VOICE';
            btnVoiceToggle.classList.add('hud-btn-active');
            btnVoiceToggle.classList.remove('muted');
            addChatMsg('🔊 Voice narration ON — ElevenLabs credits will be used.', 'system');
        } else {
            btnVoiceToggle.textContent = '🔇 VOICE';
            btnVoiceToggle.classList.remove('hud-btn-active');
            addChatMsg('🔇 Voice narration OFF — credits saved.', 'system');
        }
    });
}
let chatCollapsed = true;
let voiceActive = false;
let mediaRecorder = null;
let audioChunks = [];

// Collapse/expand chat
btnToggleChat.innerText = '▶';
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
    overworldMap.querySelectorAll('.overworld-node, .enemy, #map-connections').forEach(e => e.remove());
    enemies = [];

    const totalNodes = worldData.regions.length;
    const conqueredIds = window._conqueredRegions || [];

    // ── Force horizontal layout: all nodes at y=50%, evenly spaced ──────────
    worldData.regions.forEach((region, index) => {
        const xStep = totalNodes > 1 ? 84 / (totalNodes - 1) : 0;
        region.renderX = 8 + index * xStep;
        region.renderY = 50; // always horizontal
    });

    // Compute which nodes are now unlocked (sequential order)
    function getAvailableIds(regions, conquered) {
        // Unlock next region in sequence after each conquest
        const ids = new Set();
        regions.forEach((r, i) => {
            if (i === 0) { ids.add(r.id); return; } // first always available
            const prev = regions[i - 1];
            if (conquered.includes(prev.id)) ids.add(r.id);
        });
        return [...ids];
    }
    const availableIds = getAvailableIds(worldData.regions, conqueredIds);

    // SVG connection lines between consecutive nodes
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.id = 'map-connections';
    overworldMap.appendChild(svg);

    const DIFF_COLOR = { easy: '#00ffcc', medium: '#ffcc00', hard: '#ff4444' };

    // Create Realm Nodes
    worldData.regions.forEach((region, index) => {
        const mappedX = region.renderX;
        const mappedY = region.renderY;

        const isConquered = conqueredIds.includes(region.id);
        const isAvailable = availableIds.includes(region.id) && !isConquered;
        const isLocked = !isConquered && !isAvailable;
        const diff = region.difficulty || 'easy';
        const isBossNode = index === worldData.regions.length - 1;
        const color = DIFF_COLOR[diff] || '#00ffcc';

        const node = document.createElement('div');
        node.className = `overworld-node ${isConquered ? 'conquered' : isLocked ? 'locked' : 'diff-' + diff}${isBossNode && !isConquered ? ' boss-node' : ''}`;
        node.style.left = `${mappedX}%`;
        node.style.top  = `${mappedY}%`;
        node.dataset.regionId = region.id;

        // Pulse ring for available
        if (isAvailable) {
            const ring = document.createElement('div');
            ring.className = `node-pulse-ring ${isBossNode ? 'ring-boss' : 'ring-' + diff}`;
            node.appendChild(ring);
        }

        // Icon — no emoji on nodes, just a symbol
        const iconEl = document.createElement('div');
        iconEl.style.cssText = 'position:relative; z-index:2; font-size:20px; pointer-events:none; font-family: Share Tech Mono, monospace; color:#fff;';
        iconEl.innerText = isConquered ? '✔' : (isLocked ? '🔒' : (isBossNode ? '★' : '◆'));
        node.appendChild(iconEl);

        // Difficulty badge (not on boss or conquered)
        if (!isConquered && !isLocked && !isBossNode) {
            const badge = document.createElement('div');
            badge.className = `node-diff-badge diff-badge-${diff}`;
            badge.innerText = diff[0].toUpperCase();
            node.appendChild(badge);
        }

        // Rest icon on conquered
        if (isConquered) {
            const rest = document.createElement('div');
            rest.className = 'node-rest-icon';
            rest.innerText = 'R';
            node.appendChild(rest);
        }

        // Name label
        const label = document.createElement('div');
        label.className = 'node-label';
        label.innerText = region.name;
        node.appendChild(label);

        // Hover tooltip
        let tooltip = null;
        if (!isLocked) {
            node.addEventListener('mouseenter', () => {
                tooltip = document.createElement('div');
                tooltip.className = `node-tooltip diff-${diff}`;
                tooltip.innerHTML = isConquered
                    ? `<span style="color:#00ff88">Rest here: +20 HP, +15 Energy</span>`
                    : `${faction?.name || '?'} · <span style="color:${color}">${diff}</span>`;
                node.appendChild(tooltip);
            });
            node.addEventListener('mouseleave', () => { if (tooltip) { tooltip.remove(); tooltip = null; } });
        }

        // Click handler
        node.addEventListener('click', () => {
            if (isLocked) return;
            const stats = window._playerStats || { energy: 50 };
            if (!isConquered && (stats.energy || 50) < 10) {
                showToast('Too exhausted! Rest at a conquered node first.', 'warn');
                return;
            }
            if (isConquered) {
                // Rest mechanic (v2)
                const stats = window._playerStats || { hp: 100, maxHp: 100, energy: 50, maxEnergy: 50 };
                if (stats.hp >= stats.maxHp && stats.energy >= (stats.maxEnergy || 50)) {
                    showToast('Already at full health!', 'info');
                    return;
                }
                updateHUD({ hp: Math.min(stats.maxHp, stats.hp + 20), energy: Math.min(stats.maxEnergy || 50, stats.energy + 15) });
                window._playerStats = { ...stats, hp: Math.min(stats.maxHp, stats.hp + 20), energy: Math.min(stats.maxEnergy || 50, stats.energy + 15), maxHp: stats.maxHp, maxEnergy: stats.maxEnergy || 50 };
                showToast(`Rested at ${region.name}. +20 HP, +15 Energy`, 'success');
                addChatMsg(`Rested at ${region.name}. +20 HP, +15 Energy`, 'system');
                return;
            }
            triggerNodeEncounter(region);
        });

        overworldMap.appendChild(node);
        region.domNode = node;
    });

    // Draw SVG connection lines between consecutive nodes only
    worldData.regions.forEach((r, i) => {
        if (i === 0) return;
        const r2 = worldData.regions[i - 1];
        const isActive = conqueredIds.includes(r2.id);
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', `${r2.renderX}%`);
        line.setAttribute('y1', `${r2.renderY}%`);
        line.setAttribute('x2', `${r.renderX}%`);
        line.setAttribute('y2', `${r.renderY}%`);
        line.setAttribute('stroke', isActive ? '#00ff88' : '#00ffcc');
        line.setAttribute('stroke-width', '1.5');
        line.setAttribute('stroke-opacity', isActive ? '0.5' : '0.15');
        line.setAttribute('stroke-dasharray', '6,8');
        svg.appendChild(line);
    });

    // No roaming enemy sprites on overworld — they clutter the nodes
    enemySprites.forEach(s => s.destroy());
    enemySprites = [];

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
    
    // ── Enemy intercept check ──────────────────────────────────────────────
    if (!insideNode && enemySprites.length > 0 && worldData) {
        const mapRect = overworldMap.getBoundingClientRect();
        const px = (playerPos.x / 100) * mapRect.width;
        const py = (playerPos.y / 100) * mapRect.height;

        // Check each roaming enemy
        for (const sprite of enemySprites) {
            const dx = sprite.x - px;
            const dy = sprite.y - py;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < 28) {  // collision radius in pixels
                // Flash the screen
                overworldMap.style.animation = 'interceptFlash 0.6s ease-out';
                setTimeout(() => { overworldMap.style.animation = ''; }, 600);

                // Drain 8 energy and show toast
                const stats = window._playerStats || { energy: 50, hp: 100, maxHp: 100, maxEnergy: 50 };
                if (stats.energy > 0) {
                    const newEnergy = Math.max(0, stats.energy - 8);
                    window._playerStats = { ...stats, energy: newEnergy };
                    updateHUD({ energy: newEnergy });
                    showToast('Enemy intercept! -8 Energy', 'danger');
                    addChatMsg('🔴 Intercepted by a roaming enemy! Energy drained.', 'system');
                    // Briefly teleport the sprite away to avoid repeated hits
                    sprite.moveTo(
                        sprite.x + (Math.random() - 0.5) * 120,
                        sprite.y + (Math.random() - 0.5) * 120,
                        300
                    );
                }
                break; // Only one intercept per frame
            }
        }
    }
    
    requestAnimationFrame(gameLoop);
}

// Stage badge rendering
const stageLabels = { approach: "APPROACH", challenge: "CHALLENGE", resolution: "RESOLUTION", complete: "COMPLETE" };

// ── Faction Portrait SVG (v2 neon style by personality) ─────────────────
function getFactionPortraitSVG(faction, size = 72) {
    const cfg = {
        aggressive: { bg: "#1a0505", ring: "#ff4444", glow: "#ff444466", body: "#cc2222", eye: "#ffff00", brow: "angry" },
        cunning:    { bg: "#0a0515", ring: "#8833ff", glow: "#8833ff66", body: "#6611cc", eye: "#00ffcc", brow: "raised" },
        defensive:  { bg: "#050a1a", ring: "#4488ff", glow: "#4488ff66", body: "#2255cc", eye: "#aaddff", brow: "stern" },
        diplomatic: { bg: "#1a1505", ring: "#ffcc00", glow: "#ffcc0066", body: "#cc9900", eye: "#ff8800", brow: "calm" },
    }[faction?.personality || "aggressive"] || { bg: "#1a0505", ring: "#ff4444", glow: "#ff444466", body: "#cc2222", eye: "#ffff00", brow: "angry" };
    const s = size;
    return `<svg width="${s}" height="${s}" viewBox="0 0 80 80" style="border-radius:6px;border:2px solid ${cfg.ring};box-shadow:0 0 16px ${cfg.glow};flex-shrink:0">
<rect width="80" height="80" fill="${cfg.bg}"/>
<ellipse cx="40" cy="55" rx="28" ry="30" fill="${cfg.body}" opacity="0.25"/>
<rect x="18" y="52" width="44" height="32" rx="10" fill="${cfg.body}" opacity="0.85"/>
<rect x="28" y="54" width="24" height="7" rx="3" fill="#fff" opacity="0.18"/>
<rect x="34" y="46" width="12" height="8" fill="${cfg.body}" opacity="0.7"/>
<ellipse cx="40" cy="35" rx="17" ry="19" fill="${cfg.body}" opacity="0.9"/>
<ellipse cx="40" cy="37" rx="13" ry="14" fill="${cfg.bg}" opacity="0.6"/>
<ellipse cx="32" cy="35" rx="5" ry="5" fill="${cfg.eye}" opacity="0.95"/>
<ellipse cx="48" cy="35" rx="5" ry="5" fill="${cfg.eye}" opacity="0.95"/>
<circle cx="33" cy="36" r="2.5" fill="#000"/>
<circle cx="49" cy="36" r="2.5" fill="#000"/>
<ellipse cx="40" cy="18" rx="15" ry="7" fill="${cfg.body}" opacity="0.8"/>
</svg>`;
}

// --- NODE ENCOUNTERS ---
function showTrophy(title, desc, isWorldVictory = false) {
    const overlay = document.getElementById('trophy-overlay');
    const confettiEl = document.getElementById('trophy-confetti');
    document.getElementById('trophy-title').innerText = title;
    document.getElementById('trophy-desc').innerText = desc;
    overlay.classList.remove('hidden');

    // v2 confetti
    if (confettiEl) {
        confettiEl.innerHTML = '';
        const colors = ['#ffcc00','#00ffcc','#ff4444','#ffffff','#ff8800','#88ff44'];
        for (let i = 0; i < 45; i++) {
            const p = document.createElement('div');
            p.className = 'confetti-piece';
            p.style.left = Math.random() * 100 + '%';
            p.style.width = (5 + Math.random() * 9) + 'px';
            p.style.height = p.style.width;
            p.style.background = colors[i % colors.length];
            p.style.borderRadius = Math.random() > 0.5 ? '50%' : '2px';
            p.style.animationDelay = Math.random() * 1.8 + 's';
            p.style.animationDuration = (2.2 + Math.random() * 1.8) + 's';
            confettiEl.appendChild(p);
        }
    }

    const btn = document.getElementById('btn-trophy-continue');
    btn.onclick = () => {
        overlay.classList.add('hidden');
        if (isWorldVictory) {
            location.reload(); // Reload to start a new game/world
        } else {
            btnLeaveNode.click(); // Return to map
        }
    };
}

// --- DEFEAT OVERLAY (v2) ---
function showDefeat(regionName, regionId) {
    const defeatedRegionId = regionId || currentRegionId;
    window._defeatedRegionId = defeatedRegionId;
    window._defeatIsWorldReset = (failedNodes[defeatedRegionId] || 0) >= 3;
    insideNode = false;
    currentRegionId = null;
    regionEncounter.classList.add('hidden');
    overworldMap.classList.remove('hidden');
    stopNodeTimer();

    const failCount = failedNodes[defeatedRegionId] || 0;
    const stats = window._playerStats || { energy: 50 };
    const canRetry = stats.energy >= 20;
    const isWorldReset = failCount >= 3;

    document.getElementById('defeat-node-name').innerText = (regionName || 'Unknown') + ' has repelled you.';
    const infoEl = document.getElementById('defeat-info');
    if (isWorldReset) {
        infoEl.innerHTML = 'You have failed this node 3 times.<br/><span style="color:#ff4444;font-weight:bold">This world resets.</span>';
    } else {
        infoEl.textContent = `Fail count: ${failCount}/3 — fail again and this world resets.${!canRetry ? ' You are too exhausted to retry right now.' : ''}`;
    }

    const retryBtn = document.getElementById('btn-defeat-retry');
    const retreatBtn = document.getElementById('btn-defeat-retreat');
    retryBtn.style.display = (canRetry && !isWorldReset) ? '' : 'none';
    retreatBtn.innerText = isWorldReset ? 'RESET WORLD' : 'RETREAT TO MAP';

    document.getElementById('defeat-overlay').classList.remove('hidden');
}

function hideDefeat() {
    document.getElementById('defeat-overlay').classList.add('hidden');
}

// --- Node Timer 10 minutes ---
function startNodeTimer() {
    clearInterval(nodeTimerInterval);
    nodeTimeRemaining = 600; // 10 minutes in seconds
    const timerEl = document.getElementById('node-timer');
    timerEl.classList.remove('hidden');
    updateNodeTimerDisplay(timerEl);
    
    nodeTimerInterval = setInterval(() => {
        nodeTimeRemaining--;
        updateNodeTimerDisplay(timerEl);
        if (nodeTimeRemaining <= 0) {
            clearInterval(nodeTimerInterval);
            timerEl.innerText = "TIME OUT";
            showTrophy("TIME EXPIRED", "You failed to secure the region in time. Retreating!", false);
            setTimeout(() => { if (insideNode) btnLeaveNode.click(); }, 3000);
        }
    }, 1000);
}

function updateNodeTimerDisplay(el) {
    const min = Math.floor(nodeTimeRemaining / 60);
    const sec = nodeTimeRemaining % 60;
    el.innerText = `${min}:${sec.toString().padStart(2, '0')}`;
}

function stopNodeTimer() {
    clearInterval(nodeTimerInterval);
    document.getElementById('node-timer').classList.add('hidden');
}

function triggerNodeEncounter(region) {
    insideNode = true;
    currentRegionId = region.id;

    overworldMap.classList.add('hidden');
    regionEncounter.classList.remove('hidden');

    // Populate v2 panel
    const pFactionName = document.getElementById('v2-faction-name');
    const pPortrait = document.getElementById('v2-portrait');
    const pStage = document.getElementById('v2-stage-line');
    const pNarration = document.getElementById('v2-narration');

    const faction = (worldData.factions || []).find(f => f.id === region.faction_id);
    if (pFactionName) pFactionName.innerText = region.name.toUpperCase();
    if (pStage) pStage.innerText = "◆ APPROACH";

    // Show faction portrait (v2: SVG by personality or Mistral-generated image)
    if (pPortrait) {
        pPortrait.innerHTML = '';
        if (faction && faction.portrait_b64) {
            const img = document.createElement('img');
            img.src = `data:image/png;base64,${faction.portrait_b64}`;
            img.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:6px;border:2px solid #00ffcc;box-shadow:0 0 16px #00ffcc55;';
            pPortrait.appendChild(img);
        } else {
            pPortrait.innerHTML = getFactionPortraitSVG(faction || { personality: 'aggressive' }, 68);
        }
    }

    if (pNarration) {
        pNarration.innerText = `Entering ${region.name}... The Architect is observing.`;
        pNarration.className = 'narration-block';
    }

    actionButtons.innerHTML = "";
    
    // Fallbacks for legacy JS logic
    if (currentRegionName) currentRegionName.innerText = region.name.toUpperCase();
    if (currentRegionDesc) currentRegionDesc.innerText = region.description;
    if (dmText) {
        dmText.innerHTML = "<em style='color:#8ab4f8'>Entering node... The Architect is observing.</em>";
        dmText.style.color = "#8ab4f8";
    }

    // Realm Forge v2-style focus state (no remote images)
    if (dynamicBg) dynamicBg.classList.add('focus');
    
    // Play approach SFX
    playSFX('approach');

    // Start round timer
    startNodeTimer();

    sendAction("Player enters the region and surveys the situation.");
}

btnLeaveNode.addEventListener('click', () => {
    insideNode = false;
    currentRegionId = null;
    regionEncounter.classList.add('hidden');
    overworldMap.classList.remove('hidden');
    if (dynamicBg) dynamicBg.classList.remove('focus');
    
    stopNodeTimer();
});

// Defeat overlay buttons
document.getElementById('btn-defeat-retreat').addEventListener('click', async () => {
    hideDefeat();
    if (window._defeatIsWorldReset) {
        window._conqueredRegions = [];
        const regionIds = worldData?.regions?.map(r => r.id) || [];
        regionIds.forEach(id => { failedNodes[id] = 0; });
        try {
            await fetch('http://127.0.0.1:8000/reset-world', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ session_id: currentSessionId })
            });
        } catch (e) { /* ignore */ }
        setupMapEngine();
        showToast('World reset — start from the beginning.', 'danger');
    }
});

document.getElementById('btn-defeat-retry').addEventListener('click', async () => {
    const region = worldData?.regions?.find(r => r.id === (window._defeatedRegionId || ''));
    if (!region || (window._playerStats?.energy || 0) < 20) return;
    try {
        const res = await fetch('http://127.0.0.1:8000/retry-node', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ session_id: currentSessionId })
        });
        if (res.ok) {
            const data = await res.json();
            updateHUD({ energy: data.energy });
            window._playerStats = { ...window._playerStats, energy: data.energy };
        }
    } catch (e) { /* ignore */ }
    hideDefeat();
    triggerNodeEncounter(region);
});

// --- Trophy logic merged above ---

// --- Dynamic Choice Buttons (v2 style) ---
function renderChoices(choices, stage) {
    actionButtons.innerHTML = '';
    actionButtons.classList.remove('hidden');

    // Update narration style based on last outcome
    const narBlock = document.getElementById('v2-narration');
    if (narBlock) {
        narBlock.className = 'narration-block outcome-' + (window._lastOutcome || '');
    }

    // Stage dots update
    const stages = ['approach', 'challenge', 'resolution'];
    document.querySelectorAll('.stage-dot').forEach((dot, i) => {
        const s = stages[i];
        const currentIdx = stages.indexOf(stage);
        if (i < currentIdx) dot.className = 'stage-dot done';
        else if (i === currentIdx) dot.className = 'stage-dot current';
        else dot.className = 'stage-dot pending';
    });
    const stLabel = document.querySelector('.stage-label');
    if (stLabel) stLabel.innerText = (stageLabels[stage] || stage).toUpperCase();

    if (stage === 'complete') {
        // Track this region as conquered
        if (currentRegionId && !(window._conqueredRegions || []).includes(currentRegionId)) {
            window._conqueredRegions = window._conqueredRegions || [];
            window._conqueredRegions.push(currentRegionId);
            updateHUD();
            playSFX('conquered');
            showToast('Node conquered!', 'success');

            // Mark node as conquered on map
            worldData.regions.forEach(r => {
                if (r.id === currentRegionId && r.domNode) {
                    r.domNode.className = 'overworld-node conquered';
                    r.domNode.querySelector('.node-pulse-ring')?.remove();
                    const iconEl = r.domNode.querySelector('div');
                    if (iconEl) iconEl.innerText = '✔';
                }
            });

            // Destroy enemy sprites for this region
            enemySprites
                .filter(s => s.regionId === currentRegionId)
                .forEach(s => { s.celebrate(); setTimeout(() => s.destroy(), 1400); });

            const total = worldData.regions.length;
            const numConquered = window._conqueredRegions.length;

            if (numConquered >= total) {
                showTrophy('🏆 WORLD CONQUERED 🏆', `You have secured ${worldData.world_name} and achieved ultimate victory!`, true);
            } else {
                showTrophy('NODE CONQUERED!', `Region secured. ${total - numConquered} node(s) remaining.`, false);
                // Rebuild map so next sequential node gets unlocked
                setTimeout(() => setupMapEngine(), 1600);
            }
        }
        return;
    }

    choices.forEach(choice => {
        const btn = document.createElement('button');
        btn.className = 'v2-choice-btn';
        btn.title = choice.description || '';
        btn.innerText = choice.label;
        btn.addEventListener('mouseenter', e => { e.target.style.background = '#00ffcc1a'; e.target.style.boxShadow = '0 0 12px #00ffcc33'; });
        btn.addEventListener('mouseleave', e => { e.target.style.background = 'transparent'; e.target.style.boxShadow = 'none'; });

        if (choice.label.toLowerCase().includes('hack') || choice.id === 'hack') {
            btn.addEventListener('click', () => startMinigame(choice));
        } else {
            btn.addEventListener('click', () => sendAction(choice.label + ': ' + (choice.description || '')));
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

// ── SFX Player ─────────────────────────────────────────────────────────────
function playSFX(eventName) {
    const b64 = sfxLibrary[eventName];
    if (!b64) return;
    try {
        const audio = new Audio(`data:audio/mpeg;base64,${b64}`);
        audio.volume = 0.55;
        audio.play().catch(() => {});
    } catch (e) { /* skip if blocked */ }
}

// ── Typewriter effect for narration ─────────────────────────────────────────
let _typewriterTimer = null;

// ── Heartbeat Audio (Web Audio API synthetic) ──────────────────────────────
let _audioCtx = null;
let _heartbeatInterval = null;

function getAudioCtx() {
    if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    return _audioCtx;
}

function _playThump(ctx, time, freq = 60, duration = 0.08, gain = 0.35) {
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, time);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.4, time + duration);
    env.gain.setValueAtTime(gain, time);
    env.gain.exponentialRampToValueAtTime(0.001, time + duration * 1.4);
    osc.connect(env);
    env.connect(ctx.destination);
    osc.start(time);
    osc.stop(time + duration * 1.5);
}

function startHeartbeat() {
    if (_heartbeatInterval) return; // already running
    _heartbeatInterval = setInterval(() => {
        if (bgmMuted) return;
        try {
            const ctx = getAudioCtx();
            const now = ctx.currentTime;
            _playThump(ctx, now,       60, 0.08, 0.3);   // LUB
            _playThump(ctx, now + 0.13, 50, 0.06, 0.2);  // DUB
        } catch(e) { /* ignore if audio blocked */ }
    }, 900); // ~66 BPM
}

function stopHeartbeat() {
    if (_heartbeatInterval) { clearInterval(_heartbeatInterval); _heartbeatInterval = null; }
}

// ── Minimap Renderer ──────────────────────────────────────────────────────
let _minimapInterval = null;

function startMinimap() {
    if (_minimapInterval) clearInterval(_minimapInterval);
    _minimapInterval = setInterval(drawMinimap, 2000);
    drawMinimap(); // draw immediately
}

function drawMinimap() {
    const canvas = document.getElementById('minimap-canvas');
    if (!canvas || !worldData) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    // Background
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(0, 0, W, H);

    const conquered = window._conqueredRegions || [];
    const DIFF_CLR = { easy:'#00ffcc', medium:'#ffcc00', hard:'#ff4444' };

    // Draw regions
    (worldData.regions || []).forEach(r => {
        const px = ((r.position?.x || 50) / 100) * W;
        const py = ((r.position?.y || 50) / 100) * H;
        const isConquered = conquered.includes(r.id);
        const isBoss = r.difficulty === 'hard' &&
            worldData.regions.indexOf(r) === worldData.regions.length - 1;
        ctx.beginPath();
        ctx.arc(px, py, isBoss ? 5 : 3, 0, Math.PI * 2);
        ctx.fillStyle = isConquered ? '#00ff88' : (isBoss ? '#ffcc00' : DIFF_CLR[r.difficulty] || '#555');
        ctx.globalAlpha = isConquered ? 1 : 0.6;
        ctx.fill();
        ctx.globalAlpha = 1;
    });

    // Draw player dot
    if (typeof playerPos !== 'undefined') {
        const ppx = (playerPos.x / 100) * W;
        const ppy = (playerPos.y / 100) * H;
        ctx.beginPath();
        ctx.arc(ppx, ppy, 3.5, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = '#00ffcc';
        ctx.shadowBlur = 6;
        ctx.fill();
        ctx.shadowBlur = 0;
    }
}

function stopMinimap() {
    if (_minimapInterval) { clearInterval(_minimapInterval); _minimapInterval = null; }
}

// ── Telemetry Boss Prompt Enrichment ─────────────────────────────────────
function enrichBossAction(action, regionId) {
    // Only inject telemetry on boss nodes
    if (!worldData) return action;
    const regions = worldData.regions || [];
    const bossRegion = regions[regions.length - 1];
    if (!bossRegion || bossRegion.id !== regionId) return action;
    const summary = telemetrySummary();
    return `[PLAYER TELEMETRY: ${summary}] ${action}`;
}

function typewriterEffect(el, text, outcome = 'partial') {
    if (_typewriterTimer) clearInterval(_typewriterTimer);
    window._lastOutcome = outcome;
    el.className = 'narration-block outcome-' + outcome;
    el.innerHTML = '';

    let i = 0;
    const cursor = document.createElement('span');
    cursor.className = 'typewriter-cursor';
    el.appendChild(cursor);

    const SPEED = 22; // ms per character

    _typewriterTimer = setInterval(() => {
        if (i < text.length) {
            // Insert char before cursor
            el.insertBefore(document.createTextNode(text[i]), cursor);
            i++;
        } else {
            clearInterval(_typewriterTimer);
            setTimeout(() => cursor.remove(), 800); // remove cursor after done
        }
    }, SPEED);
}

// ── Inventory Panel ──────────────────────────────────────────────────────────
function renderInventory(items) {
    const list = document.getElementById('inventory-list');
    if (!list) return;
    list.innerHTML = '';
    if (!items || items.length === 0) {
        list.innerHTML = '<span style="color:#444; font-size:11px;">Empty</span>';
        return;
    }
    items.forEach(item => {
        const el = document.createElement('div');
        el.className = 'inv-loot-item';
        el.textContent = `▸ ${item}`;
        list.appendChild(el);
    });
}

// ── Quest Tracker Panel ──────────────────────────────────────────────────────
function renderQuestTracker(quests) {
    const list = document.getElementById('quest-list');
    if (!list || !quests) return;
    list.innerHTML = '';

    if (quests.length === 0) {
        list.innerHTML = '<span style="color:#444; font-size:10px;">No active quests</span>';
        return;
    }

    // Look up region names from worldData
    const regionMap = {};
    (worldData?.regions || []).forEach(r => { regionMap[r.id] = r.name; });

    quests.forEach(q => {
        const item = document.createElement('div');
        item.className = `quest-item${q.status === 'complete' ? ' complete' : ''}`;

        const dot = document.createElement('span');
        dot.className = 'quest-dot';
        item.appendChild(dot);

        const info = document.createElement('span');
        const regionName = regionMap[q.region_id] || q.region_id;
        info.innerHTML = `${q.title}<span class="quest-region">${regionName}</span>`;
        item.appendChild(info);

        list.appendChild(item);
    });
}

async function sendAction(actionStr, bypassRegionId = null) {
    if (!insideNode) return; // ignore overworld clicks if any leak
    
    if (dmText) { dmText.innerHTML = "Computing probabilities... Data stream active..."; dmText.style.color = "#8ab4f8"; }
    const pNarration = document.getElementById('v2-narration');
    if (pNarration) {
        pNarration.innerText = "Computing probabilities... Data stream active...";
        pNarration.className = 'narration-block';
    }
    actionButtons.classList.add('hidden'); 
    
    try {
        const response = await fetch('http://127.0.0.1:8000/action', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: enrichBossAction(actionStr, currentRegionId),
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

            if (dmText) { dmText.innerText = dmResponse.narration; dmText.style.color = textColor; }
            if (pNarration) {
                // ── Typewriter effect ──────────────────────────────────────────
                const outcome = dmResponse.outcome || 'partial';
                window._lastOutcome = outcome;
                typewriterEffect(pNarration, dmResponse.narration, outcome);
            }

            // Play outcome SFX
            playSFX(dmResponse.outcome || 'partial');

            // ── Record telemetry ───────────────────────────────────────────────
            const hpBefore = window._playerStats?.hp ?? 100;
            const hpAfterRaw = data.hp;
            telemetryRecord(dmResponse.outcome || 'partial', hpBefore, hpAfterRaw);

            // ── Apply class perks ──────────────────────────────────────────────
            let finalHp = hpAfterRaw;
            let finalXp = data.xp;
            const perk = selectedClass ? CLASSES[selectedClass]?.perk : null;
            if (perk === 'armor' && dmResponse.outcome === 'failure') {
                finalHp = Math.min(window._playerStats.maxHp, finalHp + 5);
                showToast('⚔️ Knight Armor: -5 dmg blocked!', 'info');
            }
            if (perk === 'paladin' && dmResponse.outcome === 'success') {
                finalHp = Math.min(window._playerStats.maxHp, finalHp + 8);
                showToast('💛 Paladin: +8 HP restored!', 'success');
            }
            if (perk === 'cunning' && dmResponse.outcome !== 'failure') {
                finalXp = (finalXp || 0) + 15;
                showToast('⚡ Rogue cunning: +15 XP!', 'info');
            }
            if (perk === 'scholar' && dmResponse.outcome === 'success') {
                finalXp = (finalXp || 0) + 20;
                showToast('✨ Mage mastery: +20 XP!', 'info');
            }

            // Update HUD (single source of truth)
            const maxHp = window._playerStats?.maxHp ?? 100;
            const maxEn = window._playerStats?.maxEnergy ?? 50;
            updateHUD({ xp: finalXp, hp: finalHp, energy: data.energy });
            window._playerStats = { xp: finalXp, hp: finalHp, energy: data.energy, maxHp, maxEnergy: maxEn };

            // Update inventory panel
            if (data.inventory && data.inventory.length > 0) {
                renderInventory(data.inventory);
            }
            // Update quest tracker
            if (data.active_quests) {
                renderQuestTracker(data.active_quests);
            }

            // On conquest, record telemetry + refresh minimap
            if (data.stage === 'complete' || dmResponse.region_status === 'conquered') {
                TELEMETRY.nodesConquered++;
                drawMinimap();
            }

            // Defeat: HP hit 0 → show defeat overlay (v2)
            if (data.defeated && currentRegionId) {
                const region = worldData?.regions?.find(r => r.id === currentRegionId);
                failedNodes[currentRegionId] = (failedNodes[currentRegionId] || 0) + 1;
                setTimeout(() => showDefeat(region?.name || 'Unknown', currentRegionId), 1200);
                actionButtons.classList.add('hidden');
                return;
            }

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
            if (dmText) dmText.innerText = "Error: Architect connection refused.";
            if (pNarration) pNarration.innerText = "Error: Architect connection refused.";
        }
    } catch(e) {
        actionButtons.classList.remove('hidden');

        dmText.innerText = "Critical Fault: Architect unreachable.";
    }
}

async function playNarration(text) {
    // Guard — ElevenLabs credits only spent when voice is ON
    if (!voiceEnabled) return;
    try {
        const response = await fetch('http://127.0.0.1:8000/narration', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: text })
        });

        if (response.ok) {
            const blob = await response.blob();
            if (!blob.type.includes('audio')) {
                const errText = await blob.text();
                console.warn('[Narration] Unexpected response type:', blob.type, errText);
                return;
            }
            const audioUrl = URL.createObjectURL(blob);
            const audio = new Audio(audioUrl);
            audio.onended = () => URL.revokeObjectURL(audioUrl);
            await audio.play();
        } else {
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
