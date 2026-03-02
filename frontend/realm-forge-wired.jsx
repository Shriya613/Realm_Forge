import { useState, useEffect, useRef } from "react";

// ──────────────────────────────────────────────────────────
//  REALM FORGE — WIRED TO REAL MISTRAL BACKEND
//  /generate-world  ←  world creation
//  /action          ←  encounter choices
// ──────────────────────────────────────────────────────────

const API = "http://127.0.0.1:8000";

const INITIAL_PLAYER_STATS = {
  xp: 0, hp: 100, maxHp: 100, energy: 50, maxEnergy: 50,
};

const INITIAL_GAME_STATE = {
  phase: "MAP",
  nodesConquered: [],
  failedNodes: {},
  currentNode: null,
  playerStats: INITIAL_PLAYER_STATS,
};

// ── difficulty gate: easy → medium → hard ────────────────
function getAvailableNodeIds(regions, conqueredIds) {
  const order = ["easy", "medium", "hard"];
  for (const diff of order) {
    const atLevel = regions.filter(r => r.difficulty === diff);
    const done    = atLevel.filter(r => conqueredIds.includes(r.id));
    if (done.length < atLevel.length) return atLevel.map(r => r.id);
  }
  return [];
}

// ── normalise node positions to horizontal band ───────────
function normalisePositions(regions) {
  const n = regions.length;
  return regions.map((r, i) => ({
    ...r,
    position: {
      x: n === 1 ? 50 : Math.round(10 + (i / (n - 1)) * 80),
      y: 50,
    },
  }));
}

// ── GLOBAL CSS ────────────────────────────────────────────
const GLOBAL_CSS = `
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
  @keyframes toastIn {
    from { opacity: 0; transform: translateX(-50%) translateY(10px); }
    to   { opacity: 1; transform: translateX(-50%) translateY(0); }
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  ::-webkit-scrollbar { width: 4px; }
  ::-webkit-scrollbar-track { background: #0a0a0a; }
  ::-webkit-scrollbar-thumb { background: #00ffcc33; border-radius: 2px; }
`;

// ── FACTION PORTRAIT (SVG by personality) ────────────────
function FactionPortrait({ faction, size = 72 }) {
  const cfg = ({
    aggressive: { bg: "#1a0505", ring: "#ff4444", glow: "#ff444466", body: "#cc2222", eye: "#ffff00" },
    cunning:    { bg: "#0a0515", ring: "#8833ff", glow: "#8833ff66", body: "#6611cc", eye: "#00ffcc" },
    defensive:  { bg: "#050a1a", ring: "#4488ff", glow: "#4488ff66", body: "#2255cc", eye: "#aaddff" },
    diplomatic: { bg: "#1a1505", ring: "#ffcc00", glow: "#ffcc0066", body: "#cc9900", eye: "#ff8800" },
  })[faction?.personality || "aggressive"];
  if (faction?.portrait_b64) {
    return <img src={`data:image/png;base64,${faction.portrait_b64}`}
      style={{ width: size, height: size, borderRadius: 6, border: `2px solid ${cfg.ring}`,
        boxShadow: `0 0 16px ${cfg.glow}`, imageRendering: "pixelated" }} alt={faction.name} />;
  }
  const s = size;
  return (
    <svg width={s} height={s} viewBox="0 0 80 80"
      style={{ borderRadius: 6, border: `2px solid ${cfg.ring}`, boxShadow: `0 0 16px ${cfg.glow}`, flexShrink: 0 }}>
      <rect width="80" height="80" fill={cfg.bg} />
      <rect x="18" y="52" width="44" height="32" rx="10" fill={cfg.body} opacity="0.85" />
      <rect x="34" y="46" width="12" height="8" fill={cfg.body} opacity="0.7" />
      <ellipse cx="40" cy="35" rx="17" ry="19" fill={cfg.body} opacity="0.9" />
      <ellipse cx="40" cy="37" rx="13" ry="14" fill={cfg.bg} opacity="0.6" />
      <ellipse cx="32" cy="35" rx="5" ry="5" fill={cfg.eye} opacity="0.95" />
      <ellipse cx="48" cy="35" rx="5" ry="5" fill={cfg.eye} opacity="0.95" />
      <circle cx="33" cy="36" r="2.5" fill="#000" />
      <circle cx="49" cy="36" r="2.5" fill="#000" />
      <ellipse cx="40" cy="18" rx="15" ry="7" fill={cfg.body} opacity="0.8" />
    </svg>
  );
}

// ── TOAST ─────────────────────────────────────────────────
function Toast({ message, type = "info", onDone }) {
  const colors = { info: "#00ffcc", warn: "#ffcc00", danger: "#ff4444", success: "#00ff88" };
  useEffect(() => { const t = setTimeout(onDone, 2400); return () => clearTimeout(t); }, []);
  return (
    <div style={{
      position: "fixed", bottom: 100, left: "50%", transform: "translateX(-50%)",
      background: "rgba(0,0,0,0.92)", border: `1px solid ${colors[type]}`, color: colors[type],
      fontFamily: "'Press Start 2P', monospace", fontSize: 9, padding: "10px 20px",
      borderRadius: 4, zIndex: 9000, boxShadow: `0 0 16px ${colors[type]}44`,
      animation: "toastIn 0.3s ease-out", whiteSpace: "nowrap",
    }}>{message}</div>
  );
}

// ── TROPHY SCREEN ─────────────────────────────────────────
function TrophyScreen({ worldName, onContinue }) {
  const [particles] = useState(() =>
    Array.from({ length: 45 }, (_, i) => ({
      id: i, x: Math.random() * 100,
      delay: Math.random() * 1.8, duration: 2.2 + Math.random() * 1.8,
      color: ["#ffcc00","#00ffcc","#ff4444","#ffffff","#ff8800","#88ff44"][i % 6],
      size: 5 + Math.random() * 9, round: Math.random() > 0.5,
    }))
  );
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.93)", display: "flex",
      alignItems: "center", justifyContent: "center", zIndex: 2000, flexDirection: "column" }}>
      {particles.map(p => (
        <div key={p.id} style={{
          position: "absolute", left: `${p.x}%`, top: -20, width: p.size, height: p.size,
          background: p.color, borderRadius: p.round ? "50%" : 2, pointerEvents: "none",
          animation: `confettiFall ${p.duration}s ${p.delay}s ease-in infinite`,
        }} />
      ))}
      <div style={{ animation: "trophyBounce 1.6s ease-in-out infinite, shimmer 2s ease-in-out infinite" }}>
        <svg width="150" height="165" viewBox="0 0 140 160">
          <defs>
            <linearGradient id="tg" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#ffe066" /><stop offset="100%" stopColor="#ff8800" />
            </linearGradient>
          </defs>
          <path d="M32,18 L108,18 L97,92 Q70,114 43,92 Z" fill="url(#tg)" stroke="#cc7700" strokeWidth="1.5" />
          <path d="M44,24 L62,24 L56,72 Q50,82 44,72 Z" fill="#fff" opacity="0.25" />
          <path d="M32,28 Q10,28 10,56 Q10,78 32,72" stroke="url(#tg)" strokeWidth="9" fill="none" strokeLinecap="round" />
          <path d="M108,28 Q130,28 130,56 Q130,78 108,72" stroke="url(#tg)" strokeWidth="9" fill="none" strokeLinecap="round" />
          <rect x="60" y="96" width="20" height="26" fill="#cc8800" />
          <rect x="42" y="120" width="56" height="14" rx="5" fill="url(#tg)" stroke="#cc7700" strokeWidth="1.5" />
          <text x="70" y="66" textAnchor="middle" fontSize="26" fill="#fff" opacity="0.9">★</text>
        </svg>
      </div>
      <div style={{ textAlign: "center", marginTop: 20, animation: "slideUp 0.5s 0.2s both" }}>
        <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 16, color: "#ffcc00",
          textShadow: "0 0 24px #ffcc00", marginBottom: 10 }}>WORLD CLEARED!</div>
        <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 9, color: "#00ffcc", marginBottom: 24 }}>
          {worldName}
        </div>
        <button onClick={onContinue} style={{
          fontFamily: "'Press Start 2P', monospace", fontSize: 9, background: "transparent",
          border: "2px solid #ffcc00", color: "#ffcc00", padding: "12px 28px", cursor: "pointer",
          boxShadow: "0 0 20px #ffcc0055", letterSpacing: 2,
        }}>PLAY AGAIN</button>
      </div>
    </div>
  );
}

// ── DEFEAT SCREEN ─────────────────────────────────────────
function DefeatScreen({ nodeName, canRetry, energyCost, failCount, onRetry, onRetreat }) {
  const isWorldReset = failCount >= 3;
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.92)", display: "flex",
      flexDirection: "column", alignItems: "center", justifyContent: "center", zIndex: 2000 }}>
      <div style={{ fontSize: 64, animation: "skullShake 0.6s ease-in-out", marginBottom: 16 }}>💀</div>
      <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 18, color: "#ff4444",
        textShadow: "0 0 20px #ff4444", marginBottom: 10 }}>DEFEATED</div>
      <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 9, color: "#ff8888", marginBottom: 8 }}>
        {nodeName} has repelled you.
      </div>
      {isWorldReset
        ? <div style={{ fontFamily: "monospace", fontSize: 13, color: "#ff6666", marginBottom: 8, textAlign: "center" }}>
            You failed 3 times. <span style={{ color: "#ff4444", fontWeight: "bold" }}>World resets.</span>
          </div>
        : <div style={{ fontFamily: "monospace", fontSize: 13, color: "#666", marginBottom: 8, textAlign: "center" }}>
            Fail count: {failCount}/3 — fail again and this world resets.
            {!canRetry && " Too exhausted to retry."}
          </div>
      }
      <div style={{ fontFamily: "monospace", fontSize: 12, color: "#444", marginBottom: 32 }}>
        You survive with 15 HP. Rest at a conquered node to recover.
      </div>
      <div style={{ display: "flex", gap: 16 }}>
        {canRetry && !isWorldReset && (
          <button onClick={onRetry} style={{
            fontFamily: "'Press Start 2P', monospace", fontSize: 8, background: "transparent",
            border: "2px solid #ff4444", color: "#ff4444", padding: "10px 18px", cursor: "pointer",
          }}>RETRY (−{energyCost} ENERGY)</button>
        )}
        <button onClick={onRetreat} style={{
          fontFamily: "'Press Start 2P', monospace", fontSize: 8, background: "transparent",
          border: "2px solid #444", color: "#888", padding: "10px 18px", cursor: "pointer",
        }}>{isWorldReset ? "RESET WORLD" : "RETREAT TO MAP"}</button>
      </div>
    </div>
  );
}

// ── MAP NODE ──────────────────────────────────────────────
function MapNode({ region, faction, isConquered, isAvailable, isLocked, isActive, onClick, onRest }) {
  const [hovered, setHovered] = useState(false);
  const diffColor = { easy: "#00ffcc", medium: "#ffcc00", hard: "#ff4444" };
  const unlockHint = { medium: "clear easy first", hard: "clear medium first" };

  if (isLocked) {
    return (
      <div style={{ position: "absolute", left: `${region.position.x}%`, top: `${region.position.y}%`,
        transform: "translate(-50%,-50%)", userSelect: "none" }}>
        <div style={{ width: 54, height: 54, borderRadius: "50%", background: "rgba(0,0,0,0.5)",
          border: "2px solid #222", display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 20, opacity: 0.35 }}>L</div>
        <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 6, color: "#333",
          textAlign: "center", marginTop: 6, whiteSpace: "nowrap" }}>{region.name}</div>
        <div style={{ fontFamily: "monospace", fontSize: 10, color: "#2a2a2a", textAlign: "center", marginTop: 2 }}>
          {unlockHint[region.difficulty]}
        </div>
      </div>
    );
  }

  const color = isConquered ? "#00ff88" : isActive ? "#ffcc00" : diffColor[region.difficulty];

  return (
    <div
      onClick={isConquered ? onRest : onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ position: "absolute", left: `${region.position.x}%`, top: `${region.position.y}%`,
        transform: "translate(-50%,-50%)", cursor: "pointer", zIndex: isActive ? 20 : 10, userSelect: "none" }}
    >
      {isAvailable && !isConquered && (
        <div style={{ position: "absolute", width: 70, height: 70, borderRadius: "50%",
          border: `2px solid ${color}`, top: "50%", left: "50%",
          animation: "nodeRing 2.2s ease-in-out infinite", pointerEvents: "none" }} />
      )}
      <div style={{
        width: 54, height: 54, borderRadius: "50%",
        background: isConquered ? "radial-gradient(circle, #00ff8822, #00ff8808)" : "radial-gradient(circle, #111, #080808)",
        border: `2px solid ${color}`,
        boxShadow: hovered || isActive ? `0 0 22px ${color}, 0 0 44px ${color}33` : `0 0 8px ${color}55`,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontFamily: "'Press Start 2P', monospace", fontSize: 14, color,
        transform: hovered ? "scale(1.14)" : "scale(1)", transition: "all 0.18s", position: "relative",
      }}>
        {isConquered ? "●" : "◆"}
        {!isConquered && (
          <div style={{ position: "absolute", top: -5, right: -5, width: 15, height: 15, borderRadius: "50%",
            background: diffColor[region.difficulty], fontSize: 7, display: "flex", alignItems: "center",
            justifyContent: "center", fontWeight: "bold", color: "#000", fontFamily: "monospace" }}>
            {region.difficulty[0].toUpperCase()}
          </div>
        )}
        {isConquered && (
          <div style={{ position: "absolute", bottom: -4, right: -4, fontSize: 8,
            fontFamily: "'Press Start 2P', monospace", color: "#00ff88" }}>R</div>
        )}
      </div>
      <div style={{ position: "absolute", top: "100%", left: "50%", transform: "translateX(-50%)",
        marginTop: 7, whiteSpace: "nowrap", fontFamily: "'Press Start 2P', monospace", fontSize: 6.5,
        color, textShadow: `0 0 6px ${color}`, opacity: hovered ? 1 : 0.7, transition: "opacity 0.2s" }}>
        {region.name}
      </div>
      {hovered && !isConquered && (
        <div style={{ position: "absolute", bottom: "100%", left: "50%", transform: "translateX(-50%)",
          marginBottom: 10, whiteSpace: "nowrap", background: "rgba(0,0,0,0.92)",
          border: `1px solid ${color}`, padding: "5px 10px", borderRadius: 4,
          fontFamily: "monospace", fontSize: 11, color: "#ccc", zIndex: 50 }}>
          {faction?.name || "?"} · <span style={{ color }}>{region.difficulty}</span>
        </div>
      )}
      {hovered && isConquered && (
        <div style={{ position: "absolute", bottom: "100%", left: "50%", transform: "translateX(-50%)",
          marginBottom: 10, whiteSpace: "nowrap", background: "rgba(0,0,0,0.92)",
          border: "1px solid #00ff88", padding: "5px 10px", borderRadius: 4,
          fontFamily: "monospace", fontSize: 11, color: "#00ff88", zIndex: 50 }}>
          Rest here: +20 HP, +15 Energy
        </div>
      )}
    </div>
  );
}

// ── CHOICE BUTTON with styled tooltip ────────────────────
function ChoiceButton({ choice, onClick }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      {hovered && choice.description && (
        <div style={{
          position: "absolute", bottom: "calc(100% + 8px)", left: "50%",
          transform: "translateX(-50%)", whiteSpace: "nowrap",
          background: "rgba(0,0,0,0.95)", border: "1px solid #00ffcc44",
          padding: "6px 12px", borderRadius: 4, zIndex: 999,
          fontFamily: "monospace", fontSize: 11, color: "#aaa",
          pointerEvents: "none", lineHeight: 1.4,
          boxShadow: "0 0 12px #00ffcc11",
        }}>{choice.description}</div>
      )}
      <button
        onClick={onClick}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          fontFamily: "'Press Start 2P', monospace", fontSize: 8, padding: "10px 16px",
          background: hovered ? "#00ffcc1a" : "transparent",
          border: "1px solid #00ffcc", color: "#00ffcc",
          cursor: "pointer", borderRadius: 4, transition: "all 0.15s", letterSpacing: 1,
          boxShadow: hovered ? "0 0 12px #00ffcc33" : "none",
        }}
      >{choice.label}</button>
    </div>
  );
}

// ── NODE ENCOUNTER (wired to real /action) ─────────────────
function NodeEncounter({ node, faction, sessionId, playerStats, onComplete, onFail, onExit }) {
  const [stage, setStage]         = useState("approach");
  const turnRef                   = useRef(0);   // use ref so closure always reads latest value
  const [narration, setNarration] = useState(`You approach ${node.name}. The ${faction?.name || "enemy"} watches.`);
  const [choices, setChoices]     = useState([
    { id: "a", label: "Scout ahead quietly", description: "Observe the enemy before committing" },
    { id: "b", label: "Charge in boldly",    description: "Aggressive direct frontal approach" },
    { id: "c", label: "Send a decoy first",  description: "Misdirect attention before striking" },
  ]);
  const [loading, setLoading]     = useState(false);
  const [outcome, setOutcome]     = useState(null);
  const [conquered, setConquered] = useState(false);
  const [currentHp, setCurrentHp] = useState(playerStats.hp);
  const completionData            = useRef(null);

  const STAGES     = ["approach", "challenge", "complete"];
  const stageLabel = { approach: "APPROACH", challenge: "CHALLENGE", complete: "COMPLETE" };
  const outcomeColor = { success: "#00ffcc", partial: "#ffcc00", failure: "#ff4444" };

  // Auto-fire onComplete once conquered flag flips
  useEffect(() => {
    if (!conquered || !completionData.current) return;
    const t = setTimeout(() => onComplete(completionData.current), 1800);
    return () => clearTimeout(t);
  }, [conquered]);

  async function handleChoice(choice) {
    if (loading || conquered) return;
    setLoading(true);
    setOutcome(null);

    turnRef.current += 1;
    const thisTurn = turnRef.current;

    try {
      // ── WIRE YOUR MISTRAL /action CALL HERE ─────────────
      const res = await fetch(`${API}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: `[Stage: ${stage}, Turn ${thisTurn}/3] ${choice.label}: ${choice.description || ""}`,
          region_id: node.id,
          session_id: sessionId,
        }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      // Guard: data.response may be absent on backend error
      const dm       = data.response || {};
      const newHp    = data.hp ?? currentHp;
      const newStage = data.stage ?? stage;
      const newChoices = (data.choices || []).map(c => ({
        id: c.id, label: c.label, description: c.description || "",
      }));
      // ─────────────────────────────────────────────────────

      setCurrentHp(newHp);
      if (dm.narration) setNarration(dm.narration);
      setOutcome(dm.outcome || null);

      if (data.defeated) {
        setLoading(false);
        setTimeout(() => onFail({ nodeId: node.id, xpLost: 10 }), 1200);
        return;
      }

      // End when: backend says complete OR resolution (AI sometimes uses it),
      // OR safety net after Turn 3 — whichever comes first.
      const isComplete =
        newStage === "complete" ||
        newStage === "resolution" ||
        thisTurn >= 3;

      if (isComplete) {
        completionData.current = {
          xp:       dm.state_changes?.xp_gained ?? 30,
          hp_delta: dm.state_changes?.hp_delta   ?? 0,
          nodeId:   node.id,
        };
        setStage("complete");
        setChoices([]);
        setConquered(true);   // ← triggers the useEffect above
      } else {
        setStage(newStage);
        if (newChoices.length > 0) setChoices(newChoices);
      }

    } catch (err) {
      // On any network / parse error, still honour turn-3 safety
      if (turnRef.current >= 3) {
        completionData.current = { xp: 20, hp_delta: 0, nodeId: node.id };
        setStage("complete");
        setChoices([]);
        setConquered(true);
      } else {
        setNarration("The Architect's signal flickers. Try again.");
        setOutcome("partial");
      }
    }

    setLoading(false);
  }

  const hpPct   = Math.max(0, (currentHp / playerStats.maxHp) * 100);
  const hpColor = hpPct > 50 ? "#00ff88" : hpPct > 25 ? "#ffcc00" : "#ff4444";
  const dotStage = conquered ? "complete" : stage;

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 500, padding: "0 20px" }}>
      <div style={{ width: "min(880px, 96vw)", background: "rgba(6,8,20,0.98)",
        border: "1px solid #00ffcc22", borderRadius: 8, padding: "26px 30px",
        boxShadow: "0 0 48px rgba(0,255,204,0.08)" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 18 }}>
          <FactionPortrait faction={faction || { personality: "aggressive", name: node.name }} size={68} />
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 12, color: "#00ffcc",
              textShadow: "0 0 8px #00ffcc", marginBottom: 5 }}>
              {faction?.name?.toUpperCase() || node.name.toUpperCase()}
            </div>
            <div style={{ fontFamily: "monospace", fontSize: 11,
              color: conquered ? "#00ff88" : outcomeColor[outcome] || "#555", letterSpacing: 2 }}>
              ◆ {conquered ? "CONQUERED" : outcome ? outcome.toUpperCase() : stageLabel[stage] || stage.toUpperCase()}
            </div>
            <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 7, color: hpColor }}>HP</span>
              <div style={{ flex: 1, height: 6, background: "#111", borderRadius: 3, overflow: "hidden" }}>
                <div style={{ width: `${hpPct}%`, height: "100%", background: hpColor, borderRadius: 3,
                  transition: "width 0.4s, background 0.4s" }} />
              </div>
              <span style={{ fontFamily: "monospace", fontSize: 10, color: hpColor }}>{currentHp}/{playerStats.maxHp}</span>
            </div>
          </div>
          <button onClick={onExit} style={{ background: "none", border: "1px solid #333", color: "#555",
            fontFamily: "'Press Start 2P', monospace", fontSize: 8, padding: "6px 12px", cursor: "pointer" }}>
            ← EXIT
          </button>
        </div>

        {/* Narration */}
        <div style={{ fontFamily: "'Courier New', monospace", fontSize: 14.5, lineHeight: 1.75,
          color: conquered ? "#ccffee" : outcome === "failure" ? "#ff8888" : outcome === "success" ? "#ccffee" : "#ddd",
          marginBottom: 22, minHeight: 76,
          borderLeft: `3px solid ${conquered ? "#00ff88" : outcomeColor[outcome] || "#00ffcc33"}`,
          paddingLeft: 16 }}>
          {loading
            ? <span style={{ color: "#444" }}>The Architect deliberates...</span>
            : narration}
        </div>

        {/* Choices — hidden once conquered */}
        {!loading && !conquered && choices.length > 0 && (
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {choices.map(c => (
              <ChoiceButton key={c.id} choice={c} onClick={() => handleChoice(c)} />
            ))}
          </div>
        )}

        {/* Conquered: auto-advancing indicator */}
        {conquered && (
          <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 8,
            color: "#00ff88", letterSpacing: 2, animation: "toastIn 0.4s ease-out" }}>
            NODE SECURED — returning to map...
          </div>
        )}

        {/* Stage dots */}
        <div style={{ display: "flex", gap: 8, marginTop: 18, alignItems: "center" }}>
          {STAGES.map((s, i) => {
            const currentIdx = STAGES.indexOf(dotStage);
            return (
              <div key={s} style={{ width: 7, height: 7, borderRadius: "50%", transition: "all 0.3s",
                background: s === dotStage ? (conquered ? "#00ff88" : "#00ffcc") : currentIdx > i ? "#00ffcc33" : "#1a1a1a",
                boxShadow: s === dotStage ? `0 0 8px ${conquered ? "#00ff88" : "#00ffcc"}` : "none" }} />
            );
          })}
          <span style={{ fontFamily: "monospace", fontSize: 9, color: "#333", marginLeft: 6 }}>
            {stageLabel[stage] || stage.toUpperCase()}
          </span>
        </div>
      </div>
    </div>
  );
}

// ── WORLD GEN SCREEN ──────────────────────────────────────
function WorldGenScreen({ onWorldReady }) {
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [playerName, setPlayerName] = useState("");
  const sessionId = useRef("session_" + Math.floor(Math.random() * 99999));

  const MSGS = [
    "Parsing reality parameters...",
    "The Architect is sculpting the world...",
    "Generating factions and regions...",
    "Placing nodes on the overworld...",
    "Seeding quests and boss encounters...",
    "Almost ready — finalising the nodes...",
  ];

  async function generate() {
    if (!prompt.trim() || !playerName.trim()) return;
    setLoading(true);
    let i = 0;
    const interval = setInterval(() => { i = (i + 1) % MSGS.length; setStatus(MSGS[i]); }, 1600);
    setStatus(MSGS[0]);
    try {
      const res = await fetch(`${API}/generate-world`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: prompt.trim(), player_name: playerName.trim(), session_id: sessionId.current }),
      });
      const data = await res.json();
      clearInterval(interval);
      if (data.status === "success") {
        const world = data.data;
        world.regions = normalisePositions(world.regions);
        onWorldReady(world, sessionId.current);
      } else {
        setStatus("Error generating world. Is the backend running?");
        setLoading(false);
      }
    } catch {
      clearInterval(interval);
      setStatus("Cannot reach backend — check http://127.0.0.1:8000");
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: "#060810", display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", padding: 40 }}>
      <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 20, color: "#00ffcc",
        textShadow: "0 0 24px #00ffcc", marginBottom: 8 }}>REALM FORGE</div>
      <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 8, color: "#333",
        letterSpacing: 3, marginBottom: 48 }}>MISTRAL-POWERED CONQUEST</div>

      {loading ? (
        <div style={{ textAlign: "center" }}>
          <div style={{ width: 40, height: 40, border: "4px solid rgba(0,255,204,0.2)", borderRadius: "50%",
            borderTopColor: "#00ffcc", animation: "spin 1s linear infinite", margin: "0 auto 24px" }} />
          <div style={{ fontFamily: "monospace", fontSize: 13, color: "#00ffcc88" }}>{status}</div>
        </div>
      ) : (
        <div style={{ width: "min(480px, 92vw)", display: "flex", flexDirection: "column", gap: 20 }}>
          <div>
            <label style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 7, color: "#444",
              letterSpacing: 2, display: "block", marginBottom: 8 }}>YOUR CALLSIGN</label>
            <input value={playerName} onChange={e => setPlayerName(e.target.value)}
              placeholder="Enter your name..."
              style={{ width: "100%", padding: "12px 14px", background: "rgba(0,0,0,0.5)",
                border: "1px solid #333", borderRadius: 4, color: "#00ffcc",
                fontFamily: "'Press Start 2P', monospace", fontSize: 9, outline: "none" }}
              onKeyDown={e => e.key === "Enter" && generate()}
            />
          </div>
          <div>
            <label style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 7, color: "#444",
              letterSpacing: 2, display: "block", marginBottom: 8 }}>WORLD THEME</label>
            <textarea value={prompt} onChange={e => setPrompt(e.target.value)} rows={4}
              placeholder="e.g. A dystopian cyberpunk megacity run by neon cartels..."
              style={{ width: "100%", padding: "12px 14px", background: "rgba(0,0,0,0.5)",
                border: "1px solid #333", borderRadius: 4, color: "#00ffcc",
                fontFamily: "monospace", fontSize: 13, resize: "vertical", outline: "none" }}
            />
          </div>
          <button onClick={generate} disabled={!prompt.trim() || !playerName.trim()} style={{
            fontFamily: "'Press Start 2P', monospace", fontSize: 10, padding: "14px 0",
            background: "linear-gradient(135deg, #00ffcc, #0088ff)", color: "#000",
            border: "none", borderRadius: 4, cursor: "pointer", letterSpacing: 2,
            opacity: (!prompt.trim() || !playerName.trim()) ? 0.4 : 1,
          }}>GENERATE WORLD</button>
          {status && <div style={{ fontFamily: "monospace", fontSize: 11, color: "#ff4444", textAlign: "center" }}>{status}</div>}
        </div>
      )}
    </div>
  );
}

// ── MAIN APP ──────────────────────────────────────────────
export default function RealmForge() {
  const [world, setWorld]           = useState(null);
  const [sessionId, setSessionId]   = useState(null);
  const [gs, setGs]                 = useState(INITIAL_GAME_STATE);
  const [showTrophy, setShowTrophy] = useState(false);
  const [showDefeat, setShowDefeat] = useState(false);
  const [defeatNode, setDefeatNode] = useState(null);
  const [toast, setToast]           = useState(null);

  const nodesConquered = gs.nodesConquered.filter(id => world?.regions?.some(r => r.id === id)).length;

  function showToastMsg(message, type = "info") {
    setToast({ message, type, key: Date.now() });
  }

  function handleWorldReady(w, sid) {
    setWorld(w);
    setSessionId(sid);
    setGs(INITIAL_GAME_STATE);
  }

  // win check
  useEffect(() => {
    if (!world || showTrophy) return;
    const allIds = world.regions.map(r => r.id);
    if (allIds.length > 0 && allIds.every(id => gs.nodesConquered.includes(id))) {
      setTimeout(() => setShowTrophy(true), 600);
    }
  }, [gs.nodesConquered, world?.world_name]);

  function handleNodeComplete({ xp, hp_delta, nodeId }) {
    setGs(s => ({
      ...s,
      nodesConquered: [...s.nodesConquered, nodeId],
      currentNode: null, phase: "MAP",
      playerStats: {
        ...s.playerStats,
        xp: s.playerStats.xp + xp,
        hp: Math.min(s.playerStats.maxHp, Math.max(0, s.playerStats.hp + hp_delta)),
      },
    }));
    showToastMsg("Node conquered!", "success");
  }

  function handleNodeFail({ nodeId, xpLost }) {
    setGs(s => {
      const prevFails = s.failedNodes[nodeId] || 0;
      const newFails  = prevFails + 1;
      const worldReset = newFails >= 3;
      const newState = {
        ...s, phase: "MAP", currentNode: null,
        failedNodes: { ...s.failedNodes, [nodeId]: newFails },
        playerStats: {
          ...s.playerStats, hp: 15,
          xp: Math.max(0, s.playerStats.xp - xpLost),
          energy: Math.max(0, s.playerStats.energy - 20),
        },
      };
      if (worldReset) {
        const worldIds = world?.regions?.map(r => r.id) || [];
        newState.nodesConquered = s.nodesConquered.filter(id => !worldIds.includes(id));
        newState.failedNodes = { ...newState.failedNodes, [nodeId]: 0 };
      }
      return newState;
    });
    setDefeatNode(nodeId);
    setShowDefeat(true);
  }

  function handleRetry() {
    setShowDefeat(false);
    if (defeatNode && world) {
      const region = world.regions.find(r => r.id === defeatNode);
      if (region) {
        setGs(s => ({
          ...s, currentNode: region, phase: "NODE_ENCOUNTER",
          playerStats: { ...s.playerStats, energy: Math.max(0, s.playerStats.energy - 20) },
        }));
      }
    }
  }

  function handleRest(region) {
    const { hp, maxHp, energy, maxEnergy } = gs.playerStats;
    if (hp >= maxHp && energy >= maxEnergy) { showToastMsg("Already at full health!", "info"); return; }
    setGs(s => ({
      ...s, playerStats: {
        ...s.playerStats,
        hp: Math.min(maxHp, hp + 20),
        energy: Math.min(maxEnergy, energy + 15),
      },
    }));
    showToastMsg(`Rested at ${region.name}. +20 HP, +15 Energy`, "success");
  }

  // ── world gen screen ──────────────────────────────────────
  if (!world) return (
    <>
      <style>{GLOBAL_CSS}</style>
      <WorldGenScreen onWorldReady={handleWorldReady} />
    </>
  );

  // ── in-world map ──────────────────────────────────────────
  const availableIds = getAvailableNodeIds(
    world.regions,
    gs.nodesConquered.filter(id => world.regions.some(r => r.id === id))
  );
  const currentTier = world.regions.find(r => availableIds.includes(r.id))?.difficulty?.toUpperCase() || "COMPLETE";

  const defeatNodeData = defeatNode ? world.regions.find(r => r.id === defeatNode) : null;
  const failCount      = defeatNode ? (gs.failedNodes[defeatNode] || 0) : 0;
  const canRetry       = gs.playerStats.energy >= 20;
  const hpPct          = Math.max(0, Math.min(100, (gs.playerStats.hp / gs.playerStats.maxHp) * 100));
  const hpColor        = hpPct > 50 ? "#00ff88" : hpPct > 25 ? "#ffcc00" : "#ff4444";

  return (
    <div style={{ fontFamily: "'Press Start 2P', monospace", background: "#060810",
      minHeight: "100vh", position: "relative", overflow: "hidden" }}>
      <style>{GLOBAL_CSS}</style>

      {/* Trophy */}
      {showTrophy && (
        <TrophyScreen worldName={world.world_name} onContinue={() => {
          setShowTrophy(false);
          setWorld(null);
          setGs(INITIAL_GAME_STATE);
        }} />
      )}

      {/* Defeat */}
      {showDefeat && !showTrophy && (
        <DefeatScreen
          nodeName={defeatNodeData?.name || "Unknown"}
          canRetry={canRetry} energyCost={20}
          failCount={failCount}
          onRetry={() => { setShowDefeat(false); handleRetry(); }}
          onRetreat={() => {
            setShowDefeat(false);
            if (failCount >= 3) showToastMsg("World reset — start from the beginning.", "danger");
          }}
        />
      )}

      {/* Toast */}
      {toast && <Toast key={toast.key} message={toast.message} type={toast.type} onDone={() => setToast(null)} />}

      {/* HUD */}
      <div style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 100,
        background: "rgba(0,0,0,0.88)", borderBottom: "1px solid #00ffcc18",
        padding: "8px 20px", display: "flex", alignItems: "center", gap: 24,
        fontFamily: "'Press Start 2P', monospace", fontSize: 8 }}>
        <span style={{ color: "#00ffcc" }}>XP: {gs.playerStats.xp}</span>
        <span style={{ color: hpColor }}>HP: {gs.playerStats.hp}/100</span>
        <span style={{ color: "#4488ff" }}>EN: {gs.playerStats.energy}/50</span>
        <span style={{ color: "#ffcc00" }}>NODES: {nodesConquered}/{world.regions.length}</span>
        <span style={{ color: "#555", fontSize: 7 }}>TIER: <span style={{
          color: currentTier === "EASY" ? "#00ffcc" : currentTier === "MEDIUM" ? "#ffcc00" : "#ff4444"
        }}>{currentTier}</span></span>
        <span style={{ color: "#333", fontSize: 7, maxWidth: 320, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {world.world_name.toUpperCase()}
        </span>
        <button onClick={() => { setWorld(null); setGs(INITIAL_GAME_STATE); }} style={{
          marginLeft: "auto", background: "none", border: "1px solid #222", color: "#444",
          fontFamily: "'Press Start 2P', monospace", fontSize: 7, padding: "5px 10px", cursor: "pointer",
        }}>NEW WORLD</button>
      </div>

      {/* Objective bar */}
      <div style={{ position: "fixed", top: 40, left: "50%", transform: "translateX(-50%)",
        zIndex: 99, textAlign: "center", width: 360 }}>
        <div style={{ fontFamily: "monospace", fontSize: 10, color: "#2a2a2a", marginBottom: 4 }}>
          {world.win_condition}
        </div>
        <div style={{ width: "100%", height: 5, background: "#0a0a0a", borderRadius: 3, overflow: "hidden" }}>
          <div style={{
            height: "100%",
            width: `${(nodesConquered / world.regions.length) * 100}%`,
            background: nodesConquered === world.regions.length ? "#ffcc00" : "linear-gradient(90deg, #00ffcc, #0088ff)",
            transition: "width 0.6s ease-out", boxShadow: "0 0 6px #00ffcc88",
          }} />
        </div>
      </div>

      {/* Map */}
      <div style={{ position: "relative", width: "100%", height: "100vh", paddingTop: 80 }}>
        <div style={{ position: "absolute", inset: 0,
          background: "radial-gradient(ellipse at 35% 45%, #0a1828 0%, #060810 65%)" }} />

        {/* SVG connection lines */}
        <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%",
          zIndex: 1, pointerEvents: "none" }}>
          {world.regions.map((r, i) =>
            world.regions.slice(i + 1).map(r2 => {
              const bothConquered = gs.nodesConquered.includes(r.id) && gs.nodesConquered.includes(r2.id);
              return (
                <line key={`${r.id}-${r2.id}`}
                  x1={`${r.position.x}%`} y1={`${r.position.y}%`}
                  x2={`${r2.position.x}%`} y2={`${r2.position.y}%`}
                  stroke={bothConquered ? "#00ff88" : "#00ffcc"}
                  strokeWidth="1" strokeOpacity={bothConquered ? 0.18 : 0.06}
                  strokeDasharray="5,10" />
              );
            })
          )}
        </svg>

        {/* Nodes */}
        {world.regions.map(region => {
          const faction     = world.factions.find(f => f.id === region.faction_id);
          const isConquered = gs.nodesConquered.includes(region.id);
          const isAvailable = availableIds.includes(region.id);
          const isLocked    = !isConquered && !isAvailable;
          const isActive    = gs.currentNode?.id === region.id;
          return (
            <MapNode key={region.id}
              region={region} faction={faction}
              isConquered={isConquered} isAvailable={isAvailable}
              isLocked={isLocked} isActive={isActive}
              onClick={() => {
                if (gs.playerStats.energy < 10) {
                  showToastMsg("Too exhausted! Rest at a conquered node first.", "warn");
                  return;
                }
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
          faction={world.factions.find(f => f.id === world.regions.find(r => r.id === gs.currentNode.id)?.faction_id)}
          sessionId={sessionId}
          worldTheme={world.theme}
          playerStats={gs.playerStats}
          onComplete={handleNodeComplete}
          onFail={handleNodeFail}
          onExit={() => setGs(s => ({ ...s, phase: "MAP", currentNode: null }))}
        />
      )}
    </div>
  );
}
