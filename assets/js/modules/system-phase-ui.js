// === SYSTEM PHASE UI ===
// Global diegetic environment state for phase-dependent visual response.
// No DOM rebuilds; only body phase class toggles.

import { bus } from '../core/event-bus.js';

const PHASES = {
  NOMINAL: 'NOMINAL',
  UNSTABLE: 'UNSTABLE',
  INCIDENT: 'INCIDENT',
};

const PHASE_CLASSES = ['phase-nominal', 'phase-unstable', 'phase-incident'];
const TRANSITION_CLASSES = [
  'phase-transition',
  'phase-transition-to-nominal',
  'phase-transition-to-unstable',
  'phase-transition-to-incident',
];
const PHASE_EVENTS = ['system:phase', 'diagnostics:update'];
const PHASE_TRANSITION_MS = {
  [PHASES.NOMINAL]: 240,
  [PHASES.UNSTABLE]: 320,
  [PHASES.INCIDENT]: 460,
};

function normalizePhase(value) {
  const phase = String(value || '').trim().toUpperCase();
  if (phase === PHASES.UNSTABLE) return PHASES.UNSTABLE;
  if (phase === PHASES.INCIDENT) return PHASES.INCIDENT;
  return PHASES.NOMINAL;
}

function classNameForPhase(phase) {
  return `phase-${phase.toLowerCase()}`;
}

export function initSystemPhaseUi() {
  const body = document.body;
  const root = document.documentElement;
  if (!body) return;

  let currentPhase = null;
  let transitionTimer = null;
  let transitionToken = 0;

  function clearTransitionState() {
    body.classList.remove(...TRANSITION_CLASSES);
    body.style.removeProperty('--phase-transition-ms');
  }

  function commitPhase(nextPhase) {
    currentPhase = nextPhase;
    body.classList.remove(...PHASE_CLASSES);
    body.classList.add(classNameForPhase(nextPhase));
    body.dataset.systemPhase = nextPhase.toLowerCase();
    if (root) root.dataset.phase = nextPhase.toLowerCase();
  }

  function applyPhase(nextPhaseRaw) {
    const nextPhase = normalizePhase(nextPhaseRaw);
    if (nextPhase === currentPhase) return;
    const prevPhase = currentPhase;

    if (transitionTimer) {
      clearTimeout(transitionTimer);
      transitionTimer = null;
    }

    // First phase application should be immediate (no theatrics on boot paint).
    if (!prevPhase) {
      clearTransitionState();
      commitPhase(nextPhase);
      return;
    }

    const durationMs = PHASE_TRANSITION_MS[nextPhase] || 300;
    const token = ++transitionToken;

    clearTransitionState();
    body.classList.add('phase-transition', `phase-transition-to-${nextPhase.toLowerCase()}`);
    body.style.setProperty('--phase-transition-ms', `${durationMs}ms`);
    bus.emit('system:phase-transition', {
      from: prevPhase,
      to: nextPhase,
      durationMs,
    });

    transitionTimer = setTimeout(() => {
      if (token !== transitionToken) return;
      clearTransitionState();
      commitPhase(nextPhase);
      transitionTimer = null;
    }, durationMs);
  }

  applyPhase(root?.dataset?.phase || body.dataset.systemPhase || PHASES.NOMINAL);

  PHASE_EVENTS.forEach((eventName) => {
    bus.on(eventName, (payload) => {
      applyPhase(payload?.phase);
    });
  });
}
