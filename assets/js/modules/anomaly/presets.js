import { randInt } from './utils.js';

export function createAnomalyPresets(rand) {
  const profile = Object.freeze({
    reverseClock: true,
    reverseStepJitterChance: 0.2,
    reverseClockOffsetSec: randInt(rand, 140, 820),
  });

  const baseEffects = [
    { key: 'text_corrupt', intervalMs: randInt(rand, 2300, 4200), durationMs: randInt(rand, 1400, 3000) },
    { key: 'diag_corrupt', intervalMs: randInt(rand, 3800, 7200), durationMs: randInt(rand, 1200, 2600) },
    { key: 'line_flip', intervalMs: randInt(rand, 7400, 12200), durationMs: randInt(rand, 2200, 4300) },
    { key: 'line_fade', intervalMs: randInt(rand, 5200, 9800), durationMs: randInt(rand, 1800, 3800) },
    { key: 'sensor_burn', intervalMs: randInt(rand, 8200, 14000), durationMs: randInt(rand, 1400, 2800) },
    { key: 'phase_flicker', intervalMs: randInt(rand, 6200, 11400), durationMs: randInt(rand, 900, 2100) },
    { key: 'feed_echo', intervalMs: randInt(rand, 9200, 16000), durationMs: randInt(rand, 1500, 3000) },
    { key: 'link_ghost', intervalMs: randInt(rand, 10800, 18000), durationMs: randInt(rand, 1600, 3400) },
    { key: 'node_ghost', intervalMs: randInt(rand, 8400, 14600), durationMs: randInt(rand, 1300, 2800) },
    { key: 'avail_blink', intervalMs: randInt(rand, 9800, 17000), durationMs: randInt(rand, 1000, 2200) },
  ];

  const incidentRecipes = Object.freeze([
    { id: 'I001', key: 'semantic_corrupt', intervalMs: 1900, durationMs: 2600, initialBiasMs: 440 },
    { id: 'I002', key: 'status_contradiction', intervalMs: 3200, durationMs: 3200, initialBiasMs: 960 },
    { id: 'I003', key: 'diag_corrupt', intervalMs: 2800, durationMs: 2400, initialBiasMs: 720 },
    { id: 'I004', key: 'feed_echo', intervalMs: 3600, durationMs: 2200, initialBiasMs: 1240 },
    { id: 'I005', key: 'phase_flicker', intervalMs: 2400, durationMs: 1600, initialBiasMs: 680 },
    { id: 'I006', key: 'line_fade', intervalMs: 4200, durationMs: 2400, initialBiasMs: 1320 },
    { id: 'I007', key: 'sensor_burn', intervalMs: 4600, durationMs: 2200, initialBiasMs: 1540 },
    { id: 'I008', key: 'text_corrupt', intervalMs: 2600, durationMs: 2100, initialBiasMs: 860 },
  ]);

  return { profile, baseEffects, incidentRecipes };
}
