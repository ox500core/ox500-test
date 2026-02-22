// === DIAGNOSTICS ===
// Orchestrates diagnostics model and diagnostics view.
// Model owns transitions/metrics, view owns DOM updates.

import { bus } from '../core/event-bus.js';
import { createDiagnosticsModel } from './diagnostics-state.js';
import { initDiagnosticsView, renderDiagnostics, applyDiagnosticsPulse } from './diagnostics-view.js';

export function initDiagnostics() {
  const panel = document.getElementById('rightBlock1');
  if (!panel) return;

  const view = initDiagnosticsView(panel);

  const sessionSeed =
    ((Date.now() & 0xffff) ^ ((window.location.pathname || '').length << 7)) >>> 0;
  let prngState = sessionSeed || 1;
  function rand() {
    prngState ^= prngState << 13;
    prngState ^= prngState >>> 17;
    prngState ^= prngState << 5;
    return ((prngState >>> 0) % 10000) / 10000;
  }

  let pulseTimer = null;
  const model = createDiagnosticsModel(rand, (nextPhase) => {
    pulseTimer = applyDiagnosticsPulse(panel, true, pulseTimer);
    bus.emit('system:phase', { phase: nextPhase });
  });

  bus.on('feed:push', () => {
    model.onFeedPush();
  });

  bus.on('logs:pageLoaded', () => {
    model.onLogsPageLoaded();
  });

  bus.on('log:changed', () => {
    model.onLogChanged();
  });

  bus.on('glitch:trigger', (payload) => {
    model.onGlitchTriggered(payload?.type);
  });

  bus.on('boot:complete', () => {
    model.onBootComplete();
  });

  bus.on('tick', () => {
    const now = Date.now();
    const density = model.tick(now);
    renderDiagnostics(view, model.getRenderSnapshot(density));
    bus.emit('diagnostics:update', model.getDiagnosticsPayload(density));
  });

  pulseTimer = applyDiagnosticsPulse(panel, false, pulseTimer);
  bus.emit('system:phase', { phase: model.getPhase() });
  const initialDensity = model.eventDensity();
  renderDiagnostics(view, model.getRenderSnapshot(initialDensity));
  bus.emit('diagnostics:update', model.getDiagnosticsPayload(initialDensity));
}
