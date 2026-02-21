// === GLITCH ===
// Phase-aware visual corruption pulses.
// Uses existing DOM/CSS effects, no dynamic DOM creation.

import { bus } from '../core/event-bus.js';

const PHASES = {
  NOMINAL: 'NOMINAL',
  UNSTABLE: 'UNSTABLE',
  INCIDENT: 'INCIDENT',
};

const GLITCH_CONFIG = {
  VISIBILITY_RESUME_MS: 1200,
  PHASE_PROFILES: {
    [PHASES.NOMINAL]: {
      enabled: true,
      pulseMsDesktop: [48000, 92000],
      pulseMsMobile: [62000, 110000],
      burstMs: [180, 320],
      entryEffects: ['scanline-burst', 'noise-grain'],
      runtimeEffects: ['scanline-burst', 'noise-grain', 'scanline-burst'],
      entryIntensities: ['subtle'],
      runtimeIntensities: ['subtle', 'subtle', 'normal'],
      jitterPx: { subtle: '0.8px', normal: '1px', strong: '1.2px' },
      emitBus: false,
    },
    [PHASES.UNSTABLE]: {
      enabled: true,
      pulseMsDesktop: [12000, 28000],
      pulseMsMobile: [15000, 32000],
      burstMs: [220, 420],
      entryEffects: ['scanline-burst', 'noise-grain', 'jitter-pulse'],
      runtimeEffects: ['scanline-burst', 'noise-grain', 'jitter-pulse', 'signal-drop'],
      entryIntensities: ['subtle', 'normal'],
      runtimeIntensities: ['subtle', 'normal', 'normal'],
      jitterPx: { subtle: '1px', normal: '1.3px', strong: '1.6px' },
      emitBus: false,
    },
    [PHASES.INCIDENT]: {
      enabled: true,
      pulseMsDesktop: [1400, 4600],
      pulseMsMobile: [1900, 5600],
      burstMs: [160, 360],
      entryEffects: ['scanline-burst', 'noise-grain', 'signal-drop'],
      runtimeEffects: [
        'scanline-burst',
        'noise-grain',
        'jitter-pulse',
        'scanline-burst',
        'noise-grain',
        'signal-drop',
        'inverse-flash',
      ],
      entryIntensities: ['normal', 'strong'],
      runtimeIntensities: ['subtle', 'subtle', 'normal', 'normal'],
      jitterPx: { subtle: '1.1px', normal: '1.5px', strong: '2px' },
      emitBus: true,
    },
  },
};

function pickOne(pool) {
  return pool[Math.floor(Math.random() * pool.length)];
}

function clampDurationMs(v, min, max) {
  const n = Number(v);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function normalizePhase(value) {
  const phase = String(value || '').trim().toUpperCase();
  if (phase === PHASES.UNSTABLE) return PHASES.UNSTABLE;
  if (phase === PHASES.INCIDENT) return PHASES.INCIDENT;
  return PHASES.NOMINAL;
}

function normalizeTransitionPhase(value) {
  const phase = String(value || '').trim().toUpperCase();
  if (phase === PHASES.UNSTABLE) return PHASES.UNSTABLE;
  if (phase === PHASES.INCIDENT) return PHASES.INCIDENT;
  return PHASES.NOMINAL;
}

function clearTimer(timerId) {
  if (!timerId) return null;
  clearTimeout(timerId);
  return null;
}

export function initGlitch() {
  const prefersReduced =
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  const coarsePointer =
    window.matchMedia?.('(hover:none) and (pointer:coarse)').matches ?? false;

  const hero = document.getElementById('hero');
  const title = document.getElementById('title');
  const status = document.getElementById('status');
  const overlay = document.getElementById('overlayLayer');

  if (prefersReduced || !hero || !title || !status || !overlay) return;

  let currentPhase = PHASES.NOMINAL;
  let pulseTimer = null;
  let burstTimer = null;

  function clearTimers() {
    pulseTimer = clearTimer(pulseTimer);
    burstTimer = clearTimer(burstTimer);
  }

  function clearClasses() {
    overlay.classList.remove(
      'incident-overlay',
      'incident-scanline-burst',
      'incident-noise-grain',
      'incident-signal-drop',
      'incident-inverse-flash',
      'incident-jitter-pulse',
      'incident-intensity-subtle',
      'incident-intensity-normal',
      'incident-intensity-strong',
    );
    overlay.style.removeProperty('--incident-burst-ms');
    overlay.style.removeProperty('--incident-jitter-px');

    hero.classList.remove('incident-jitter-pulse', 'glitch-invert');
    title.classList.remove('glitch-shift');
    status.classList.remove('glitch-dim');
  }

  function phaseProfile() {
    return GLITCH_CONFIG.PHASE_PROFILES[currentPhase] || GLITCH_CONFIG.PHASE_PROFILES[PHASES.NOMINAL];
  }

  function nextPulseDelayMs() {
    const profile = phaseProfile();
    const range = coarsePointer ? profile.pulseMsMobile : profile.pulseMsDesktop;
    const min = range[0];
    const max = range[1];
    return min + Math.random() * (max - min);
  }

  function scheduleNextPulse(delayMs) {
    if (!phaseProfile().enabled) return;
    pulseTimer = clearTimer(pulseTimer);
    pulseTimer = setTimeout(() => {
      pulseTimer = null;
      if (!phaseProfile().enabled) return;
      runPulse(false);
      scheduleNextPulse();
    }, delayMs ?? nextPulseDelayMs());
  }

  function intensityVars(intensity, profile) {
    const map = profile.jitterPx || {};
    return { jitterPx: map[intensity] || map.normal || '1.5px' };
  }

  function runPulse(isEntry) {
    const profile = phaseProfile();
    if (!profile.enabled) return;
    if (document.hidden) {
      scheduleNextPulse(GLITCH_CONFIG.VISIBILITY_RESUME_MS);
      return;
    }

    const effect = pickOne(isEntry ? profile.entryEffects : profile.runtimeEffects);
    const intensity = pickOne(isEntry ? profile.entryIntensities : profile.runtimeIntensities);
    const rawDuration = profile.burstMs[0] + Math.random() * (profile.burstMs[1] - profile.burstMs[0]);
    const duration = clampDurationMs(rawDuration, profile.burstMs[0], profile.burstMs[1]);
    const vars = intensityVars(intensity, profile);

    clearClasses();
    // Force reflow so repeated class toggles reliably restart animations.
    void overlay.offsetWidth;

    overlay.style.setProperty('--incident-burst-ms', `${Math.round(duration)}ms`);
    overlay.style.setProperty('--incident-jitter-px', vars.jitterPx);

    overlay.classList.add('incident-overlay', `incident-intensity-${intensity}`);

    if (effect === 'scanline-burst') {
      overlay.classList.add('incident-scanline-burst');
      title.classList.add('glitch-shift');
    } else if (effect === 'noise-grain') {
      overlay.classList.add('incident-noise-grain');
      status.classList.add('glitch-dim');
    } else if (effect === 'signal-drop') {
      overlay.classList.add('incident-signal-drop');
      status.classList.add('glitch-dim');
    } else if (effect === 'inverse-flash') {
      overlay.classList.add('incident-inverse-flash');
      hero.classList.add('glitch-invert');
    } else {
      overlay.classList.add('incident-jitter-pulse');
      hero.classList.add('incident-jitter-pulse');
      title.classList.add('glitch-shift');
    }

    if (profile.emitBus) {
      bus.emit('glitch:trigger', { type: `incident:${effect}` });
    }

    burstTimer = clearTimer(burstTimer);
    burstTimer = setTimeout(() => {
      clearClasses();
      burstTimer = null;
    }, duration);
  }

  function runTransitionPulse(payload) {
    const toPhase = normalizeTransitionPhase(payload?.to);
    const requested = Number(payload?.durationMs);
    const duration = clampDurationMs(requested, 160, 520);

    let effectPool = ['scanline-burst', 'noise-grain'];
    let intensityPool = ['subtle', 'normal'];

    if (toPhase === PHASES.UNSTABLE) {
      effectPool = ['scanline-burst', 'noise-grain', 'jitter-pulse'];
      intensityPool = ['normal', 'normal', 'subtle'];
    } else if (toPhase === PHASES.INCIDENT) {
      effectPool = ['noise-grain', 'signal-drop', 'inverse-flash', 'scanline-burst'];
      intensityPool = ['normal', 'strong', 'normal'];
    }

    const effect = pickOne(effectPool);
    const intensity = pickOne(intensityPool);
    const vars = intensityVars(intensity, phaseProfile());

    clearClasses();
    void overlay.offsetWidth;

    overlay.style.setProperty('--incident-burst-ms', `${Math.round(duration)}ms`);
    overlay.style.setProperty('--incident-jitter-px', vars.jitterPx);
    overlay.classList.add('incident-overlay', `incident-intensity-${intensity}`);

    if (effect === 'scanline-burst') {
      overlay.classList.add('incident-scanline-burst');
      title.classList.add('glitch-shift');
    } else if (effect === 'noise-grain') {
      overlay.classList.add('incident-noise-grain');
      status.classList.add('glitch-dim');
    } else if (effect === 'signal-drop') {
      overlay.classList.add('incident-signal-drop');
      status.classList.add('glitch-dim');
    } else if (effect === 'inverse-flash') {
      overlay.classList.add('incident-inverse-flash');
      hero.classList.add('glitch-invert');
    } else {
      overlay.classList.add('incident-jitter-pulse');
      hero.classList.add('incident-jitter-pulse');
      title.classList.add('glitch-shift');
    }

    burstTimer = clearTimer(burstTimer);
    burstTimer = setTimeout(() => {
      clearClasses();
      burstTimer = null;
    }, duration);
  }

  bus.on('system:phase', (payload) => {
    const nextPhase = normalizePhase(payload?.phase);
    const entering = nextPhase !== currentPhase;
    currentPhase = nextPhase;
    clearTimers();
    clearClasses();

    if (!phaseProfile().enabled) return;
    if (entering) runPulse(true);
    scheduleNextPulse();
  });

  bus.on('system:phase-transition', (payload) => {
    runTransitionPulse(payload);
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      pulseTimer = clearTimer(pulseTimer);
      return;
    }
    if (!phaseProfile().enabled) return;
    runPulse(false);
    scheduleNextPulse(GLITCH_CONFIG.VISIBILITY_RESUME_MS);
  });

  const initialPhase = normalizePhase(document.body?.dataset?.systemPhase);
  currentPhase = initialPhase;
  if (phaseProfile().enabled) {
    scheduleNextPulse(nextPulseDelayMs());
  }
}
