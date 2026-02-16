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
const PHASE_EVENTS = ['system:phase', 'diagnostics:update'];

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
  if (!body) return;

  let currentPhase = null;

  function applyPhase(nextPhaseRaw) {
    const nextPhase = normalizePhase(nextPhaseRaw);
    if (nextPhase === currentPhase) return;

    currentPhase = nextPhase;
    body.classList.remove(...PHASE_CLASSES);
    body.classList.add(classNameForPhase(nextPhase));
    body.dataset.systemPhase = nextPhase.toLowerCase();
  }

  applyPhase(body.dataset.systemPhase || PHASES.NOMINAL);

  PHASE_EVENTS.forEach((eventName) => {
    bus.on(eventName, (payload) => {
      applyPhase(payload?.phase);
    });
  });
}
