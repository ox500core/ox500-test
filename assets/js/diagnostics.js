(function () {
  const ox = window.OX500;
  const bus = ox && ox.bus;
  if (!bus) return;

  const panel = document.getElementById("rightBlock1");
  if (!panel) return;

  const PHASES = {
    NOMINAL: "NOMINAL",
    UNSTABLE: "UNSTABLE",
    INCIDENT: "INCIDENT",
  };

  let phase = PHASES.NOMINAL;
  let phaseChangedAt = Date.now();

  let temporalDrift = 0.003;
  let coherence = 0.982;
  let anomaly = 0.018;
  let pressure = 0.16;
  let pulseTimer = null;

  const recentEvents = [];
  let lastEventAt = Date.now();
  let lastSemantic = "ARCHIVE LINK STABLE";

  const sessionSeed = ((Date.now() & 0xffff) ^ ((window.location.pathname || "").length << 7)) >>> 0;
  let prngState = sessionSeed || 1;

  function rand() {
    prngState ^= prngState << 13;
    prngState ^= prngState >>> 17;
    prngState ^= prngState << 5;
    return ((prngState >>> 0) % 10000) / 10000;
  }

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  function pushEvent(weight, semantic) {
    const now = Date.now();
    recentEvents.push({ t: now, w: weight });
    lastEventAt = now;
    if (semantic) lastSemantic = semantic;
  }

  function pruneEvents(now) {
    const minTs = now - 60000;
    while (recentEvents.length && recentEvents[0].t < minTs) {
      recentEvents.shift();
    }
  }

  function eventDensity() {
    let sum = 0;
    for (const e of recentEvents) sum += e.w;
    return clamp(sum / 14, 0, 1);
  }

  function densityLabel(v) {
    if (v < 0.24) return "LOW";
    if (v < 0.62) return "STABLE";
    return "ELEVATED";
  }

  function anomalyLabel(v) {
    if (v < 0.04) return "LOW";
    if (v < 0.1) return "RISING";
    return "ELEVATED";
  }

  function coherenceTag(v) {
    if (v > 0.97) return "LOCKED";
    if (v > 0.92) return "NOMINAL";
    if (v > 0.88) return "DEGRADED";
    return "UNSTABLE";
  }

  function fmtDrift(v) {
    const sign = v >= 0 ? "+" : "-";
    return `${sign}${Math.abs(v).toFixed(3)}`;
  }

  function canTransition(now) {
    return now - phaseChangedAt >= 7000;
  }

  function applyPhaseVisual(pulse) {
    panel.classList.remove("diag-pulse");
    if (!pulse) return;
    panel.classList.add("diag-pulse");
    if (pulseTimer) clearTimeout(pulseTimer);
    pulseTimer = setTimeout(() => {
      panel.classList.remove("diag-pulse");
      pulseTimer = null;
    }, 240);
  }

  function transition(next, now) {
    if (next === phase) return;
    phase = next;
    phaseChangedAt = now;
    applyPhaseVisual(true);
    bus.emit("system:phase", { phase });
  }

  function updatePhase(now) {
    if (!canTransition(now)) return;

    if (phase === PHASES.NOMINAL) {
      if (pressure >= 0.46) transition(PHASES.UNSTABLE, now);
      return;
    }

    if (phase === PHASES.UNSTABLE) {
      if (pressure >= 0.74) transition(PHASES.INCIDENT, now);
      else if (pressure <= 0.28) transition(PHASES.NOMINAL, now);
      return;
    }

    if (phase === PHASES.INCIDENT && pressure <= 0.56) {
      transition(PHASES.UNSTABLE, now);
    }
  }

  function render(density) {
    let phaseClass = "diag-phase-nominal";
    if (phase === PHASES.UNSTABLE) phaseClass = "diag-phase-unstable";
    else if (phase === PHASES.INCIDENT) phaseClass = "diag-phase-incident";

    panel.innerHTML = [
      `<span class="diag-line">TEMPORAL DRIFT: ${fmtDrift(temporalDrift)}</span>`,
      `<span class="diag-line">EVENT DENSITY: ${densityLabel(density)}</span>`,
      `<span class="diag-line">SIGNAL COHERENCE: ${coherence.toFixed(2)} [${coherenceTag(coherence)}]</span>`,
      `<span class="diag-line">ANOMALY PROBABILITY: ${anomalyLabel(anomaly)}</span>`,
      `<span class="diag-line">SYSTEM PHASE: <span class="diag-phase-value ${phaseClass}">${phase}</span></span>`,
      `<span class="diag-line">LAST TRANSIENT: ${lastSemantic}</span>`,
    ].join("");
  }

  bus.on("feed:push", () => {
    pushEvent(0.9, "FEED INJECTION DETECTED");
    pressure = clamp(pressure + 0.02, 0, 1);
  });

  bus.on("logs:pageLoaded", () => {
    pushEvent(1.0, "ARCHIVE SEGMENT SYNCHRONIZED");
    pressure = clamp(pressure + 0.025, 0, 1);
  });

  bus.on("log:changed", () => {
    pushEvent(1.1, "ACTIVE ENTRY VECTOR REALIGNED");
    pressure = clamp(pressure + 0.03, 0, 1);
  });

  bus.on("glitch:trigger", (payload) => {
    const semantic = payload && payload.type === "whisper"
      ? "WHISPER CHANNEL BREACHED"
      : "COHERENCE DROP DETECTED";
    pushEvent(1.6, semantic);
    pressure = clamp(pressure + 0.05, 0, 1);
    anomaly = clamp(anomaly + 0.02, 0, 0.25);
    coherence = clamp(coherence - 0.025, 0.84, 1);
  });

  bus.on("boot:complete", () => {
    pushEvent(0.4, "BOOT LAYER RELEASED");
  });

  bus.on("tick", () => {
    const now = Date.now();
    pruneEvents(now);

    const density = eventDensity();
    const silenceSec = (now - lastEventAt) / 1000;
    const silencePressure = silenceSec > 14 ? clamp((silenceSec - 14) / 36, 0, 1) : 0;

    pressure = clamp(
      pressure + density * 0.01 + silencePressure * 0.012 - 0.006 + (rand() - 0.5) * 0.002,
      0,
      1
    );

    temporalDrift = clamp(
      temporalDrift * 0.985 + (pressure - 0.35) * 0.0009 + (rand() - 0.5) * 0.00025,
      -0.099,
      0.099
    );

    anomaly = clamp(anomaly * 0.988 + pressure * 0.012, 0, 0.25);
    coherence = clamp(coherence + (0.995 - coherence) * 0.01 - pressure * 0.005, 0.84, 1);

    updatePhase(now);
    render(density);
  });

  applyPhaseVisual(false);
  bus.emit("system:phase", { phase });
  render(eventDensity());
})();
