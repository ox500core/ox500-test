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
const PHASE_CLASS_MAP = {
  [PHASES.NOMINAL]: 'diag-phase-nominal',
  [PHASES.UNSTABLE]: 'diag-phase-unstable',
  [PHASES.INCIDENT]: 'diag-phase-incident',
};

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

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

function fmtDrift(v) {
  return `${v >= 0 ? '+' : '-'}${Math.abs(v).toFixed(3)}`;
}

// State machine for diagnostics metrics and phase transitions.
export function createDiagnosticsModel(rand, onPhaseChange) {
  const now = Date.now();
  const state = {
    phase: PHASES.NOMINAL,
    phaseChangedAt: now - PHASE_TRANSITION_COOLDOWN_MS,
    temporalDrift: 0.003,
    coherence: 0.982,
    anomaly: 0.018,
    pressure: 0.24,
    ambientStress: 0.5,
    unstableSince: 0,
    incidentEndsAt: 0,
    incidentBlockedUntil: now + 25000,
    lastEventAt: now,
    lastSemantic: 'ARCHIVE LINK STABLE',
    recentEvents: [],
  };

  function randomRange(min, max) {
    return min + ((max - min) * rand());
  }

  function pushEvent(weight, semantic) {
    const ts = Date.now();
    state.recentEvents.push({ t: ts, w: weight });
    state.lastEventAt = ts;
    if (semantic) state.lastSemantic = semantic;
  }

  function pruneEvents(ts) {
    const minTs = ts - RECENT_EVENT_WINDOW_MS;
    while (state.recentEvents.length && state.recentEvents[0].t < minTs) {
      state.recentEvents.shift();
    }
  }

  function eventDensity() {
    let sum = 0;
    for (const e of state.recentEvents) sum += e.w;
    return clamp(sum / 14, 0, 1);
  }

  function transition(next, ts) {
    if (next === state.phase) return;
    const prevPhase = state.phase;
    state.phase = next;
    state.phaseChangedAt = ts;

    if (next === PHASES.UNSTABLE && prevPhase !== PHASES.UNSTABLE) {
      state.unstableSince = ts;
    } else if (next === PHASES.NOMINAL) {
      state.unstableSince = 0;
    }

    if (next === PHASES.INCIDENT) {
      state.incidentEndsAt = ts + Math.round(randomRange(INCIDENT_DURATION_MIN_MS, INCIDENT_DURATION_MAX_MS));
      state.incidentBlockedUntil = ts + INCIDENT_REENTRY_BLOCK_MS;
    }

    onPhaseChange(next);
  }

  function updatePhase(ts) {
    if (state.phase === PHASES.INCIDENT) {
      if (ts >= state.incidentEndsAt) {
        transition(PHASES.UNSTABLE, ts);
        return;
      }

      if (ts - state.phaseChangedAt < PHASE_TRANSITION_COOLDOWN_MS) return;
      if (state.pressure <= PRESSURE_THRESHOLDS.INCIDENT_TO_UNSTABLE) {
        transition(PHASES.UNSTABLE, ts);
      }
      return;
    }

    if (ts - state.phaseChangedAt < PHASE_TRANSITION_COOLDOWN_MS) return;

    if (state.phase === PHASES.NOMINAL && state.pressure >= PRESSURE_THRESHOLDS.NOMINAL_TO_UNSTABLE) {
      transition(PHASES.UNSTABLE, ts);
    } else if (state.phase === PHASES.UNSTABLE) {
      const unstableDwell = state.unstableSince ? ts - state.unstableSince : 0;
      const canEnterIncident =
        ts >= state.incidentBlockedUntil &&
        unstableDwell >= UNSTABLE_MIN_DWELL_BEFORE_INCIDENT_MS &&
        state.pressure >= PRESSURE_THRESHOLDS.UNSTABLE_TO_INCIDENT;

      if (canEnterIncident) transition(PHASES.INCIDENT, ts);
      else if (unstableDwell >= UNSTABLE_MAX_DWELL_MS) transition(PHASES.NOMINAL, ts);
      else if (state.pressure <= PRESSURE_THRESHOLDS.UNSTABLE_TO_NOMINAL) transition(PHASES.NOMINAL, ts);
    }
  }

  function tick(ts) {
    pruneEvents(ts);

    const density = eventDensity();
    const silenceSec = (ts - state.lastEventAt) / 1000;
    const silencePressure = silenceSec > 14 ? clamp((silenceSec - 14) / 36, 0, 1) : 0;

    const waveA = Math.sin(ts / 26000);
    const waveB = Math.sin(ts / 61000 + 1.3);
    const ambientTarget = clamp(0.45 + (waveA * 0.20) + (waveB * 0.14), 0.16, 0.78);
    state.ambientStress = clamp(
      state.ambientStress * 0.82 + ambientTarget * 0.18 + (rand() - 0.5) * 0.02,
      0.18,
      0.86,
    );
    const ambientPull = (state.ambientStress - state.pressure) * 0.14;

    const phaseSettle =
      state.phase === PHASES.NOMINAL ? -0.010 :
      state.phase === PHASES.UNSTABLE ? -0.006 : 0;

    state.pressure = clamp(
      state.pressure * 0.64 +
      ambientPull +
      state.ambientStress * 0.19 +
      density * 0.04 -
      silencePressure * 0.02 +
      phaseSettle +
      (rand() - 0.5) * 0.01,
      0,
      1,
    );
    state.temporalDrift = clamp(
      state.temporalDrift * 0.985 + (state.pressure - 0.35) * 0.0009 + (rand() - 0.5) * 0.00025,
      -0.099,
      0.099,
    );
    state.anomaly = clamp(state.anomaly * 0.988 + state.pressure * 0.012, 0, 0.25);
    state.coherence = clamp(state.coherence + (0.995 - state.coherence) * 0.01 - state.pressure * 0.005, 0.84, 1);

    updatePhase(ts);
    return density;
  }

  function onFeedPush() {
    pushEvent(0.9, 'FEED INJECTION DETECTED');
    state.pressure = clamp(state.pressure + 0.02, 0, 1);
  }

  function onLogsPageLoaded() {
    pushEvent(1.0, 'ARCHIVE SEGMENT SYNCHRONIZED');
    state.pressure = clamp(state.pressure + 0.025, 0, 1);
  }

  function onLogChanged() {
    pushEvent(1.1, 'ACTIVE ENTRY VECTOR REALIGNED');
    state.pressure = clamp(state.pressure + 0.03, 0, 1);
  }

  function onGlitchTriggered(type) {
    const semantic = type === 'whisper' ? 'WHISPER CHANNEL BREACHED' : 'COHERENCE DROP DETECTED';
    pushEvent(1.6, semantic);
    state.pressure = clamp(state.pressure + 0.05, 0, 1);
    state.anomaly = clamp(state.anomaly + 0.02, 0, 0.25);
    state.coherence = clamp(state.coherence - 0.025, 0.84, 1);
  }

  function onBootComplete() {
    pushEvent(0.4, 'BOOT LAYER RELEASED');
  }

  function getRenderSnapshot(density) {
    return {
      drift: fmtDrift(state.temporalDrift),
      density: densityLabel(density),
      coherence: state.coherence.toFixed(2),
      anomaly: anomalyLabel(state.anomaly),
      phase: state.phase,
      transient: state.lastSemantic,
      phaseClass: PHASE_CLASS_MAP[state.phase] || PHASE_CLASS_MAP[PHASES.NOMINAL],
    };
  }

  function getDiagnosticsPayload(density) {
    return {
      phase: state.phase,
      temporalDrift: state.temporalDrift,
      anomaly: state.anomaly,
      eventDensity: Number.isFinite(density) ? density : eventDensity(),
    };
  }

  return {
    getPhase: () => state.phase,
    eventDensity,
    tick,
    onFeedPush,
    onLogsPageLoaded,
    onLogChanged,
    onGlitchTriggered,
    onBootComplete,
    getRenderSnapshot,
    getDiagnosticsPayload,
  };
}
