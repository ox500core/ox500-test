// === GLITCH ===
// Incident-only visual corruption pulses.
// Uses existing DOM/CSS effects, no dynamic DOM creation.

import { bus } from '../core/event-bus.js';

const INCIDENT_PHASE = 'INCIDENT';

const GLITCH_CONFIG = {
  BURST_DURATION_MS: [420, 800], // [min, max]
  NEXT_PULSE_MIN_MS: 6000,
  NEXT_PULSE_MAX_MS: 22000,
  NEXT_PULSE_MIN_MS_MOBILE: 9000,
  NEXT_PULSE_MAX_MS_MOBILE: 24000,
  VISIBILITY_RESUME_MS: 1200,
};

const ENTRY_EFFECT_POOL = [
  'scanline-burst',
  'signal-drop',
  'scanline-burst',
  'noise-grain',
  'inverse-flash',
];

const RUNTIME_EFFECT_POOL = [
  'scanline-burst',
  'noise-grain',
  'signal-drop',
  'noise-grain',
  'jitter-pulse',
  'scanline-burst',
  'inverse-flash', // rare due to low weight
];

const INTENSITY_POOL_ENTRY = ['normal', 'strong', 'strong'];
const INTENSITY_POOL_RUNTIME = ['subtle', 'normal', 'normal', 'strong'];

function pickOne(pool) {
  return pool[Math.floor(Math.random() * pool.length)];
}

function clampDurationMs(v, min, max) {
  const n = Number(v);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
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

  let incidentActive = false;
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

  function nextPulseDelayMs() {
    const min = coarsePointer
      ? GLITCH_CONFIG.NEXT_PULSE_MIN_MS_MOBILE
      : GLITCH_CONFIG.NEXT_PULSE_MIN_MS;
    const max = coarsePointer
      ? GLITCH_CONFIG.NEXT_PULSE_MAX_MS_MOBILE
      : GLITCH_CONFIG.NEXT_PULSE_MAX_MS;
    return min + Math.random() * (max - min);
  }

  function scheduleNextPulse(delayMs) {
    if (!incidentActive) return;
    pulseTimer = clearTimer(pulseTimer);
    pulseTimer = setTimeout(() => {
      pulseTimer = null;
      if (!incidentActive) return;
      runPulse(false);
      scheduleNextPulse();
    }, delayMs ?? nextPulseDelayMs());
  }

  function intensityVars(intensity) {
    if (intensity === 'strong') {
      return { jitterPx: '2px' };
    }
    if (intensity === 'subtle') {
      return { jitterPx: '1px' };
    }
    return { jitterPx: '1.5px' };
  }

  function runPulse(isEntry) {
    if (!incidentActive) return;
    if (document.hidden) {
      scheduleNextPulse(GLITCH_CONFIG.VISIBILITY_RESUME_MS);
      return;
    }

    const effect = pickOne(isEntry ? ENTRY_EFFECT_POOL : RUNTIME_EFFECT_POOL);
    const intensity = pickOne(isEntry ? INTENSITY_POOL_ENTRY : INTENSITY_POOL_RUNTIME);
    const rawDuration =
      GLITCH_CONFIG.BURST_DURATION_MS[0] +
      Math.random() * (GLITCH_CONFIG.BURST_DURATION_MS[1] - GLITCH_CONFIG.BURST_DURATION_MS[0]);
    const duration = clampDurationMs(rawDuration, 420, 800);
    const vars = intensityVars(intensity);

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

    bus.emit('glitch:trigger', { type: `incident:${effect}` });

    burstTimer = clearTimer(burstTimer);
    burstTimer = setTimeout(() => {
      clearClasses();
      burstTimer = null;
    }, duration);
  }

  bus.on('system:phase', (payload) => {
    const phase = String(payload?.phase || '').toUpperCase();

    if (phase === INCIDENT_PHASE) {
      const entering = !incidentActive;
      incidentActive = true;
      if (entering) runPulse(true);
      if (!pulseTimer) scheduleNextPulse();
      return;
    }

    incidentActive = false;
    clearTimers();
    clearClasses();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      pulseTimer = clearTimer(pulseTimer);
      return;
    }
    if (!incidentActive) return;
    runPulse(false);
    scheduleNextPulse(GLITCH_CONFIG.VISIBILITY_RESUME_MS);
  });
}
