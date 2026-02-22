const DIAG_PHASE_CLASSES = ['diag-phase-nominal', 'diag-phase-unstable', 'diag-phase-incident'];

export function initDiagnosticsView(panel) {
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

export function renderDiagnostics(view, snapshot) {
  if (!view.isReady) return;

  view.drift.textContent = snapshot.drift;
  view.density.textContent = snapshot.density;
  view.coherence.textContent = snapshot.coherence;
  view.anomaly.textContent = snapshot.anomaly;
  view.phase.textContent = snapshot.phase;
  view.transient.textContent = snapshot.transient;

  view.phase.classList.remove(...DIAG_PHASE_CLASSES);
  view.phase.classList.add(snapshot.phaseClass);
}

export function applyDiagnosticsPulse(panel, pulse, timerRef) {
  panel.classList.remove('diag-pulse');
  if (!pulse) return null;
  panel.classList.add('diag-pulse');
  if (timerRef) clearTimeout(timerRef);
  return setTimeout(() => {
    panel.classList.remove('diag-pulse');
  }, 240);
}
