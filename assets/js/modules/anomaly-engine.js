// === ANOMALY ENGINE V3 ===
// Session-seeded unstable anomalies with a 100-recipe catalog.
// Only a bounded subset runs in one session to preserve readability and performance.

import { bus } from '../core/event-bus.js';
import {
  PHASES,
  MAX_ACTIVE_EFFECTS_BY_PHASE,
  SESSION_RECIPE_COUNT,
  EFFECT_COOLDOWN_MS,
  CSS_CLASSES,
} from './anomaly/constants.js';
import {
  normalizePhase,
  createSeededRng,
  pickOne,
  randInt,
  pickUnique,
  corruptOneChar,
  buildRecipePool,
} from './anomaly/utils.js';
import { createAnomalyPresets } from './anomaly/presets.js';

const {
  FLIP_CLASS,
  FADE_CLASS,
  SENSOR_BURN_CLASS,
  PHASE_ICON_FLICKER_CLASS,
  LINK_GHOST_CLASS,
  ENGINE_CLASS,
  INCIDENT_ENGINE_CLASS,
} = CSS_CLASSES;

export function initAnomalyEngine() {
  const body = document.body;
  const clockEl = document.getElementById('clock');
  if (!body || !clockEl) return;

  const seedBase =
    ((Date.now() & 0xffff) ^
      ((window.location.pathname || '').length << 6) ^
      (window.innerWidth << 1)) >>> 0;
  const rand = createSeededRng(seedBase);

  const { profile, baseEffects, incidentRecipes } = createAnomalyPresets(rand);

  let phase = normalizePhase(body?.dataset?.systemPhase);
  let reverseClockTs = Date.now() - (profile.reverseClockOffsetSec * 1000);
  let incidentClockTs = Date.now();

  /** @type {Set<number>} */
  const loopTimers = new Set();
  /** @type {Set<Function>} */
  const activeCleanups = new Set();
  /** @type {Map<string, number>} */
  const lastTriggerTsByKey = new Map();
  let activeEffects = 0;

  function clearTimer(id) {
    if (!id) return;
    clearTimeout(id);
  }

  function withEffect(effectKey, durationMs, apply, cleanup) {
    const maxActive = MAX_ACTIVE_EFFECTS_BY_PHASE[phase] || 0;
    if (activeEffects >= maxActive) return false;
    if (document.hidden || (phase !== PHASES.UNSTABLE && phase !== PHASES.INCIDENT)) return false;
    const now = Date.now();
    const cooldownMs = EFFECT_COOLDOWN_MS[effectKey] || 1800;
    const lastTs = lastTriggerTsByKey.get(effectKey) || 0;
    if (now - lastTs < cooldownMs) return false;

    lastTriggerTsByKey.set(effectKey, now);
    activeEffects += 1;
    apply();
    const wrappedCleanup = () => {
      cleanup();
      if (activeCleanups.has(wrappedCleanup)) {
        activeCleanups.delete(wrappedCleanup);
        activeEffects = Math.max(0, activeEffects - 1);
      }
    };
    activeCleanups.add(wrappedCleanup);
    const id = setTimeout(() => {
      loopTimers.delete(id);
      wrappedCleanup();
    }, durationMs);
    loopTimers.add(id);
    return true;
  }

  function cleanupAll() {
    for (const fn of Array.from(activeCleanups)) {
      try { fn(); } catch {}
    }
    activeCleanups.clear();
    activeEffects = 0;
  }

  function stopAll() {
    for (const id of Array.from(loopTimers)) clearTimer(id);
    loopTimers.clear();
    cleanupAll();
    body.classList.remove(ENGINE_CLASS);
    body.classList.remove(INCIDENT_ENGINE_CLASS);
  }

  function getLineTargets() {
    return [
      ...Array.from(document.querySelectorAll('#rightBlock1 .diag-line')),
      ...Array.from(document.querySelectorAll('#leftBlock2 .log-line.naked')),
      ...Array.from(document.querySelectorAll('#leftBlock3 .log-line.naked')),
    ].filter((el) => el && el.textContent && el.textContent.trim().length > 6);
  }

  function runTextCorruption(effectKey, durationMs) {
    const targets = [
      document.getElementById('feed1'),
      document.getElementById('topbarSensorPill'),
      document.querySelector('#rightBlock1 [data-diag-value="transient"]'),
      document.querySelector('#rightBlock1 [data-diag-value="density"]'),
      document.querySelector('#rightBlock1 [data-diag-value="anomaly"]'),
    ].filter((el) => el && el.textContent && el.textContent.trim().length > 3);
    const target = pickOne(rand, targets);
    if (!target) return;
    const original = String(target.textContent || '');
    if (!original) return;
    withEffect(effectKey, durationMs, () => {
      target.textContent = corruptOneChar(rand, original);
    }, () => {
      if (target?.isConnected) target.textContent = original;
    });
  }

  function runDiagnosticsCorruption(effectKey, durationMs) {
    const target = pickOne(rand, [
      document.querySelector('#rightBlock1 [data-diag-value="drift"]'),
      document.querySelector('#rightBlock1 [data-diag-value="coherence"]'),
      document.querySelector('#rightBlock1 [data-diag-value="density"]'),
      document.querySelector('#rightBlock1 [data-diag-value="anomaly"]'),
    ].filter(Boolean));
    if (!target) return;
    const original = String(target.textContent || '');
    if (!original) return;
    withEffect(effectKey, durationMs, () => {
      target.textContent = corruptOneChar(rand, original);
    }, () => {
      if (target?.isConnected) target.textContent = original;
    });
  }

  function runLineFlip(effectKey, durationMs) {
    const target = pickOne(rand, getLineTargets());
    if (!target) return;
    withEffect(effectKey, durationMs, () => target.classList.add(FLIP_CLASS), () => target.classList.remove(FLIP_CLASS));
  }

  function runLineFade(effectKey, durationMs) {
    const target = pickOne(rand, getLineTargets());
    if (!target) return;
    withEffect(effectKey, durationMs, () => target.classList.add(FADE_CLASS), () => target.classList.remove(FADE_CLASS));
  }

  function runSensorBurn(effectKey, durationMs) {
    const target = document.querySelector('#topbarSensorPill .hot');
    if (!target) return;
    withEffect(effectKey, durationMs, () => target.classList.add(SENSOR_BURN_CLASS), () => target.classList.remove(SENSOR_BURN_CLASS));
  }

  function runPhaseIconFlicker(effectKey, durationMs) {
    const target = document.getElementById('topbarStatusPhaseIcon');
    if (!target) return;
    withEffect(effectKey, durationMs, () => target.classList.add(PHASE_ICON_FLICKER_CLASS), () => target.classList.remove(PHASE_ICON_FLICKER_CLASS));
  }

  function runFeedEcho(effectKey, durationMs) {
    const target = document.getElementById('feed1');
    if (!target) return;
    const original = String(target.textContent || '');
    if (!original) return;
    withEffect(effectKey, durationMs, () => {
      target.textContent = `// ${corruptOneChar(rand, original)}`;
    }, () => {
      if (target?.isConnected) target.textContent = original;
    });
  }

  function runLinkGhost(effectKey, durationMs) {
    const targets = Array.from(document.querySelectorAll('#rightBlock2 a[href]'));
    if (!targets.length) return;
    const target = pickOne(rand, targets);
    if (!target) return;
    withEffect(effectKey, durationMs, () => target.classList.add(LINK_GHOST_CLASS), () => target.classList.remove(LINK_GHOST_CLASS));
  }

  function runNodeGhost(effectKey, durationMs) {
    const target = document.getElementById('topbarNodePill');
    if (!target) return;
    withEffect(effectKey, durationMs, () => target.classList.add(FADE_CLASS), () => target.classList.remove(FADE_CLASS));
  }

  function runAvailBlink(effectKey, durationMs) {
    const target = document.getElementById('avail');
    if (!target) return;
    const original = String(target.textContent || '');
    if (!original) return;
    withEffect(effectKey, durationMs, () => {
      target.textContent = original.replace(/\d/g, (d) => (d === '0' ? '8' : '0'));
    }, () => {
      if (target?.isConnected) target.textContent = original;
    });
  }

  function runSemanticCorruption(effectKey, durationMs) {
    const target = pickOne(rand, [
      document.querySelector('#rightBlock1 [data-diag-value="drift"]'),
      document.querySelector('#rightBlock1 [data-diag-value="coherence"]'),
      document.querySelector('#rightBlock1 [data-diag-value="density"]'),
      document.querySelector('#rightBlock1 [data-diag-value="anomaly"]'),
      document.querySelector('#rightBlock1 [data-diag-value="transient"]'),
    ].filter(Boolean));
    if (!target) return;
    const original = String(target.textContent || '');
    if (!original) return;
    const corrupted = pickOne(rand, ['+INF', 'NaN', '????', '-847 YEARS', 'OVERFLOW', 'NULL']);
    withEffect(effectKey, durationMs, () => {
      target.textContent = corrupted;
    }, () => {
      if (target?.isConnected) target.textContent = original;
    });
  }

  function runStatusContradiction(effectKey, durationMs) {
    const phaseEl = document.querySelector('#rightBlock1 [data-diag-value="phase"]');
    const transientEl = document.querySelector('#rightBlock1 [data-diag-value="transient"]');
    if (!phaseEl && !transientEl) return;
    const phaseOriginal = String(phaseEl?.textContent || '');
    const transientOriginal = String(transientEl?.textContent || '');
    withEffect(effectKey, durationMs, () => {
      if (phaseEl) phaseEl.textContent = pickOne(rand, ['NOMINAL', 'STABLE', 'CALM']);
      if (transientEl) transientEl.textContent = pickOne(rand, [
        'SYSTEM HEALTH: OK',
        'COHERENCE LOCK ACQUIRED',
        'RECOVERY: NOT REQUIRED',
      ]);
    }, () => {
      if (phaseEl?.isConnected && phaseOriginal) phaseEl.textContent = phaseOriginal;
      if (transientEl?.isConnected && transientOriginal) transientEl.textContent = transientOriginal;
    });
  }

  const effectHandlers = Object.freeze({
    text_corrupt: runTextCorruption,
    diag_corrupt: runDiagnosticsCorruption,
    line_flip: runLineFlip,
    line_fade: runLineFade,
    sensor_burn: runSensorBurn,
    phase_flicker: runPhaseIconFlicker,
    feed_echo: runFeedEcho,
    link_ghost: runLinkGhost,
    node_ghost: runNodeGhost,
    avail_blink: runAvailBlink,
    semantic_corrupt: runSemanticCorruption,
    status_contradiction: runStatusContradiction,
  });

  const recipePool = buildRecipePool(baseEffects);
  const sessionRecipes = pickUnique(rand, recipePool, Math.min(SESSION_RECIPE_COUNT, recipePool.length));
  body.dataset.unstableRecipePool = String(recipePool.length);
  body.dataset.incidentRecipePool = String(incidentRecipes.length);

  function scheduleRecipe(recipe, targetPhase) {
    const handler = effectHandlers[recipe.key];
    if (!handler) return;
    const step = () => {
      if (phase !== targetPhase) return;
      handler(recipe.key, recipe.durationMs);
      const id = setTimeout(() => {
        loopTimers.delete(id);
        step();
      }, recipe.intervalMs);
      loopTimers.add(id);
    };
    const firstId = setTimeout(() => {
      loopTimers.delete(firstId);
      step();
    }, recipe.initialBiasMs + randInt(rand, 0, 900));
    loopTimers.add(firstId);
  }

  function startUnstable() {
    stopAll();
    body.classList.add(ENGINE_CLASS);
    sessionRecipes.forEach((recipe) => scheduleRecipe(recipe, PHASES.UNSTABLE));
  }

  function startIncident() {
    stopAll();
    body.classList.add(INCIDENT_ENGINE_CLASS);
    incidentClockTs = Date.now() - randInt(rand, 3000, 24000);
    incidentRecipes.forEach((recipe) => scheduleRecipe(recipe, PHASES.INCIDENT));
  }

  function setPhase(nextRaw) {
    const next = normalizePhase(nextRaw);
    if (next === phase) return;
    phase = next;
    if (phase === PHASES.UNSTABLE) {
      startUnstable();
      return;
    }
    if (phase === PHASES.INCIDENT) {
      startIncident();
      return;
    }
    stopAll();
  }

  bus.on('system:phase', (payload) => {
    setPhase(payload?.phase);
  });

  bus.on('tick', (payload) => {
    if (!clockEl) return;
    const ts = Number(payload?.ts);
    const nowTs = Number.isFinite(ts) ? ts : Date.now();
    if (phase === PHASES.UNSTABLE && profile.reverseClock) {
      const stepMs = rand() < profile.reverseStepJitterChance ? 2000 : 1000;
      reverseClockTs = Math.min(reverseClockTs, nowTs) - stepMs;
      const d = new Date(reverseClockTs);
      const h = String(Math.abs(d.getHours())).padStart(2, '0');
      const m = String(Math.abs(d.getMinutes())).padStart(2, '0');
      const s = String(Math.abs(d.getSeconds())).padStart(2, '0');
      clockEl.textContent = `${h}:${m}:${s}`;
      return;
    }
    if (phase === PHASES.INCIDENT) {
      // Incident breaks temporal trust: freeze, jump, and contradictory time direction.
      if (rand() < 0.16) return;
      if (rand() < 0.09) incidentClockTs += randInt(rand, 5000, 26000);
      else if (rand() < 0.19) incidentClockTs -= randInt(rand, 3000, 18000);
      else incidentClockTs += (rand() < 0.5 ? 1000 : -1000) * (rand() < 0.3 ? 2 : 1);
      const d = new Date(incidentClockTs);
      const h = String(Math.abs(d.getHours())).padStart(2, '0');
      const m = String(Math.abs(d.getMinutes())).padStart(2, '0');
      const s = String(Math.abs(d.getSeconds())).padStart(2, '0');
      clockEl.textContent = `${h}:${m}:${s}`;
      return;
    }
    // In nominal we leave clock ownership to tick.js default update.
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    if (phase === PHASES.UNSTABLE) startUnstable();
    if (phase === PHASES.INCIDENT) startIncident();
  });

  if (phase === PHASES.UNSTABLE) startUnstable();
  if (phase === PHASES.INCIDENT) startIncident();

  if (window.location.search.includes('debug=anomaly')) {
    // Dev-only runtime introspection.
    window.OX500_ANOMALY_METRICS = {
      get phase() { return phase; },
      get activeEffects() { return activeEffects; },
      get maxActiveByPhase() { return { ...MAX_ACTIVE_EFFECTS_BY_PHASE }; },
      get totalRecipes() { return recipePool.length; },
      get sessionRecipes() { return sessionRecipes.map((r) => r.id); },
      get recipeKeys() { return sessionRecipes.map((r) => r.key); },
      get incidentRecipes() { return incidentRecipes.map((r) => r.id); },
      get unstableRecipePool() { return body.dataset.unstableRecipePool || '0'; },
      get incidentRecipePool() { return body.dataset.incidentRecipePool || '0'; },
      get cooldowns() { return { ...EFFECT_COOLDOWN_MS }; },
    };
  }
}
