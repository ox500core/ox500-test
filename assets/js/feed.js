(function () {
  const utils = window.OX500 && window.OX500.utils;
  if (!utils) return;

  const $ = (id) => document.getElementById(id);
  const feedEls = [$("feed1"), $("feed2"), $("feed3")].filter(Boolean);

  const FEED_POOLS = {
    NOMINAL: [
      "ARCHIVE BUS: STABLE LINK",
      "NODE SYNC: NOMINAL",
      "CACHE VECTOR: ALIGNED",
      "SIGNAL MAP: CONSISTENT",
      "ROUTE HANDSHAKE: VALID",
      "INDEX CLOCK: IN PHASE",
      "MEMORY ROUTER: ONLINE",
      "WRITE GATE: AUTHORIZED",
      "CHANNEL LATENCY: LOW",
      "BOUNDARY CHECK: PASSED",
      "PROCESS QUEUE: CLEAR",
      "ARCHIVE LINK: HEALTHY",
      "HEARTBEAT STREAM: EVEN",
      "DATA PATH: VERIFIED",
      "INPUT FILTER: CALM",
      "OUTPUT BUS: CLEAN",
      "ERROR BUDGET: WITHIN LIMIT",
      "QUEUE PRESSURE: CONTROLLED",
      "TRACE FIELD: QUIET",
      "SENSOR DELTA: MINIMAL",
      "WATCH CHANNEL: NOMINAL",
      "GATEKEEPER STATE: OPEN",
      "SUBNET MIRROR: COHERENT",
      "STORAGE HANDOFF: CLEAN",
      "KERNEL ECHO: STABLE",
      "PROTOCOL EDGE: SEALED",
      "STREAM MERGE: CONSISTENT",
      "LINK PARITY: MATCHED",
      "RECOVERY TABLE: READY",
      "SCHEDULE DRIFT: LOW",
      "ARCHIVE SECTOR: RESPONSIVE",
      "SYNC PULSE: LOCKED",
      "MESSAGE ROUTE: OPTIMAL",
      "STACK WINDOW: BALANCED",
      "NODE TEMPO: EVEN",
      "CHECKPOINT MAP: CURRENT",
      "SIGNATURE GRID: INTACT",
      "QUEUE HORIZON: CLEAR",
      "ACCESS CURVE: SMOOTH",
      "SYSTEM HUSH: NORMAL",
    ],
    UNSTABLE: [
      "SIGNAL VARIANCE: RISING",
      "QUEUE PRESSURE: ELEVATED",
      "ARCHIVE EDGE: OSCILLATING",
      "HANDSHAKE PHASE: DRIFTING",
      "CHECKSUM FIELD: NOISY",
      "INPUT FILTER: DEGRADED",
      "OUTPUT BUS: JITTER",
      "STREAM COHERENCE: WEAKENING",
      "NODE TEMPO: IRREGULAR",
      "INDEX CLOCK: OFFSET",
      "ERROR BUDGET: THIN",
      "SECTOR MAPPING: FRAGMENTED",
      "WATCH CHANNEL: RESTLESS",
      "PARITY WINDOW: FLUCTUATING",
      "CACHE VECTOR: UNSTEADY",
      "BORDER TRACE: VIBRATING",
      "ROUTE LOOP: DETECTED",
      "ARCHIVE LINK: STRAINED",
      "SYNC PULSE: WOBBLE",
      "SENSOR DELTA: SPIKING",
      "ACCESS CURVE: SHARPENING",
      "STACK WINDOW: NARROW",
      "RECOVERY TABLE: ACTIVE",
      "KERNEL ECHO: OFFSET",
      "SIGNATURE GRID: FLICKER",
      "MESSAGE ROUTE: RETRY",
      "BOUNDARY CHECK: SOFT FAIL",
      "TRACE FIELD: NOISY",
      "QUEUE HORIZON: CONTRACTING",
      "SUBNET MIRROR: DISTORTED",
      "WRITE GATE: THROTTLED",
      "PROCESS QUEUE: HEAVY",
      "STORAGE HANDOFF: DELAYED",
      "STREAM MERGE: CONTENTION",
      "PROTOCOL EDGE: FLEXING",
      "NODE LOAD: UNEVEN",
      "LATENCY WALL: APPROACHING",
      "COHERENCE SLOPE: NEGATIVE",
      "SYSTEM HUSH: FRACTURED",
      "ANOMALY FRONT: FORMING",
    ],
    INCIDENT: [
      "ANOMALY CASCADE: ACTIVE",
      "ARCHIVE INTEGRITY: COMPROMISED",
      "HANDSHAKE CORE: FAILING",
      "SIGNAL COHERENCE: COLLAPSING",
      "WATCHDOG VECTOR: TRIGGERED",
      "ROUTE TABLE: CORRUPT",
      "QUEUE OVERFLOW: IMMINENT",
      "BORDER CHECK: BREACHED",
      "SECTOR WRITE: DENIED",
      "KERNEL ECHO: FRACTURED",
      "RECOVERY PATH: CONTESTED",
      "PARITY MATCH: LOST",
      "STREAM LOCK: BROKEN",
      "TRACE FIELD: HOSTILE",
      "SENSOR DELTA: CRITICAL",
      "INDEX CLOCK: DESYNC",
      "ACCESS MATRIX: REVOKED",
      "CACHE FABRIC: TEARING",
      "SUBNET MIRROR: SHATTERED",
      "PROTOCOL EDGE: OPEN",
      "AUTH CHANNEL: UNKNOWN ACTOR",
      "MESSAGE ROUTE: LOOP STORM",
      "STACK WINDOW: COLLAPSE",
      "ARCHIVE NODE: BLEEDING",
      "CHECKSUM CORE: INVALID",
      "STREAM TEMPO: VIOLENT",
      "OUTPUT BUS: CONTAMINATED",
      "INPUT FILTER: OVERRUN",
      "RECOVERY TABLE: STARVED",
      "QUEUE HORIZON: ZERO",
      "STORAGE HANDOFF: ABORTED",
      "SIGNATURE GRID: BROKEN",
      "BOUNDARY CHECK: HARD FAIL",
      "COHERENCE FLOOR: REACHED",
      "ANOMALY PRESSURE: EXTREME",
      "NODE STATE: INCIDENT",
      "CHANNEL LATENCY: UNBOUNDED",
      "PROCESS LATTICE: UNSTABLE",
      "SYSTEM HUSH: SHATTERED",
      "EMERGENCY VECTOR: ENGAGED",
    ],
  };

  let currentPhase = "NOMINAL";
  let feedPool = FEED_POOLS.NOMINAL.slice();
  let feedTimer = null;
  let feedIdx = 0;

  function refreshFeedPool() {
    const nextPool = FEED_POOLS[currentPhase] || FEED_POOLS.NOMINAL;
    feedPool = nextPool.slice();
  }

  function scheduleFeed(delayMs) {
    if (feedTimer) clearTimeout(feedTimer);
    feedTimer = setTimeout(pushFeed, delayMs);
  }

  function pushFeed() {
    if (document.hidden) {
      scheduleFeed(3000);
      return;
    }
    if (!feedEls.length) return;

    const msg = feedPool[Math.floor(Math.random() * feedPool.length)];
    const target = feedEls[feedIdx % feedEls.length];
    const d = new Date();
    const stamp = `${utils.pad(d.getHours())}:${utils.pad(d.getMinutes())}:${utils.pad(d.getSeconds())}`;
    target.textContent = `[${stamp}] ${msg}`;
    window.OX500?.bus?.emit("feed:push", { message: msg, phase: currentPhase });
    feedIdx += 1;
    scheduleFeed(6500 + Math.random() * 6500);
  }

  window.OX500?.bus?.on("system:phase", (payload) => {
    const nextPhase = String(payload && payload.phase ? payload.phase : "").toUpperCase();
    if (!FEED_POOLS[nextPhase]) return;
    currentPhase = nextPhase;
    refreshFeedPool();
  });

  refreshFeedPool();
  scheduleFeed(1800);

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      if (feedTimer) {
        clearTimeout(feedTimer);
        feedTimer = null;
      }
      return;
    }

    if (!feedTimer) scheduleFeed(800);
  });
})();
