// === MOBILE LOGS - NAVIGATION HELPERS ===
// Pure navigation data helpers used by gestures module.

import { disruptionKey, getCurrentEntry, setLogStamp } from './renderer.js';
import {
  getLogs,
  maxLoadedPage,
  minLoadedPage,
  getState,
  loadPage,
} from './store.js';

function normalizedId(value) {
  return String(value || '').replace(/\D/g, '');
}

function numericId(value) {
  return Number(normalizedId(value));
}

function sortEntriesByIdAsc(entries) {
  return entries.slice().sort((a, b) => numericId(a?.id) - numericId(b?.id));
}

export function buildDisruptionState(stampEl) {
  const currentEntry = getCurrentEntry(stampEl);
  const currentKey = disruptionKey(currentEntry);
  if (!currentKey) return null;

  const newestByKey = new Map();
  getLogs().forEach((entry) => {
    const key = disruptionKey(entry);
    if (!key) return;
    const idNum = numericId(entry?.id);
    const prev = newestByKey.get(key);
    if (!prev || idNum > prev.idNum) {
      newestByKey.set(key, { idNum, entry });
    }
  });

  const disruptionOrder = Array.from(newestByKey.entries())
    .sort((a, b) => a[1].idNum - b[1].idNum)
    .map(([key]) => key);

  const currentDisruptionIndex = disruptionOrder.indexOf(currentKey);
  if (currentDisruptionIndex < 0) return null;

  return { newestByKey, disruptionOrder, currentDisruptionIndex };
}

export function buildDisruptionEntryList(stampEl) {
  const currentEntry = getCurrentEntry(stampEl);
  const currentKey = disruptionKey(currentEntry);
  if (!currentEntry || !currentKey) return null;

  const list = getLogs()
    .filter((entry) => disruptionKey(entry) === currentKey)
    .slice();
  const sortedList = sortEntriesByIdAsc(list);

  if (!sortedList.length) return null;
  const currentId = normalizedId(currentEntry?.id);
  const currentIdx = sortedList.findIndex((entry) => normalizedId(entry?.id) === currentId);
  if (currentIdx < 0) return null;
  return { list: sortedList, currentIdx };
}

export function applyDisruptionListTarget(targetEntry, stampEl, setCurrentEntryIdFn) {
  if (!targetEntry) return;
  const targetId = normalizedId(targetEntry.id);
  if (targetId) {
    setCurrentEntryIdFn(targetId);
    if (document.body) document.body.dataset.logLevel = targetId;
  }
  setLogStamp(stampEl, targetEntry?.id || '----', targetEntry?.date || '----');
}

export async function maybeLoadAdjacentPageForDirection(direction) {
  const state = getState();
  if (direction < 0) {
    const olderPage = maxLoadedPage() + 1;
    if (olderPage <= state.totalPages) await loadPage(olderPage);
    return;
  }
  if (direction > 0) {
    const newerPage = minLoadedPage() - 1;
    if (newerPage >= 1) await loadPage(newerPage);
  }
}
