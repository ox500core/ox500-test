import { PHASES, CORRUPT_CHAR_MAP, RECIPE_POOL_TARGET } from './constants.js';

export function normalizePhase(value) {
  const phase = String(value || '').trim().toUpperCase();
  if (phase === PHASES.UNSTABLE) return PHASES.UNSTABLE;
  if (phase === PHASES.INCIDENT) return PHASES.INCIDENT;
  return PHASES.NOMINAL;
}

export function createSeededRng(seedBase) {
  let state = (seedBase >>> 0) || 1;
  return function rand() {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return ((state >>> 0) % 10000) / 10000;
  };
}

export function pickOne(rand, list) {
  if (!list.length) return null;
  return list[Math.floor(rand() * list.length)] || null;
}

export function randInt(rand, min, max) {
  return Math.round(min + ((max - min) * rand()));
}

export function pickUnique(rand, list, count) {
  const pool = list.slice();
  const out = [];
  while (pool.length && out.length < count) {
    const idx = Math.floor(rand() * pool.length);
    out.push(pool[idx]);
    pool.splice(idx, 1);
  }
  return out;
}

export function corruptOneChar(rand, text) {
  const chars = [];
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (/[A-Za-z]/.test(c)) chars.push({ i, c });
  }
  if (!chars.length) return text;
  const pick = chars[Math.floor(rand() * chars.length)];
  const upper = pick.c.toUpperCase();
  const replBase = CORRUPT_CHAR_MAP[upper] || pick.c;
  const repl = pick.c === upper ? replBase : replBase.toLowerCase();
  return `${text.slice(0, pick.i)}${repl}${text.slice(pick.i + 1)}`;
}

function clampMs(v, min, max) {
  return Math.max(min, Math.min(max, Math.round(v)));
}

export function buildRecipePool(baseEffects) {
  const tempoMultipliers = [0.76, 0.88, 1, 1.15, 1.34];
  const holdMultipliers = [0.72, 0.9, 1, 1.16];
  const startBiasMs = [480, 860, 1240, 1680, 2140];
  const out = [];
  let serial = 1;

  for (const effect of baseEffects) {
    for (const tempo of tempoMultipliers) {
      for (const hold of holdMultipliers) {
        for (const bias of startBiasMs) {
          if (out.length >= RECIPE_POOL_TARGET) return out;
          const intervalMs = clampMs(effect.intervalMs * tempo, 1400, 22000);
          const durationMs = clampMs(effect.durationMs * hold, 900, 6400);
          out.push({
            id: `A${String(serial).padStart(3, '0')}`,
            key: effect.key,
            intervalMs,
            durationMs,
            initialBiasMs: bias,
          });
          serial += 1;
        }
      }
    }
  }
  return out;
}
