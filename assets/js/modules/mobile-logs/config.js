// === MOBILE LOGS — CONFIG ===
// All constants in one place. Change here, works everywhere.

export const GESTURE_CONFIG = Object.freeze({
  SWIPE_MIN_X: 50,
  SWIPE_MAX_Y: 70,
  SWIPE_MAX_MS: 700,
  TAP_MAX_MOVE: 14,
  TAP_MAX_MS: 450,
});

export const SCAN_CONFIG = Object.freeze({
  MAX_RESULTS: 80,
  DEEP_SEARCH_ENABLED: false,
  DEEP_SEARCH_MIN_CHARS: 4,
  DEBOUNCE_MS: 120,
});

export const MOBILE_BREAKPOINT = '(max-width: 980px)';
