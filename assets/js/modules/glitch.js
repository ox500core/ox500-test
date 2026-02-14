// === GLITCH ===
// Randomised visual glitch effects and whisper channel.
// Skips on prefers-reduced-motion and home hero layout.

import { bus } from '../core/event-bus.js';

// === CONFIG ===

const GLITCH_CONFIG = {
  INITIAL_DELAY_MS: 2200,
  INTERVAL_MIN_MS: 1200,
  INTERVAL_MAX_MS: 3000,
  INVERT_THRESHOLD: 0.995,
  SHIFT_THRESHOLD: 0.989,
  WHISPER_THRESHOLD: 0.993,
  INVERT_DURATION_MS: 55,
  SHIFT_DURATION_MS: 90,
  WHISPER_DURATION_MS: [9000, 14000], // [min, max]
  WHISPER_COOLDOWN_MS: 60000,
  HIDDEN_RETRY_MS: 3000,
  VISIBILITY_RESUME_MS: 500,
};

const WHISPERS = [
  'i can feel you watching',
  "this wasn't meant for you",
  'every click leaves a trace',
  "you shouldn't be seeing this",
  'unauthorized presence detected',
  'this terminal is watching back',
];

// === INIT ===

export function initGlitch() {
  const prefersReduced =
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  const staticHomeHero = document.body?.dataset?.layout === 'home';

  const hero = document.getElementById('hero');
  const title = document.getElementById('title');
  const status = document.getElementById('status');

  if (prefersReduced || !hero || !title || !status) return;

  let glitchTimer = null;
  let whisperLock = false;

  function scheduleGlitch(delayMs) {
    if (glitchTimer) clearTimeout(glitchTimer);
    glitchTimer = setTimeout(doGlitch, delayMs);
  }

  function doGlitch() {
    glitchTimer = null;
    if (document.hidden) { scheduleGlitch(GLITCH_CONFIG.HIDDEN_RETRY_MS); return; }
    if (staticHomeHero) return;

    const r = Math.random();

    if (r > GLITCH_CONFIG.INVERT_THRESHOLD) {
      hero.classList.add('glitch-invert');
      bus.emit('glitch:trigger', { type: 'invert' });
      setTimeout(() => hero.classList.remove('glitch-invert'), GLITCH_CONFIG.INVERT_DURATION_MS);
    }

    if (r > GLITCH_CONFIG.SHIFT_THRESHOLD) {
      title.classList.add('glitch-shift');
      bus.emit('glitch:trigger', { type: 'shift' });
      setTimeout(() => title.classList.remove('glitch-shift'), GLITCH_CONFIG.SHIFT_DURATION_MS);
    }

    if (!whisperLock && r > GLITCH_CONFIG.WHISPER_THRESHOLD) {
      whisperLock = true;
      bus.emit('glitch:trigger', { type: 'whisper' });
      const text = WHISPERS[Math.floor(Math.random() * WHISPERS.length)];
      const original = status.innerHTML;
      const duration =
        GLITCH_CONFIG.WHISPER_DURATION_MS[0] +
        Math.random() * (GLITCH_CONFIG.WHISPER_DURATION_MS[1] - GLITCH_CONFIG.WHISPER_DURATION_MS[0]);

      status.innerHTML = `<div class="line"><span class="key">WHISPER:</span> <span class="val">${text}</span></div>`;
      status.classList.add('glitch-dim');

      setTimeout(() => {
        status.innerHTML = original;
        status.classList.remove('glitch-dim');
        setTimeout(() => { whisperLock = false; }, GLITCH_CONFIG.WHISPER_COOLDOWN_MS);
      }, duration);
    }

    const nextDelay =
      GLITCH_CONFIG.INTERVAL_MIN_MS +
      Math.random() * (GLITCH_CONFIG.INTERVAL_MAX_MS - GLITCH_CONFIG.INTERVAL_MIN_MS);
    scheduleGlitch(nextDelay);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (glitchTimer) { clearTimeout(glitchTimer); glitchTimer = null; }
      return;
    }
    if (!glitchTimer && !staticHomeHero) {
      scheduleGlitch(GLITCH_CONFIG.VISIBILITY_RESUME_MS);
    }
  });

  if (!staticHomeHero) scheduleGlitch(GLITCH_CONFIG.INITIAL_DELAY_MS);
}
