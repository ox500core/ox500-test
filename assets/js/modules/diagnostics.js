// === DIAGNOSTICS ===
// Simulated system diagnostics panel. Reacts to bus events,
// updates phase (NOMINAL / UNSTABLE / INCIDENT) and renders metrics.

import { bus } from '../core/event-bus.js';

// === CONFIG ===

const PHASES = { NOMINAL: 'NOMINAL', UNSTABLE: 'UNSTABLE', INCIDENT: 'INCIDENT' };
const PHASE_TRANSITION_COOLDOWN_MS = 7000;
const INCIDENT_DURATION_MIN_MS = 2200;
const INCIDENT_DURATION_MAX_MS = 6500;
const INCIDENT_REENTRY_BLOCK_MS = 55000;
const UNSTABLE_MIN_DWELL_BEFORE_INCIDENT_MS = 12000;
const UNSTABLE_MAX_DWELL_MS = 45000;
const RECENT_EVENT_WINDOW_MS = 60000;
const PRESSURE_THRESHOLDS = {
  NOMINAL_TO_UNSTABLE: 0.50,
  UNSTABLE_TO_INCIDENT: 0.62,
  UNSTABLE_TO_NOMINAL: 0.30,
  INCIDENT_TO_UNSTABLE: 0.46,
};
const DENSITY_LABEL_THRESHOLDS = { LOW: 0.24, STABLE: 0.62 };
const ANOMALY_LABEL_THRESHOLDS = { LOW: 0.04, RISING: 0.1 };
const COHERENCE_THRESHOLDS = { LOCKED: 0.97, NOMINAL: 0.92, DEGRADED: 0.88 };
const PHASE_CLASS_MAP = {
  [PHASES.NOMINAL]: 'diag-phase-nominal',
  [PHASES.UNSTABLE]: 'diag-phase-unstable',
  [PHASES.INCIDENT]: 'diag-phase-incident',
};
const DIAG_PHASE_CLASSES = Object.values(PHASE_CLASS_MAP);

// === INIT ===

export function initDiagnostics() {
  const panel = document.getElementById('rightBlock1');
  if (!panel) return;

  // === STATE ===
  let phase = PHASES.NOMINAL;
  let phaseChangedAt = Date.now() - PHASE_TRANSITION_COOLDOWN_MS;
  let temporalDrift = 0.003;
  let coherence = 0.982;
  let anomaly = 0.018;
  let pressure = 0.24;
  let ambientStress = 0.5;
  let pulseTimer = null;
  let unstableSince = 0;
  let incidentEndsAt = 0;
  let incidentBlockedUntil = Date.now() + 25000;

  const recentEvents = [];
  let lastEventAt = Date.now();
  let lastSemantic = 'ARCHIVE LINK STABLE';
  const view = initDiagnosticsView(panel);

  // === PRNG (deterministic per session) ===
  const sessionSeed =
    ((Date.now() & 0xffff) ^ ((window.location.pathname || '').length << 7)) >>> 0;
  let prngState = sessionSeed || 1;

  function rand() {
    prngState ^= prngState << 13;
    prngState ^= prngState >>> 17;
    prngState ^= prngState << 5;
    return ((prngState >>> 0) % 10000) / 10000;
  }

  // === HELPERS ===

  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
  function randomRange(min, max) { return min + ((max - min) * rand()); }

  function pushEvent(weight, semantic) {
    const now = Date.now();
    recentEvents.push({ t: now, w: weight });
    lastEventAt = now;
    if (semantic) lastSemantic = semantic;
  }

  function pruneEvents(now) {
    const minTs = now - RECENT_EVENT_WINDOW_MS;
    while (recentEvents.length && recentEvents[0].t < minTs) recentEvents.shift();
  }

  function eventDensity() {
    let sum = 0;
    for (const e of recentEvents) sum += e.w;
    return clamp(sum / 14, 0, 1);
  }

  // === LABELS ===

  function densityLabel(v) {
    if (v < DENSITY_LABEL_THRESHOLDS.LOW) return 'LOW';
    if (v < DENSITY_LABEL_THRESHOLDS.STABLE) return 'STABLE';
    return 'HIGH';
  }

  function anomalyLabel(v) {
    if (v < ANOMALY_LABEL_THRESHOLDS.LOW) return 'LOW';
    if (v < ANOMALY_LABEL_THRESHOLDS.RISING) return 'RISING';
    return 'HIGH';
  }

  function coherenceTag(v) {
    if (v > COHERENCE_THRESHOLDS.LOCKED) return 'LOCKED';
    if (v > COHERENCE_THRESHOLDS.NOMINAL) return 'NOMINAL';
    if (v > COHERENCE_THRESHOLDS.DEGRADED) return 'DEGRADED';
    return 'UNSTABLE';
  }

  function fmtDrift(v) {
    return `${v >= 0 ? '+' : '-'}${Math.abs(v).toFixed(3)}`;
  }

  function emitDiagnosticsUpdate(density) {
    bus.emit('diagnostics:update', {
      phase,
      temporalDrift,
      anomaly,
      eventDensity: Number.isFinite(density) ? density : eventDensity(),
    });
  }

  // === PHASE TRANSITIONS ===

  function applyPhaseVisual(pulse) {
    panel.classList.remove('diag-pulse');
    if (!pulse) return;
    panel.classList.add('diag-pulse');
    if (pulseTimer) clearTimeout(pulseTimer);
    pulseTimer = setTimeout(() => {
      panel.classList.remove('diag-pulse');
      pulseTimer = null;
    }, 240);
  }

  function transition(next, now) {
    if (next === phase) return;
    const prev = phase;
    phase = next;
    phaseChangedAt = now;

    if (next === PHASES.UNSTABLE && prev !== PHASES.UNSTABLE) {
      unstableSince = now;
    } else if (next === PHASES.NOMINAL) {
      unstableSince = 0;
    }

    if (next === PHASES.INCIDENT) {
      incidentEndsAt = now + Math.round(randomRange(INCIDENT_DURATION_MIN_MS, INCIDENT_DURATION_MAX_MS));
      incidentBlockedUntil = now + INCIDENT_REENTRY_BLOCK_MS;
    }

    applyPhaseVisual(true);
    bus.emit('system:phase', { phase });
  }

  function updatePhase(now) {
    if (phase === PHASES.INCIDENT) {
      if (now >= incidentEndsAt) {
        transition(PHASES.UNSTABLE, now);
        return;
      }

      if (now - phaseChangedAt < PHASE_TRANSITION_COOLDOWN_MS) return;
      if (pressure <= PRESSURE_THRESHOLDS.INCIDENT_TO_UNSTABLE) {
        transition(PHASES.UNSTABLE, now);
      }
      return;
    }

    if (now - phaseChangedAt < PHASE_TRANSITION_COOLDOWN_MS) return;

    if (phase === PHASES.NOMINAL && pressure >= PRESSURE_THRESHOLDS.NOMINAL_TO_UNSTABLE) {
      transition(PHASES.UNSTABLE, now);
    } else if (phase === PHASES.UNSTABLE) {
      const unstableDwell = unstableSince ? now - unstableSince : 0;
      const canEnterIncident =
        now >= incidentBlockedUntil &&
        unstableDwell >= UNSTABLE_MIN_DWELL_BEFORE_INCIDENT_MS &&
        pressure >= PRESSURE_THRESHOLDS.UNSTABLE_TO_INCIDENT;

      if (canEnterIncident) transition(PHASES.INCIDENT, now);
      else if (unstableDwell >= UNSTABLE_MAX_DWELL_MS) transition(PHASES.NOMINAL, now);
      else if (pressure <= PRESSURE_THRESHOLDS.UNSTABLE_TO_NOMINAL) transition(PHASES.NOMINAL, now);
    }
  }

  // === RENDER ===

  function render(density) {
    if (!view.isReady) return;

    view.drift.textContent = fmtDrift(temporalDrift);
    view.density.textContent = densityLabel(density);
    view.coherence.textContent = coherence.toFixed(2);
    view.anomaly.textContent = anomalyLabel(anomaly);
    view.phase.textContent = phase;
    view.transient.textContent = lastSemantic;

    view.phase.classList.remove(...DIAG_PHASE_CLASSES);
    view.phase.classList.add(PHASE_CLASS_MAP[phase] || PHASE_CLASS_MAP[PHASES.NOMINAL]);
  }

  // === BUS LISTENERS ===

  bus.on('feed:push', () => {
    pushEvent(0.9, 'FEED INJECTION DETECTED');
    pressure = clamp(pressure + 0.02, 0, 1);
  });

  bus.on('logs:pageLoaded', () => {
    pushEvent(1.0, 'ARCHIVE SEGMENT SYNCHRONIZED');
    pressure = clamp(pressure + 0.025, 0, 1);
  });

  bus.on('log:changed', () => {
    pushEvent(1.1, 'ACTIVE ENTRY VECTOR REALIGNED');
    pressure = clamp(pressure + 0.03, 0, 1);
  });

  bus.on('glitch:trigger', (payload) => {
    const semantic =
      payload?.type === 'whisper' ? 'WHISPER CHANNEL BREACHED' : 'COHERENCE DROP DETECTED';
    pushEvent(1.6, semantic);
    pressure = clamp(pressure + 0.05, 0, 1);
    anomaly = clamp(anomaly + 0.02, 0, 0.25);
    coherence = clamp(coherence - 0.025, 0.84, 1);
  });

  bus.on('boot:complete', () => {
    pushEvent(0.4, 'BOOT LAYER RELEASED');
  });

  bus.on('tick', () => {
    const now = Date.now();
    pruneEvents(now);

    const density = eventDensity();
    const silenceSec = (now - lastEventAt) / 1000;
    const silencePressure = silenceSec > 14 ? clamp((silenceSec - 14) / 36, 0, 1) : 0;

    // Ambient load wave keeps the system alive even without heavy user interaction.
    const waveA = Math.sin(now / 26000);
    const waveB = Math.sin(now / 61000 + 1.3);
    const ambientTarget = clamp(0.45 + (waveA * 0.20) + (waveB * 0.14), 0.16, 0.78);
    ambientStress = clamp(
      ambientStress * 0.82 + ambientTarget * 0.18 + (rand() - 0.5) * 0.02,
      0.18,
      0.86,
    );
    const ambientPull = (ambientStress - pressure) * 0.14;

    const phaseSettle =
      phase === PHASES.NOMINAL ? -0.010 :
      phase === PHASES.UNSTABLE ? -0.006 : 0;

    pressure = clamp(
      pressure * 0.64 +
      ambientPull +
      ambientStress * 0.19 +
      density * 0.04 -
      silencePressure * 0.02 +
      phaseSettle +
      (rand() - 0.5) * 0.01,
      0,
      1,
    );
    temporalDrift = clamp(
      temporalDrift * 0.985 + (pressure - 0.35) * 0.0009 + (rand() - 0.5) * 0.00025,
      -0.099,
      0.099,
    );
    anomaly = clamp(anomaly * 0.988 + pressure * 0.012, 0, 0.25);
    coherence = clamp(coherence + (0.995 - coherence) * 0.01 - pressure * 0.005, 0.84, 1);

    updatePhase(now);
    render(density);
    emitDiagnosticsUpdate(density);
  });

  // === INITIAL RENDER ===
  applyPhaseVisual(false);
  bus.emit('system:phase', { phase });
  const initialDensity = eventDensity();
  render(initialDensity);
  emitDiagnosticsUpdate(initialDensity);
}

function initDiagnosticsView(panel) {
  panel.innerHTML = [
    '<span class="diag-line log-line naked"><span class="log-id">TEMPORAL DRIFT:</span><span class="log-tag" data-diag-value="drift">+0.000</span></span>',
    '<span class="diag-line log-line naked"><span class="log-id">EVENT DENSITY:</span><span class="log-tag" data-diag-value="density">LOW</span></span>',
    '<span class="diag-line log-line naked"><span class="log-id">SIGNAL COHERENCE:</span><span class="log-tag" data-diag-value="coherence">0.98</span></span>',
    '<span class="diag-line log-line naked"><span class="log-id">ANOMALY PROBABILITY:</span><span class="log-tag" data-diag-value="anomaly">LOW</span></span>',
    '<span class="diag-line log-line naked"><span class="log-id">SYSTEM PHASE:</span><span class="log-tag"><span class="diag-phase-value diag-phase-nominal" data-diag-value="phase">NOMINAL</span></span></span>',
    '<span class="diag-line log-line naked"><span class="log-id">LAST TRANSIENT:</span><span class="log-tag" data-diag-value="transient">ARCHIVE LINK STABLE</span></span>',
  ].join('');

  const refs = {
    drift: panel.querySelector('[data-diag-value="drift"]'),
    density: panel.querySelector('[data-diag-value="density"]'),
    coherence: panel.querySelector('[data-diag-value="coherence"]'),
    anomaly: panel.querySelector('[data-diag-value="anomaly"]'),
    phase: panel.querySelector('[data-diag-value="phase"]'),
    transient: panel.querySelector('[data-diag-value="transient"]'),
  };
  const isReady = Object.values(refs).every(Boolean);

  return {
    ...refs,
    isReady,
  };
}
