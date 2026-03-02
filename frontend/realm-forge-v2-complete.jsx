import { useState, useEffect } from "react";

// ============================================================
// REALM FORGE — COMPLETE v2
// New in this version:
// 1. Difficulty gating: easy → medium → hard (must clear in order)
// 2. Failure state: HP hits 0 → defeat screen, retry costs energy
// 3. Energy regen: rest at conquered nodes
// 4. 3-strike world reset: fail 3 nodes → world resets
// 5. All previous fixes retained
// ============================================================

const INITIAL_PLAYER_STATS = {
  xp: 0, hp: 100, maxHp: 100, energy: 50, maxEnergy: 50,
};

const INITIAL_GAME_STATE = {
  phase: "MAP",
  worldsWon: 0,
  nodesConquered: [],
  failedNodes: {},      // { nodeId: failCount }
  currentNode: null,
  playerStats: INITIAL_PLAYER_STATS,
};

// ── DIFFICULTY GATING ───────────────────────────────────────
// Returns which node IDs the player can currently enter.
// Must clear all easy → then medium → then hard.
function getAvailableNodeIds(regions, conqueredIds) {
  const order = ["easy", "medium", "hard"];
  for (const diff of order) {
    const atLevel = regions.filter(r => r.difficulty === diff);
    const conqueredAtLevel = atLevel.filter(r => conqueredIds.includes(r.id));
    if (conqueredAtLevel.length < atLevel.length) {
      // This tier is the active tier — only these IDs are available
      return atLevel.map(r => r.id);
    }
  }
  return [];
}

// ── MOCK WORLD DATA ──────────────────────────────────────────
// Replace with your Mistral /generate-world output
const MOCK_WORLDS = [
  {
    world_name: "Emberveil Archipelago",
    theme: "volcanic pirate betrayal",
    lore: "Volcanic islands ruled by rival pirate clans. A traitor hides among them.",
    win_condition: "Conquer all nodes to expose Admiral Vex's betrayal",
    factions: [
      { id: "f1", name: "The Ashen Blades", personality: "aggressive", portrait_b64: null },
      { id: "f2", name: "Crimson Wake", personality: "cunning", portrait_b64: null },
    ],
    regions: [
      { id: "r1", name: "Cinder Docks", faction_id: "f2", difficulty: "easy", position: { x: 28, y: 60 } },
      { id: "r2", name: "Obsidian Spire", faction_id: "f1", difficulty: "medium", position: { x: 55, y: 35 } },
      { id: "r3", name: "Vex's Throne", faction_id: "f1", difficulty: "hard", position: { x: 75, y: 20 } },
    ],
    boss: { name: "Admiral Vex" }
  },
  {
    world_name: "Neon Sprawl",
    theme: "cyberpunk hacker resistance",
    lore: "A megacity choked by corporate control. The resistance fights from the shadows.",
    win_condition: "Hack all nodes to bring down OmniCorp",
    factions: [
      { id: "f3", name: "OmniCorp", personality: "defensive", portrait_b64: null },
      { id: "f4", name: "Ghost Network", personality: "cunning", portrait_b64: null },
    ],
    regions: [
      { id: "r4", name: "Neon Bazaar", faction_id: "f4", difficulty: "easy", position: { x: 20, y: 65 } },
      { id: "r5", name: "Data Vault", faction_id: "f3", difficulty: "medium", position: { x: 55, y: 45 } },
      { id: "r6", name: "OmniCorp HQ", faction_id: "f3", difficulty: "hard", position: { x: 75, y: 22 } },
    ],
    boss: { name: "Director Kane" }
  },
  {
    world_name: "Verdant Ruins",
    theme: "jungle ancient magic corruption",
    lore: "Ancient temples reclaimed by dark jungle spirits.",
    win_condition: "Cleanse all corrupted nodes to face the Shadow Serpent",
    factions: [
      { id: "f5", name: "Stone Wardens", personality: "defensive", portrait_b64: null },
      { id: "f6", name: "Shadow Coil", personality: "aggressive", portrait_b64: null },
    ],
    regions: [
      { id: "r7", name: "Overgrown Altar", faction_id: "f5", difficulty: "easy", position: { x: 25, y: 65 } },
      { id: "r8", name: "Serpent's Nest", faction_id: "f6", difficulty: "medium", position: { x: 60, y: 42 } },
      { id: "r9", name: "The Dark Heart", faction_id: "f6", difficulty: "hard", position: { x: 72, y: 20 } },
    ],
    boss: { name: "The Shadow Serpent" }
  }
];

// ── GLOBAL STYLES ─────────────────────────────────────────────
const GLOBAL_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap');

  * { box-sizing: border-box; margin: 0; padding: 0; }

  @keyframes confettiFall {
    0%   { transform: translateY(0) rotate(0deg); opacity: 1; }
    100% { transform: translateY(110vh) rotate(720deg); opacity: 0; }
  }
  @keyframes trophyBounce {
    0%, 100% { transform: translateY(0) scale(1); }
    50%       { transform: translateY(-18px) scale(1.08); }
  }
  @keyframes shimmer {
    0%, 100% { filter: drop-shadow(0 0 10px #ffcc00); }
    50%       { filter: drop-shadow(0 0 30px #ffcc00) drop-shadow(0 0 60px #ff8800); }
  }
  @keyframes slideUp {
    from { opacity: 0; transform: translateY(30px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes nodeRing {
    0%, 100% { transform: translate(-50%,-50%) scale(1); opacity: 0.6; }
    50%       { transform: translate(-50%,-50%) scale(1.35); opacity: 0.15; }
  }
  @keyframes skullShake {
    0%,100% { transform: rotate(0deg); }
    20%     { transform: rotate(-8deg); }
    40%     { transform: rotate(8deg); }
    60%     { transform: rotate(-5deg); }
    80%     { transform: rotate(5deg); }
  }
  @keyframes hpPulse {
    0%,100% { box-shadow: 0 0 6px #ff444466; }
    50%     { box-shadow: 0 0 16px #ff4444cc; }
  }
  @keyframes worldGlow {
    0%,100% { box-shadow: 0 0 0px transparent; }
    50%     { box-shadow: 0 0 24px #00ffcc22; }
  }
  @keyframes toastIn {
    from { opacity: 0; transform: translateX(-50%) translateY(10px); }
    to   { opacity: 1; transform: translateX(-50%) translateY(0); }
  }
  @keyframes fadeOut {
    from { opacity: 1; }
    to   { opacity: 0; }
  }
`;

// ── PORTRAIT SVG (unique per faction personality) ────────────
function FactionPortrait({ faction, size = 72 }) {
  const cfg = {
    aggressive: { bg: "#1a0505", ring: "#ff4444", glow: "#ff444466", body: "#cc2222", eye: "#ffff00", brow: "angry" },
    cunning:    { bg: "#0a0515", ring: "#8833ff", glow: "#8833ff66", body: "#6611cc", eye: "#00ffcc", brow: "raised" },
    defensive:  { bg: "#050a1a", ring: "#4488ff", glow: "#4488ff66", body: "#2255cc", eye: "#aaddff", brow: "stern" },
    diplomatic: { bg: "#1a1505", ring: "#ffcc00", glow: "#ffcc0066", body: "#cc9900", eye: "#ff8800", brow: "calm" },
  }[faction?.personality || "aggressive"];

  if (faction?.portrait_b64) {
    return (
      <img src={`data:image/png;base64,${faction.portrait_b64}`}
        style={{ width: size, height: size, borderRadius: 6, border: `2px solid ${cfg.ring}`, boxShadow: `0 0 16px ${cfg.glow}`, imageRendering: "pixelated" }}
        alt={faction.name} />
    );
  }

  const s = size;
  return (
    <svg width={s} height={s} viewBox="0 0 80 80" style={{ borderRadius: 6, border: `2px solid ${cfg.ring}`, boxShadow: `0 0 16px ${cfg.glow}`, flexShrink: 0 }}>
      <rect width="80" height="80" fill={cfg.bg} />
      <ellipse cx="40" cy="55" rx="28" ry="30" fill={cfg.body} opacity="0.25" />
      {/* Body/armor */}
      <rect x="18" y="52" width="44" height="32" rx="10" fill={cfg.body} opacity="0.85" />
      <rect x="28" y="54" width="24" height="7" rx="3" fill="#ffffff" opacity="0.18" />
      {/* Neck */}
      <rect x="34" y="46" width="12" height="8" fill={cfg.body} opacity="0.7" />
      {/* Head */}
      <ellipse cx="40" cy="35" rx="17" ry="19" fill={cfg.body} opacity="0.9" />
      <ellipse cx="40" cy="37" rx="13" ry="14" fill={cfg.bg} opacity="0.6" />
      {/* Eyes */}
      {cfg.brow === "angry" && <>
        <line x1="28" y1="28" x2="36" y2="31" stroke={cfg.eye} strokeWidth="2" />
        <line x1="52" y1="28" x2="44" y2="31" stroke={cfg.eye} strokeWidth="2" />
      </>}
      {cfg.brow === "raised" && <>
        <path d="M28,27 Q32,24 36,27" stroke={cfg.eye} strokeWidth="1.5" fill="none" />
        <path d="M44,27 Q48,24 52,27" stroke={cfg.eye} strokeWidth="1.5" fill="none" />
      </>}
      {cfg.brow === "stern" && <>
        <line x1="28" y1="29" x2="36" y2="29" stroke={cfg.eye} strokeWidth="2" />
        <line x1="44" y1="29" x2="52" y2="29" stroke={cfg.eye} strokeWidth="2" />
      </>}
      {cfg.brow === "calm" && <>
        <path d="M28,28 Q32,26 36,28" stroke={cfg.eye} strokeWidth="1.5" fill="none" />
        <path d="M44,28 Q48,26 52,28" stroke={cfg.eye} strokeWidth="1.5" fill="none" />
      </>}
      <ellipse cx="32" cy="35" rx="5" ry="5" fill={cfg.eye} opacity="0.95" />
      <ellipse cx="48" cy="35" rx="5" ry="5" fill={cfg.eye} opacity="0.95" />
      <circle cx="33" cy="36" r="2.5" fill="#000" />
      <circle cx="49" cy="36" r="2.5" fill="#000" />
      <circle cx="34" cy="35" r="1" fill="#fff" opacity="0.7" />
      <circle cx="50" cy="35" r="1" fill="#fff" opacity="0.7" />
      {/* Mouth */}
      {faction?.personality === "aggressive" && <path d="M34,46 L40,43 L46,46" stroke={cfg.eye} strokeWidth="1.5" fill="none" />}
      {faction?.personality === "cunning" && <path d="M34,45 Q40,49 46,45" stroke={cfg.eye} strokeWidth="1.5" fill="none" />}
      {faction?.personality === "defensive" && <line x1="35" y1="46" x2="45" y2="46" stroke={cfg.eye} strokeWidth="1.5" />}
      {faction?.personality === "diplomatic" && <path d="M34,45 Q40,48 46,45" stroke={cfg.eye} strokeWidth="1" fill="none" />}
      {/* Hair/helmet */}
      <ellipse cx="40" cy="18" rx="15" ry="7" fill={cfg.body} opacity="0.8" />
      {faction?.personality === "aggressive" && <>
        <polygon points="25,18 22,8 28,16" fill={cfg.body} opacity="0.9" />
        <polygon points="55,18 58,8 52,16" fill={cfg.body} opacity="0.9" />
      </>}
      {faction?.personality === "cunning" && <ellipse cx="40" cy="13" rx="8" ry="4" fill={cfg.body} opacity="0.6" />}
      {faction?.personality === "defensive" && <rect x="25" y="12" width="30" height="6" rx="2" fill={cfg.body} opacity="0.7" />}
    </svg>
  );
}

// ── TOAST NOTIFICATION ────────────────────────────────────────
function Toast({ message, type = "info", onDone }) {
  const colors = { info: "#00ffcc", warn: "#ffcc00", danger: "#ff4444", success: "#00ff88" };
  useEffect(() => {
    const t = setTimeout(onDone, 2400);
    return () => clearTimeout(t);
  }, []);
  return (
    <div style={{
      position: "fixed", bottom: 100, left: "50%",
      transform: "translateX(-50%)",
      background: "rgba(0,0,0,0.92)",
      border: `1px solid ${colors[type]}`,
      color: colors[type],
      fontFamily: "'Press Start 2P', monospace",
      fontSize: 9, padding: "10px 20px",
      borderRadius: 4, zIndex: 9000,
      boxShadow: `0 0 16px ${colors[type]}44`,
      animation: "toastIn 0.3s ease-out",
      whiteSpace: "nowrap",
    }}>
      {message}
    </div>
  );
}

// ── HP BAR ────────────────────────────────────────────────────
function HpBar({ current, max, width = 80 }) {
  const pct = Math.max(0, Math.min(100, (current / max) * 100));
  const color = pct > 50 ? "#00ff88" : pct > 25 ? "#ffcc00" : "#ff4444";
  return (
    <div style={{ width, height: 6, background: "#222", borderRadius: 3, overflow: "hidden",
      boxShadow: pct < 25 ? "0 0 8px #ff444466" : "none",
      animation: pct < 25 ? "hpPulse 1s infinite" : "none",
    }}>
      <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 3, transition: "width 0.4s, background 0.4s" }} />
    </div>
  );
}

// ── TROPHY SCREEN ─────────────────────────────────────────────
function TrophyScreen({ worldName, onContinue, isGameWin }) {
  const [particles] = useState(() =>
    Array.from({ length: 45 }, (_, i) => ({
      id: i, x: Math.random() * 100,
      delay: Math.random() * 1.8,
      duration: 2.2 + Math.random() * 1.8,
      color: ["#ffcc00","#00ffcc","#ff4444","#ffffff","#ff8800","#88ff44"][i % 6],
      size: 5 + Math.random() * 9,
      round: Math.random() > 0.5,
    }))
  );
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.93)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2000, flexDirection: "column" }}>
      {particles.map(p => (
        <div key={p.id} style={{
          position: "absolute", left: `${p.x}%`, top: -20,
          width: p.size, height: p.size,
          background: p.color,
          borderRadius: p.round ? "50%" : 2,
          animation: `confettiFall ${p.duration}s ${p.delay}s ease-in infinite`,
          pointerEvents: "none",
        }} />
      ))}
      <div style={{ animation: "trophyBounce 1.6s ease-in-out infinite, shimmer 2s ease-in-out infinite" }}>
        <svg width="150" height="165" viewBox="0 0 140 160">
          <defs>
            <linearGradient id="tg" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#ffe066" />
              <stop offset="100%" stopColor="#ff8800" />
            </linearGradient>
          </defs>
          <path d="M32,18 L108,18 L97,92 Q70,114 43,92 Z" fill="url(#tg)" stroke="#cc7700" strokeWidth="1.5" />
          <path d="M44,24 L62,24 L56,72 Q50,82 44,72 Z" fill="#fff" opacity="0.25" />
          <path d="M32,28 Q10,28 10,56 Q10,78 32,72" stroke="url(#tg)" strokeWidth="9" fill="none" strokeLinecap="round" />
          <path d="M108,28 Q130,28 130,56 Q130,78 108,72" stroke="url(#tg)" strokeWidth="9" fill="none" strokeLinecap="round" />
          <rect x="60" y="96" width="20" height="26" fill="#cc8800" />
          <rect x="42" y="120" width="56" height="14" rx="5" fill="url(#tg)" stroke="#cc7700" strokeWidth="1.5" />
          <text x="70" y="68" textAnchor="middle" fontSize="30" fill="#7a4400" opacity="0.7">★</text>
          <text x="70" y="66" textAnchor="middle" fontSize="26" fill="#fff" opacity="0.9">★</text>
          {["18,18","114,22","10,75","128,68","60,10","80,8"].map((pos, i) => (
            <text key={i} x={pos.split(",")[0]} y={pos.split(",")[1]} fontSize={10 + (i % 3) * 3} fill="#ffff88" opacity={0.6 + (i % 3) * 0.15}>✦</text>
          ))}
        </svg>
      </div>
      <div style={{ textAlign: "center", marginTop: 20, animation: "slideUp 0.5s 0.2s both" }}>
        <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: isGameWin ? 20 : 16, color: "#ffcc00", textShadow: "0 0 24px #ffcc00, 0 0 48px #ff880066", marginBottom: 10 }}>
          {isGameWin ? "🏆 ULTIMATE VICTORY" : "WORLD CLEARED!"}
        </div>
        <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 10, color: "#00ffcc", marginBottom: 6 }}>{worldName}</div>
        <div style={{ fontFamily: "monospace", fontSize: 13, color: "#666", marginBottom: 30 }}>
          {isGameWin ? "You have conquered all three worlds. Legend." : "Return to the map to claim your next world."}
        </div>
        <button onClick={onContinue} style={{
          fontFamily: "'Press Start 2P', monospace", fontSize: 10,
          background: "transparent", border: `2px solid ${isGameWin ? "#ffcc00" : "#00ffcc"}`,
          color: isGameWin ? "#ffcc00" : "#00ffcc", padding: "12px 28px", cursor: "pointer",
          boxShadow: `0 0 20px ${isGameWin ? "#ffcc0055" : "#00ffcc55"}`, letterSpacing: 2,
        }}>
          {isGameWin ? "PLAY AGAIN" : "BACK TO MAP →"}
        </button>
      </div>
    </div>
  );
}

// ── DEFEAT SCREEN ─────────────────────────────────────────────
function DefeatScreen({ nodeName, canRetry, energyCost, failCount, onRetry, onRetreat }) {
  const isWorldReset = failCount >= 3;
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.92)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", zIndex: 2000 }}>
      <div style={{ fontSize: 64, animation: "skullShake 0.6s ease-in-out", marginBottom: 16 }}>💀</div>
      <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 18, color: "#ff4444", textShadow: "0 0 20px #ff4444", marginBottom: 10 }}>
        DEFEATED
      </div>
      <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 9, color: "#ff8888", marginBottom: 8 }}>
        {nodeName} has repelled you.
      </div>
      {isWorldReset ? (
        <div style={{ fontFamily: "monospace", fontSize: 13, color: "#ff6666", marginBottom: 8, textAlign: "center", maxWidth: 360 }}>
          You have failed this node 3 times.<br />
          <span style={{ color: "#ff4444", fontWeight: "bold" }}>This world resets.</span>
        </div>
      ) : (
        <div style={{ fontFamily: "monospace", fontSize: 13, color: "#666", marginBottom: 8, textAlign: "center" }}>
          Fail count: {failCount}/3 — fail again and this world resets.
          {!canRetry && " You are too exhausted to retry right now."}
        </div>
      )}
      <div style={{ fontFamily: "monospace", fontSize: 12, color: "#444", marginBottom: 32 }}>
        You survive with 15 HP. Rest at a conquered node to recover.
      </div>
      <div style={{ display: "flex", gap: 16 }}>
        {canRetry && !isWorldReset && (
          <button onClick={onRetry} style={{
            fontFamily: "'Press Start 2P', monospace", fontSize: 8,
            background: "transparent", border: "2px solid #ff4444",
            color: "#ff4444", padding: "10px 18px", cursor: "pointer",
          }}>
            RETRY (−{energyCost} ENERGY)
          </button>
        )}
        <button onClick={onRetreat} style={{
          fontFamily: "'Press Start 2P', monospace", fontSize: 8,
          background: "transparent", border: "2px solid #444",
          color: "#888", padding: "10px 18px", cursor: "pointer",
        }}>
          {isWorldReset ? "RESET WORLD" : "RETREAT TO MAP"}
        </button>
      </div>
    </div>
  );
}

// ── MAP NODE ──────────────────────────────────────────────────
function MapNode({ region, faction, isConquered, isAvailable, isLocked, isActive, onClick, onRest }) {
  const [hovered, setHovered] = useState(false);

  const personalityIcon = { aggressive: "⚔️", cunning: "🗡️", defensive: "🛡️", diplomatic: "📜" };
  const diffColor = { easy: "#00ffcc", medium: "#ffcc00", hard: "#ff4444" };
  const unlockHint = { medium: "clear easy first", hard: "clear medium first" };

  if (isLocked) {
    return (
      <div style={{ position: "absolute", left: `${region.position.x}%`, top: `${region.position.y}%`, transform: "translate(-50%,-50%)", userSelect: "none" }}>
        <div style={{ width: 54, height: 54, borderRadius: "50%", background: "rgba(0,0,0,0.5)", border: "2px solid #222", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, opacity: 0.35 }}>🔒</div>
        <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 6, color: "#333", textAlign: "center", marginTop: 6, whiteSpace: "nowrap" }}>{region.name}</div>
        <div style={{ fontFamily: "monospace", fontSize: 10, color: "#2a2a2a", textAlign: "center", marginTop: 2 }}>{unlockHint[region.difficulty]}</div>
      </div>
    );
  }

  const color = isConquered ? "#00ff88" : isActive ? "#ffcc00" : diffColor[region.difficulty];

  return (
    <div
      onClick={isConquered ? onRest : onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ position: "absolute", left: `${region.position.x}%`, top: `${region.position.y}%`, transform: "translate(-50%,-50%)", cursor: "pointer", zIndex: isActive ? 20 : 10, userSelect: "none" }}
    >
      {/* Pulse ring — only on unconquered available nodes */}
      {isAvailable && !isConquered && (
        <div style={{
          position: "absolute", width: 70, height: 70, borderRadius: "50%",
          border: `2px solid ${color}`, top: "50%", left: "50%",
          animation: "nodeRing 2.2s ease-in-out infinite",
          pointerEvents: "none",
        }} />
      )}
      {/* Main circle */}
      <div style={{
        width: 54, height: 54, borderRadius: "50%",
        background: isConquered ? "radial-gradient(circle, #00ff8822, #00ff8808)" : "radial-gradient(circle, #111, #080808)",
        border: `2px solid ${color}`,
        boxShadow: hovered || isActive ? `0 0 22px ${color}, 0 0 44px ${color}33` : `0 0 8px ${color}55`,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 20,
        transform: hovered ? "scale(1.14)" : "scale(1)",
        transition: "all 0.18s",
        position: "relative",
      }}>
        {isConquered ? "✓" : (personalityIcon[faction?.personality] || "◆")}
        {/* Difficulty badge */}
        {!isConquered && (
          <div style={{
            position: "absolute", top: -5, right: -5,
            width: 15, height: 15, borderRadius: "50%",
            background: diffColor[region.difficulty],
            fontSize: 7, display: "flex", alignItems: "center", justifyContent: "center",
            fontWeight: "bold", color: "#000", fontFamily: "monospace",
          }}>
            {region.difficulty[0].toUpperCase()}
          </div>
        )}
        {/* Rest icon on conquered nodes */}
        {isConquered && (
          <div style={{ position: "absolute", bottom: -4, right: -4, fontSize: 10 }}>🛖</div>
        )}
      </div>
      {/* Name */}
      <div style={{
        position: "absolute", top: "100%", left: "50%", transform: "translateX(-50%)",
        marginTop: 7, whiteSpace: "nowrap",
        fontFamily: "'Press Start 2P', monospace", fontSize: 6.5, color: color,
        textShadow: `0 0 6px ${color}`, opacity: hovered ? 1 : 0.7, transition: "opacity 0.2s",
      }}>
        {region.name}
      </div>
      {/* Hover tooltip */}
      {hovered && !isConquered && (
        <div style={{
          position: "absolute", bottom: "100%", left: "50%", transform: "translateX(-50%)",
          marginBottom: 10, whiteSpace: "nowrap",
          background: "rgba(0,0,0,0.92)", border: `1px solid ${color}`,
          padding: "5px 10px", borderRadius: 4,
          fontFamily: "monospace", fontSize: 11, color: "#ccc", zIndex: 50,
        }}>
          {faction?.name || "?"} · <span style={{ color }}>{region.difficulty}</span>
        </div>
      )}
      {/* Rest tooltip on conquered */}
      {hovered && isConquered && (
        <div style={{
          position: "absolute", bottom: "100%", left: "50%", transform: "translateX(-50%)",
          marginBottom: 10, whiteSpace: "nowrap",
          background: "rgba(0,0,0,0.92)", border: "1px solid #00ff88",
          padding: "5px 10px", borderRadius: 4,
          fontFamily: "monospace", fontSize: 11, color: "#00ff88", zIndex: 50,
        }}>
          🛖 Rest here: +20 HP, +15 Energy
        </div>
      )}
    </div>
  );
}

// ── NODE ENCOUNTER ────────────────────────────────────────────
function NodeEncounter({ node, faction, worldTheme, playerStats, onComplete, onFail, onExit }) {
  const [stage, setStage] = useState("approach");
  const [narration, setNarration] = useState(`You approach ${node.name}. The ${faction?.name || "enemy"} watches.`);
  const [choices, setChoices] = useState([
    { id: "a", label: "Scout ahead quietly" },
    { id: "b", label: "Charge in boldly" },
    { id: "c", label: "Send a decoy first" },
  ]);
  const [loading, setLoading] = useState(false);
  const [outcome, setOutcome] = useState(null);
  const [currentHp, setCurrentHp] = useState(playerStats.hp);

  const stageLabel = { approach: "APPROACH", challenge: "CHALLENGE", resolution: "RESOLUTION" };
  const outcomeColor = { success: "#00ffcc", partial: "#ffcc00", failure: "#ff4444" };

  // MOCK responses — REPLACE with your real /action API call
  const MOCK = {
    approach: {
      narration: "Scouts report: three guards at the eastern gate, rotating every ten minutes. A drainage tunnel on the west sits unguarded. The faction's banner ripples in the sulfur wind.",
      next_stage: "challenge",
      choices: [{ id: "a", label: "Use the drain tunnel" }, { id: "b", label: "Overpower the guards" }, { id: "c", label: "Create a distraction" }],
      outcome: "partial", xp: 10, hp_delta: 0,
    },
    challenge: {
      narration: "The confrontation is fierce. You gain the upper hand through cunning — but not without cost. The faction's leader retreats with a snarl, promising revenge.",
      next_stage: "resolution",
      choices: [{ id: "a", label: "Pursue the leader" }, { id: "b", label: "Secure the node now" }, { id: "c", label: "Take loot and leave" }],
      outcome: "success", xp: 20, hp_delta: -20,
    },
    resolution: {
      narration: "The node falls. The faction's banner is torn down, replaced with your mark. The region breathes easier — for now.",
      next_stage: "complete",
      choices: [],
      outcome: "success", xp: 30, hp_delta: 10,
    },
  };

  async function handleChoice(choice) {
    setLoading(true);
    setOutcome(null);

    // ── WIRE YOUR MISTRAL /action CALL HERE ──────────────────
    // const res = await fetch('/action', {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify({ game_state: { node, stage, worldTheme }, player_action: choice.label, stage })
    // });
    // const data = await res.json();
    // const response = data; // should have: narration, next_stage, choices, outcome, xp, hp_delta
    // ─────────────────────────────────────────────────────────

    await new Promise(r => setTimeout(r, 1100));
    const response = MOCK[stage] || MOCK.resolution;

    const newHp = Math.max(0, currentHp + response.hp_delta);
    setCurrentHp(newHp);
    setNarration(response.narration);
    setOutcome(response.outcome);

    // ── FAILURE: HP hits 0 ───────────────────────────────────
    if (newHp <= 0) {
      setTimeout(() => onFail({ nodeId: node.id, xpLost: 10 }), 1200);
      setLoading(false);
      return;
    }

    if (response.next_stage === "complete") {
      setTimeout(() => onComplete({ xp: response.xp, hp_delta: response.hp_delta, nodeId: node.id }), 1400);
    } else {
      setStage(response.next_stage);
      setChoices(response.choices);
    }
    setLoading(false);
  }

  const hpPct = Math.max(0, (currentHp / playerStats.maxHp) * 100);
  const hpColor = hpPct > 50 ? "#00ff88" : hpPct > 25 ? "#ffcc00" : "#ff4444";

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.86)", display: "flex", alignItems: "flex-end", justifyContent: "center", paddingBottom: 36, zIndex: 500 }}>
      <div style={{ width: "min(880px, 96vw)", background: "rgba(6,8,20,0.98)", border: "1px solid #00ffcc22", borderRadius: 8, padding: "26px 30px", boxShadow: "0 0 48px rgba(0,255,204,0.08)" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 18 }}>
          <FactionPortrait faction={faction || { personality: "aggressive", name: node.name }} size={68} />
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 12, color: "#00ffcc", textShadow: "0 0 8px #00ffcc", marginBottom: 5 }}>
              {faction?.name?.toUpperCase() || node.name.toUpperCase()}
            </div>
            <div style={{ fontFamily: "monospace", fontSize: 11, color: outcomeColor[outcome] || "#555", letterSpacing: 2 }}>
              ◆ {outcome ? outcome.toUpperCase() : stageLabel[stage]}
            </div>
            {/* Live HP bar during encounter */}
            <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 7, color: hpColor }}>HP</span>
              <div style={{ flex: 1, height: 6, background: "#111", borderRadius: 3, overflow: "hidden" }}>
                <div style={{ width: `${hpPct}%`, height: "100%", background: hpColor, borderRadius: 3, transition: "width 0.4s, background 0.4s", boxShadow: hpPct < 25 ? `0 0 8px ${hpColor}` : "none" }} />
              </div>
              <span style={{ fontFamily: "monospace", fontSize: 10, color: hpColor }}>{currentHp}/{playerStats.maxHp}</span>
            </div>
          </div>
          <button onClick={onExit} style={{ background: "none", border: "1px solid #333", color: "#555", fontFamily: "'Press Start 2P', monospace", fontSize: 8, padding: "6px 12px", cursor: "pointer" }}>← EXIT</button>
        </div>

        {/* Narration */}
        <div style={{
          fontFamily: "'Courier New', monospace", fontSize: 14.5, lineHeight: 1.75,
          color: outcome === "failure" ? "#ff8888" : outcome === "success" ? "#ccffee" : "#ddd",
          marginBottom: 22, minHeight: 76,
          borderLeft: `3px solid ${outcomeColor[outcome] || "#00ffcc33"}`,
          paddingLeft: 16,
        }}>
          {loading ? <span style={{ color: "#444", animation: "pulse 1s infinite" }}>The Architect deliberates...</span> : narration}
        </div>

        {/* Choices */}
        {!loading && choices.length > 0 && (
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {choices.map(c => (
              <button key={c.id} onClick={() => handleChoice(c)} style={{
                fontFamily: "'Press Start 2P', monospace", fontSize: 8, padding: "10px 16px",
                background: "transparent", border: "1px solid #00ffcc", color: "#00ffcc",
                cursor: "pointer", borderRadius: 4, transition: "all 0.15s", letterSpacing: 1,
              }}
                onMouseEnter={e => { e.target.style.background = "#00ffcc1a"; e.target.style.boxShadow = "0 0 12px #00ffcc33"; }}
                onMouseLeave={e => { e.target.style.background = "transparent"; e.target.style.boxShadow = "none"; }}
              >
                {c.label}
              </button>
            ))}
          </div>
        )}

        {/* Stage dots */}
        <div style={{ display: "flex", gap: 8, marginTop: 18, alignItems: "center" }}>
          {["approach", "challenge", "resolution"].map((s, i) => (
            <div key={s} style={{
              width: 7, height: 7, borderRadius: "50%",
              background: s === stage ? "#00ffcc" : ["approach","challenge","resolution"].indexOf(stage) > i ? "#00ffcc33" : "#1a1a1a",
              boxShadow: s === stage ? "0 0 8px #00ffcc" : "none", transition: "all 0.3s",
            }} />
          ))}
          <span style={{ fontFamily: "monospace", fontSize: 9, color: "#333", marginLeft: 6 }}>{stageLabel[stage]}</span>
        </div>
      </div>
    </div>
  );
}

// ── MAIN APP ──────────────────────────────────────────────────
export default function RealmForge() {
  const [gs, setGs] = useState(INITIAL_GAME_STATE);
  const [worlds] = useState(MOCK_WORLDS);
  const [activeWorldIdx, setActiveWorldIdx] = useState(null);
  const [showTrophy, setShowTrophy] = useState(false);
  const [showDefeat, setShowDefeat] = useState(false);
  const [defeatNode, setDefeatNode] = useState(null);
  const [isGameWin, setIsGameWin] = useState(false);
  const [toast, setToast] = useState(null);

  const currentWorld = activeWorldIdx !== null ? worlds[activeWorldIdx] : null;

  const worldNodesConquered = currentWorld
    ? currentWorld.regions.filter(r => gs.nodesConquered.includes(r.id)).length
    : 0;

  function showToast(message, type = "info") {
    setToast({ message, type, key: Date.now() });
  }

  // ── WIN CONDITION CHECK ──────────────────────────────────
  useEffect(() => {
    if (!currentWorld || showTrophy) return;
    const allIds = currentWorld.regions.map(r => r.id);
    const allCleared = allIds.every(id => gs.nodesConquered.includes(id));
    if (allCleared && allIds.length > 0) {
      const newWorldsWon = gs.worldsWon + 1;
      setGs(s => ({ ...s, worldsWon: newWorldsWon }));
      setIsGameWin(newWorldsWon >= 3);
      setTimeout(() => setShowTrophy(true), 600);
    }
  }, [gs.nodesConquered, currentWorld?.world_name]);

  // ── NODE CONQUERED ───────────────────────────────────────
  function handleNodeComplete({ xp, hp_delta, nodeId }) {
    setGs(s => ({
      ...s,
      nodesConquered: [...s.nodesConquered, nodeId],
      currentNode: null,
      phase: "MAP",
      playerStats: {
        ...s.playerStats,
        xp: s.playerStats.xp + xp,
        hp: Math.min(s.playerStats.maxHp, Math.max(0, s.playerStats.hp + hp_delta)),
      }
    }));
    showToast(`+${xp} XP — Node conquered!`, "success");
  }

  // ── NODE FAILED ──────────────────────────────────────────
  function handleNodeFail({ nodeId, xpLost }) {
    setGs(s => {
      const prevFails = s.failedNodes[nodeId] || 0;
      const newFails = prevFails + 1;
      const isWorldReset = newFails >= 3;

      const newState = {
        ...s,
        phase: "MAP",
        currentNode: null,
        failedNodes: { ...s.failedNodes, [nodeId]: newFails },
        playerStats: {
          ...s.playerStats,
          hp: 15,                                         // survive with 15hp
          xp: Math.max(0, s.playerStats.xp - xpLost),   // XP penalty
          energy: Math.max(0, s.playerStats.energy - 20), // energy cost
        },
      };

      // 3 fails = reset this world's nodes
      if (isWorldReset && currentWorld) {
        const worldIds = currentWorld.regions.map(r => r.id);
        newState.nodesConquered = s.nodesConquered.filter(id => !worldIds.includes(id));
        newState.failedNodes = { ...newState.failedNodes, [nodeId]: 0 };
      }

      return newState;
    });

    setDefeatNode(nodeId);
    setShowDefeat(true);
  }

  // ── RETRY NODE ───────────────────────────────────────────
  function handleRetry() {
    setShowDefeat(false);
    // Re-enter the same node
    if (defeatNode && currentWorld) {
      const region = currentWorld.regions.find(r => r.id === defeatNode);
      if (region) {
        setGs(s => ({
          ...s,
          currentNode: region,
          phase: "NODE_ENCOUNTER",
          playerStats: { ...s.playerStats, energy: Math.max(0, s.playerStats.energy - 20) },
        }));
      }
    }
  }

  // ── REST AT CONQUERED NODE ───────────────────────────────
  function handleRest(region) {
    if (gs.playerStats.hp >= gs.playerStats.maxHp && gs.playerStats.energy >= gs.playerStats.maxEnergy) {
      showToast("Already at full health!", "info");
      return;
    }
    setGs(s => ({
      ...s,
      playerStats: {
        ...s.playerStats,
        hp: Math.min(s.playerStats.maxHp, s.playerStats.hp + 20),
        energy: Math.min(s.playerStats.maxEnergy, s.playerStats.energy + 15),
      }
    }));
    showToast(`Rested at ${region.name}. +20 HP, +15 Energy`, "success");
  }

  // ── TROPHY CONTINUE ──────────────────────────────────────
  function handleTrophyContinue() {
    setShowTrophy(false);
    if (isGameWin) {
      setGs(INITIAL_GAME_STATE);
      setActiveWorldIdx(null);
    } else {
      setActiveWorldIdx(null);
      setGs(s => ({ ...s, phase: "MAP", currentNode: null }));
    }
  }

  // ── WORLD SELECT SCREEN ──────────────────────────────────
  function WorldSelectScreen() {
    return (
      <div style={{ minHeight: "100vh", background: "#060810", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 40 }}>
        <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 20, color: "#00ffcc", textShadow: "0 0 24px #00ffcc", marginBottom: 8 }}>REALM FORGE</div>
        <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 8, color: "#333", letterSpacing: 3, marginBottom: 40 }}>CONQUER 3 WORLDS TO WIN</div>

        {/* Overall progress */}
        <div style={{ display: "flex", gap: 10, marginBottom: 48, alignItems: "center" }}>
          {[0,1,2].map(i => (
            <div key={i} style={{
              width: 18, height: 18, borderRadius: 3,
              background: i < gs.worldsWon ? "#ffcc00" : "#111",
              border: `1px solid ${i < gs.worldsWon ? "#ffcc00" : "#222"}`,
              boxShadow: i < gs.worldsWon ? "0 0 10px #ffcc00" : "none",
            }} />
          ))}
          <span style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 7, color: "#444", marginLeft: 8 }}>
            {gs.worldsWon}/3 WORLDS
          </span>
        </div>

        {/* Player stats summary */}
        <div style={{ display: "flex", gap: 24, marginBottom: 40, fontFamily: "'Press Start 2P', monospace", fontSize: 8 }}>
          <span style={{ color: "#00ffcc" }}>XP: {gs.playerStats.xp}</span>
          <span style={{ color: "#ff4444" }}>HP: {gs.playerStats.hp}/{gs.playerStats.maxHp}</span>
          <span style={{ color: "#4488ff" }}>ENERGY: {gs.playerStats.energy}/{gs.playerStats.maxEnergy}</span>
        </div>

        {/* World cards */}
        <div style={{ display: "flex", gap: 20, flexWrap: "wrap", justifyContent: "center" }}>
          {worlds.map((world, i) => {
            const regionIds = world.regions.map(r => r.id);
            const cleared = regionIds.filter(id => gs.nodesConquered.includes(id)).length;
            const isWon = regionIds.every(id => gs.nodesConquered.includes(id));
            const inProgress = cleared > 0 && !isWon;
            const availableIds = getAvailableNodeIds(world.regions, gs.nodesConquered.filter(id => regionIds.includes(id)));
            const currentTier = world.regions.find(r => availableIds.includes(r.id))?.difficulty || "complete";

            return (
              <div key={world.world_name}
                onClick={() => !isWon && setActiveWorldIdx(i)}
                style={{
                  width: 210, padding: "22px 20px",
                  background: "rgba(0,0,0,0.55)",
                  border: `1px solid ${isWon ? "#ffcc0044" : "#00ffcc22"}`,
                  borderRadius: 8, cursor: isWon ? "default" : "pointer",
                  opacity: isWon ? 0.55 : 1,
                  transition: "all 0.2s",
                  animation: !isWon && !inProgress ? "worldGlow 3s ease-in-out infinite" : "none",
                }}
                onMouseEnter={e => !isWon && (e.currentTarget.style.borderColor = "#00ffcc88")}
                onMouseLeave={e => !isWon && (e.currentTarget.style.borderColor = "#00ffcc22")}
              >
                <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 7.5, color: isWon ? "#ffcc00" : inProgress ? "#00ffcc" : "#444", marginBottom: 10 }}>
                  {isWon ? "✓ CLEARED" : inProgress ? `● ${currentTier.toUpperCase()} TIER` : `WORLD ${i+1}`}
                </div>
                <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 9, color: "#eee", marginBottom: 7, lineHeight: 1.7 }}>{world.world_name}</div>
                <div style={{ fontFamily: "monospace", fontSize: 11, color: "#555", marginBottom: 14, lineHeight: 1.5 }}>{world.theme}</div>
                {/* Tier indicators */}
                <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
                  {["easy","medium","hard"].map(d => {
                    const nodes = world.regions.filter(r => r.difficulty === d);
                    const doneCount = nodes.filter(r => gs.nodesConquered.includes(r.id)).length;
                    const dColor = { easy: "#00ffcc", medium: "#ffcc00", hard: "#ff4444" }[d];
                    return (
                      <div key={d} style={{ flex: 1, textAlign: "center" }}>
                        <div style={{ fontFamily: "monospace", fontSize: 8, color: doneCount === nodes.length ? dColor : "#333", marginBottom: 3 }}>
                          {d[0].toUpperCase()}
                        </div>
                        <div style={{ height: 3, background: doneCount === nodes.length ? dColor : "#1a1a1a", borderRadius: 2 }} />
                      </div>
                    );
                  })}
                </div>
                {/* Progress bar */}
                <div style={{ height: 3, background: "#0a0a0a", borderRadius: 2, overflow: "hidden" }}>
                  <div style={{ width: `${(cleared / regionIds.length) * 100}%`, height: "100%", background: isWon ? "#ffcc00" : "#00ffcc", transition: "width 0.5s" }} />
                </div>
                <div style={{ fontFamily: "monospace", fontSize: 10, color: "#2a2a2a", marginTop: 5 }}>
                  {cleared}/{regionIds.length} nodes
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ── IN-WORLD MAP ─────────────────────────────────────────
  function WorldMap() {
    if (!currentWorld) return null;
    const availableIds = getAvailableNodeIds(
      currentWorld.regions,
      gs.nodesConquered.filter(id => currentWorld.regions.some(r => r.id === id))
    );
    const currentTierLabel = currentWorld.regions.find(r => availableIds.includes(r.id))?.difficulty?.toUpperCase() || "COMPLETE";

    return (
      <div style={{ minHeight: "100vh", background: "#060810", position: "relative", overflow: "hidden" }}>
        {/* HUD */}
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, zIndex: 100,
          background: "rgba(0,0,0,0.88)", borderBottom: "1px solid #00ffcc18",
          padding: "8px 20px", display: "flex", alignItems: "center", gap: 20,
          fontFamily: "'Press Start 2P', monospace", fontSize: 8,
        }}>
          <span style={{ color: "#00ffcc" }}>XP: {gs.playerStats.xp}</span>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ color: "#ff4444" }}>HP</span>
            <HpBar current={gs.playerStats.hp} max={gs.playerStats.maxHp} width={70} />
            <span style={{ color: "#ff4444", fontSize: 7 }}>{gs.playerStats.hp}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ color: "#4488ff" }}>EN</span>
            <div style={{ width: 60, height: 5, background: "#111", borderRadius: 3, overflow: "hidden" }}>
              <div style={{ width: `${(gs.playerStats.energy / gs.playerStats.maxEnergy) * 100}%`, height: "100%", background: "#4488ff", borderRadius: 3, transition: "width 0.4s" }} />
            </div>
            <span style={{ color: "#4488ff", fontSize: 7 }}>{gs.playerStats.energy}</span>
          </div>
          <span style={{ color: "#ffcc00" }}>NODES: {worldNodesConquered}/{currentWorld.regions.length}</span>
          <span style={{ color: "#555", fontSize: 7 }}>TIER: <span style={{ color: currentTierLabel === "EASY" ? "#00ffcc" : currentTierLabel === "MEDIUM" ? "#ffcc00" : "#ff4444" }}>{currentTierLabel}</span></span>
          <span style={{ color: "#444", fontSize: 7 }}>{currentWorld.world_name}</span>
          <button onClick={() => setActiveWorldIdx(null)} style={{ marginLeft: "auto", background: "none", border: "1px solid #222", color: "#444", fontFamily: "'Press Start 2P', monospace", fontSize: 7, padding: "5px 10px", cursor: "pointer" }}>← MAP</button>
        </div>

        {/* Objective bar */}
        <div style={{ position: "fixed", top: 42, left: "50%", transform: "translateX(-50%)", zIndex: 99, textAlign: "center" }}>
          <div style={{ fontFamily: "monospace", fontSize: 10, color: "#2a2a2a", marginBottom: 4 }}>{currentWorld.win_condition}</div>
          <div style={{ width: 280, height: 5, background: "#0a0a0a", borderRadius: 3, overflow: "hidden", margin: "0 auto" }}>
            <div style={{
              height: "100%",
              width: `${(worldNodesConquered / currentWorld.regions.length) * 100}%`,
              background: worldNodesConquered === currentWorld.regions.length ? "#ffcc00" : "linear-gradient(90deg, #00ffcc, #0088ff)",
              transition: "width 0.6s ease-out",
              boxShadow: "0 0 6px #00ffcc88",
            }} />
          </div>
        </div>

        {/* Map area */}
        <div style={{ position: "relative", width: "100%", height: "100vh", paddingTop: 80 }}>
          <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at 35% 45%, #0a1828 0%, #060810 65%)" }} />

          {/* Connection lines */}
          <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", zIndex: 1, pointerEvents: "none" }}>
            {currentWorld.regions.map((r, i) =>
              currentWorld.regions.slice(i+1).map(r2 => {
                const bothConquered = gs.nodesConquered.includes(r.id) && gs.nodesConquered.includes(r2.id);
                return (
                  <line key={`${r.id}-${r2.id}`}
                    x1={`${r.position.x}%`} y1={`${r.position.y}%`}
                    x2={`${r2.position.x}%`} y2={`${r2.position.y}%`}
                    stroke={bothConquered ? "#00ff88" : "#00ffcc"}
                    strokeWidth="1"
                    strokeOpacity={bothConquered ? 0.18 : 0.06}
                    strokeDasharray="5,10"
                  />
                );
              })
            )}
          </svg>

          {/* Nodes */}
          {currentWorld.regions.map(region => {
            const faction = currentWorld.factions.find(f => f.id === region.faction_id);
            const isConquered = gs.nodesConquered.includes(region.id);
            const isAvailable = availableIds.includes(region.id);
            const isLocked = !isConquered && !isAvailable;
            const isActive = gs.currentNode?.id === region.id;

            return (
              <MapNode key={region.id}
                region={region} faction={faction}
                isConquered={isConquered} isAvailable={isAvailable}
                isLocked={isLocked} isActive={isActive}
                onClick={() => {
                  if (gs.playerStats.energy < 10) { showToast("Too exhausted! Rest at a conquered node first.", "warn"); return; }
                  setGs(s => ({ ...s, currentNode: region, phase: "NODE_ENCOUNTER" }));
                }}
                onRest={() => handleRest(region)}
              />
            );
          })}
        </div>

        {/* Encounter overlay */}
        {gs.phase === "NODE_ENCOUNTER" && gs.currentNode && (
          <NodeEncounter
            node={gs.currentNode}
            faction={currentWorld.factions.find(f => f.id === currentWorld.regions.find(r => r.id === gs.currentNode.id)?.faction_id)}
            worldTheme={currentWorld.theme}
            playerStats={gs.playerStats}
            onComplete={handleNodeComplete}
            onFail={handleNodeFail}
            onExit={() => setGs(s => ({ ...s, phase: "MAP", currentNode: null }))}
          />
        )}
      </div>
    );
  }

  // ── DEFEAT SCREEN DATA ────────────────────────────────────
  const defeatNodeData = defeatNode && currentWorld ? currentWorld.regions.find(r => r.id === defeatNode) : null;
  const failCount = defeatNode ? (gs.failedNodes[defeatNode] || 0) : 0;
  const canRetry = gs.playerStats.energy >= 20;
  const RETRY_ENERGY_COST = 20;

  return (
    <div style={{ fontFamily: "'Press Start 2P', monospace" }}>
      <style>{GLOBAL_CSS}</style>

      {/* Trophy */}
      {showTrophy && (
        <TrophyScreen worldName={currentWorld?.world_name || ""} onContinue={handleTrophyContinue} isGameWin={isGameWin} />
      )}

      {/* Defeat */}
      {showDefeat && !showTrophy && (
        <DefeatScreen
          nodeName={defeatNodeData?.name || "Unknown"}
          canRetry={canRetry}
          energyCost={RETRY_ENERGY_COST}
          failCount={failCount}
          onRetry={() => { setShowDefeat(false); handleRetry(); }}
          onRetreat={() => {
            setShowDefeat(false);
            if (failCount >= 3) {
              showToast("World reset — start from the beginning.", "danger");
            }
          }}
        />
      )}

      {/* Toast */}
      {toast && <Toast key={toast.key} message={toast.message} type={toast.type} onDone={() => setToast(null)} />}

      {/* Main view */}
      {!showTrophy && !showDefeat && (
        activeWorldIdx === null ? <WorldSelectScreen /> : <WorldMap />
      )}
    </div>
  );
}
