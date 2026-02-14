// === MOBILE LOGS — GESTURES ===
// Handles touch events: swipe left/right to navigate,
// tap left/right half for prev/next, tap title for disruption list.

import { GESTURE_CONFIG } from './config.js';
import { renderDisruptionList, renderEntry } from './renderer.js';
import {
  isLoaded,
  ensureLoaded,
  getOrderedIds,
  getLogsById,
  resolveCurrentIndex,
  loadPage,
  maxLoadedPage,
  minLoadedPage,
  getState,
} from './store.js';

// === HELPERS ===

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
  renderEntry(els, mobileQuery, getLogsById().get(nextId), stampEl, recentLogsRoot, updateControls);
}

// === TOUCH EVENT HANDLERS ===

export function buildTouchHandlers(els, mobileQuery, stampEl, recentLogsRoot, updateControls, getCurrentEntry) {
  const { panel, textEl } = els;

  let startX = 0;
  let startY = 0;
  let startAt = 0;
  let trackingTouch = false;

  function onTouchStart(e) {
    if (!mobileQuery.matches || !e.touches || e.touches.length !== 1) return;
    const touch = e.touches[0];
    startX = touch.clientX;
    startY = touch.clientY;
    startAt = Date.now();
    trackingTouch = true;

    const title = e.target?.closest?.('.mobile-active-log-title');
    if (title) title.classList.add('is-pressed');
  }

  function onTouchEnd(e) {
    if (!trackingTouch || !mobileQuery.matches || !isLoaded()) return;
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
      return;
    }

    // In non-entry modes — swipe/tap do nothing (let native scroll work)
    const viewMode = textEl.dataset.viewMode;
    if (viewMode === 'disruption-list' || viewMode === 'scan') return;

    // Tap (small movement, short time) → navigate by panel half
    if (
      elapsed <= GESTURE_CONFIG.TAP_MAX_MS &&
      Math.abs(deltaX) <= GESTURE_CONFIG.TAP_MAX_MOVE &&
      Math.abs(deltaY) <= GESTURE_CONFIG.TAP_MAX_MOVE &&
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
