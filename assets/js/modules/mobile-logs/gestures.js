// === MOBILE LOGS — GESTURES ===
// Handles touch events: swipe left/right to navigate,
// tap left/right half for prev/next, tap title for disruption list.

import { GESTURE_CONFIG } from './config.js';
import {
  renderDisruptionList,
  renderEntry,
  getCurrentEntry,
  disruptionKey,
  setLogStamp,
} from './renderer.js';
import {
  isLoaded,
  ensureLoaded,
  getLogs,
  getOrderedIds,
  getLogsById,
  resolveCurrentIndex,
  setCurrentEntryId,
  setFromSearch,
  isFromDisruption,
  loadPage,
  maxLoadedPage,
  minLoadedPage,
  getState,
  maybePrefetchAroundListIndex,
} from './store.js';

// === HELPERS ===

function normalizedId(value) {
  return String(value || '').replace(/\D/g, '');
}

function numericId(value) {
  return Number(normalizedId(value));
}

function sortEntriesByIdAsc(entries) {
  return entries.slice().sort((a, b) => numericId(a?.id) - numericId(b?.id));
}

function vibrateTap(mobileQuery, ms = 10) {
  try {
    if (!mobileQuery.matches) return;
    if (typeof navigator?.vibrate !== 'function') return;
    navigator.vibrate(ms);
  } catch (_) {}
}

function isInteractiveTarget(target) {
  if (!target?.closest) return false;
  return Boolean(target.closest(
    'a,button,input,textarea,select,label,summary,details,' +
    '[data-no-log-tap],.mobile-active-log-title,.mobile-disruption-item',
  ));
}

// === STEP NAVIGATION ===

export async function stepBy(
  direction,
  els,
  mobileQuery,
  stampEl,
  recentLogsRoot,
  updateControls,
) {
  if (els?.textEl?.dataset?.viewMode === 'disruption-list') {
    const buildDisruptionState = () => {
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
    };

    let currentState = buildDisruptionState();
    if (!currentState) return;

    void maybePrefetchAroundListIndex(currentState.currentDisruptionIndex, currentState.disruptionOrder.length, 10);

    let targetDisruptionIndex = currentState.currentDisruptionIndex + direction;
    if (targetDisruptionIndex < 0 || targetDisruptionIndex >= currentState.disruptionOrder.length) {
      await maybePrefetchAroundListIndex(currentState.currentDisruptionIndex, currentState.disruptionOrder.length, 10);
      currentState = buildDisruptionState();
      if (!currentState) return;
      targetDisruptionIndex = currentState.currentDisruptionIndex + direction;
      if (targetDisruptionIndex < 0 || targetDisruptionIndex >= currentState.disruptionOrder.length) return;
    }

    const targetKey = currentState.disruptionOrder[targetDisruptionIndex];
    const target = currentState.newestByKey.get(targetKey);
    if (!target?.entry) return;

    const targetId = normalizedId(target.entry.id);
    if (targetId) {
      setCurrentEntryId(targetId);
      if (document.body) document.body.dataset.logLevel = targetId;
    }
    setLogStamp(stampEl, target.entry?.id || '----', target.entry?.date || '----');

    renderDisruptionList(els, mobileQuery, target.entry, stampEl);
    updateControls();
    return;
  }

  if (isFromDisruption()) {
    const buildDisruptionEntryList = () => {
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
    };

    const state = getState();
    let disruptionState = buildDisruptionEntryList();
    if (!disruptionState) return;

    let targetIdx = disruptionState.currentIdx + direction;
    if (targetIdx < 0 || targetIdx >= disruptionState.list.length) {
      if (direction < 0) {
        const olderPage = maxLoadedPage() + 1;
        if (olderPage <= state.totalPages) await loadPage(olderPage);
      } else if (direction > 0) {
        const newerPage = minLoadedPage() - 1;
        if (newerPage >= 1) await loadPage(newerPage);
      }

      disruptionState = buildDisruptionEntryList();
      if (!disruptionState) return;
      targetIdx = disruptionState.currentIdx + direction;
      if (targetIdx < 0 || targetIdx >= disruptionState.list.length) return;
    }

    const targetEntry = disruptionState.list[targetIdx];
    if (!targetEntry) return;
    setFromSearch(false);
    renderEntry(els, mobileQuery, targetEntry, stampEl, recentLogsRoot, updateControls);
    return;
  }

  const state = getState();
  let currentIndex = resolveCurrentIndex(stampEl);
  if (currentIndex < 0) return;

  let nextIndex = currentIndex + direction;

  if (nextIndex < 0) {
    const olderPage = maxLoadedPage() + 1;
    if (olderPage <= state.totalPages) {
      const ok = await loadPage(olderPage);
      if (ok) {
        currentIndex = resolveCurrentIndex(stampEl);
        nextIndex = currentIndex + direction;
      }
    }
  } else if (nextIndex >= getOrderedIds().length) {
    const newerPage = minLoadedPage() - 1;
    if (newerPage >= 1) {
      const ok = await loadPage(newerPage);
      if (ok) {
        currentIndex = resolveCurrentIndex(stampEl);
        nextIndex = currentIndex + direction;
      }
    }
  }

  if (nextIndex < 0 || nextIndex >= getOrderedIds().length) return;
  const nextId = getOrderedIds()[nextIndex];
  setFromSearch(false);
  renderEntry(els, mobileQuery, getLogsById().get(nextId), stampEl, recentLogsRoot, updateControls);
}

// === TOUCH EVENT HANDLERS ===

export function buildTouchHandlers(els, mobileQuery, stampEl, recentLogsRoot, updateControls, getCurrentEntry) {
  const { panel, textEl } = els;
  const tabletLandscapeQuery = (typeof window.matchMedia === 'function')
    ? window.matchMedia('(min-width: 981px) and (max-width: 1400px) and (orientation: landscape) and (hover: none) and (pointer: coarse)')
    : null;

  function gesturesEnabled() {
    return Boolean(mobileQuery?.matches || tabletLandscapeQuery?.matches);
  }

  let startX = 0;
  let startY = 0;
  let startAt = 0;
  let trackingTouch = false;

  function onTouchStart(e) {
    if (!gesturesEnabled() || !e.touches || e.touches.length !== 1) return;
    const touch = e.touches[0];
    startX = touch.clientX;
    startY = touch.clientY;
    startAt = Date.now();
    trackingTouch = true;

    const title = e.target?.closest?.('.mobile-active-log-title');
    if (title) title.classList.add('is-pressed');
  }

  function onTouchEnd(e) {
    if (!trackingTouch || !gesturesEnabled() || !isLoaded()) return;
    trackingTouch = false;
    panel.querySelectorAll('.mobile-active-log-title.is-pressed')
      .forEach((el) => el.classList.remove('is-pressed'));

    const touch = e.changedTouches?.[0];
    if (!touch) return;

    const deltaX = touch.clientX - startX;
    const deltaY = touch.clientY - startY;
    const elapsed = Date.now() - startAt;
    const target = e.target;

    // Tap on disruption title → show disruption list
    if (target?.closest?.('.mobile-active-log-title')) {
      vibrateTap(mobileQuery, 10);
      renderDisruptionList(els, mobileQuery, getCurrentEntry(), stampEl);
      updateControls();
      return;
    }

    // In scan mode — swipe/tap do nothing (let native scroll work)
    const viewMode = textEl.dataset.viewMode;
    if (viewMode === 'scan') return;

    // Tap (small movement, short time) → navigate by panel half
    if (
      elapsed <= GESTURE_CONFIG.TAP_MAX_MS &&
      Math.abs(deltaX) <= GESTURE_CONFIG.TAP_MAX_MOVE &&
      Math.abs(deltaY) <= GESTURE_CONFIG.TAP_MAX_MOVE &&
      viewMode !== 'disruption-list' &&
      !isInteractiveTarget(target)
    ) {
      const selection = window.getSelection ? window.getSelection() : null;
      if (selection && String(selection).trim()) return;

      const rect = panel.getBoundingClientRect();
      stepBy(
        touch.clientX - rect.left < rect.width / 2 ? -1 : 1,
        els, mobileQuery, stampEl, recentLogsRoot, updateControls,
      );
      return;
    }

    // Swipe
    if (elapsed > GESTURE_CONFIG.SWIPE_MAX_MS) return;
    if (Math.abs(deltaX) < GESTURE_CONFIG.SWIPE_MIN_X) return;
    if (Math.abs(deltaY) > GESTURE_CONFIG.SWIPE_MAX_Y) return;

    stepBy(deltaX > 0 ? -1 : 1, els, mobileQuery, stampEl, recentLogsRoot, updateControls);
  }

  function onTouchCancel() {
    trackingTouch = false;
    panel.querySelectorAll('.mobile-active-log-title.is-pressed')
      .forEach((el) => el.classList.remove('is-pressed'));
  }

  return { onTouchStart, onTouchEnd, onTouchCancel };
}

// === REGISTER LISTENERS ===

export function initGestureListeners(els, mobileQuery, stampEl, recentLogsRoot, updateControls, getCurrentEntry) {
  const { panel, prevBtn, nextBtn } = els;

  const { onTouchStart, onTouchEnd, onTouchCancel } = buildTouchHandlers(
    els, mobileQuery, stampEl, recentLogsRoot, updateControls, getCurrentEntry,
  );

  panel.addEventListener('touchstart', onTouchStart, { passive: true });
  panel.addEventListener('touchend', onTouchEnd, { passive: true });
  panel.addEventListener('touchcancel', onTouchCancel, { passive: true });

  if (prevBtn) {
    prevBtn.addEventListener('click', async () => {
      await ensureLoaded();
      if (!isLoaded()) return;
      stepBy(-1, els, mobileQuery, stampEl, recentLogsRoot, updateControls);
    }, { passive: true });
  }

  if (nextBtn) {
    nextBtn.addEventListener('click', async () => {
      await ensureLoaded();
      if (!isLoaded()) return;
      stepBy(1, els, mobileQuery, stampEl, recentLogsRoot, updateControls);
    }, { passive: true });
  }
}
