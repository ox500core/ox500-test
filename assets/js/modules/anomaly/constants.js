export const PHASES = Object.freeze({
  NOMINAL: 'NOMINAL',
  UNSTABLE: 'UNSTABLE',
  INCIDENT: 'INCIDENT',
});

export const MAX_ACTIVE_EFFECTS_BY_PHASE = Object.freeze({
  [PHASES.UNSTABLE]: 3,
  [PHASES.INCIDENT]: 4,
});

export const RECIPE_POOL_TARGET = 100;
export const SESSION_RECIPE_COUNT = 14;

export const EFFECT_COOLDOWN_MS = Object.freeze({
  text_corrupt: 1600,
  diag_corrupt: 1900,
  line_flip: 2400,
  line_fade: 2100,
  sensor_burn: 2800,
  phase_flicker: 2200,
  feed_echo: 3000,
  link_ghost: 3200,
  node_ghost: 2800,
  avail_blink: 2600,
  semantic_corrupt: 1200,
  status_contradiction: 1800,
});

export const CSS_CLASSES = Object.freeze({
  FLIP_CLASS: 'anomaly-flip-line',
  FADE_CLASS: 'anomaly-fade-line',
  SENSOR_BURN_CLASS: 'anomaly-sensor-burn',
  PHASE_ICON_FLICKER_CLASS: 'anomaly-phase-icon-flicker',
  LINK_GHOST_CLASS: 'anomaly-link-ghost',
  ENGINE_CLASS: 'phase-unstable-anomaly-live',
  INCIDENT_ENGINE_CLASS: 'phase-incident-anomaly-live',
});

export const CORRUPT_CHAR_MAP = Object.freeze({
  A: '@', B: '8', C: '(', D: '|)', E: '3', F: 'f', G: '6', H: '#', I: '1', J: ']',
  K: '|<', L: '|_', M: '/\\/\\', N: '/\\/', O: '0', P: '|*', Q: '0_', R: '|2', S: '$',
  T: '+', U: '|_|', V: '\\/', W: '\\/\\/', X: '><', Y: '`/', Z: '2',
});
